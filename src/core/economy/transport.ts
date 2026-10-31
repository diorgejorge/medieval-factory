import { TICKS_PER_SECOND } from '../config';
import type { Rotation } from '../world/buildings';
import type { Grid } from '../world/grid';

/** Menor distância entre dois itens no mesmo segmento (4 itens por tile). */
export const ITEM_SPACING = 0.25;

/** Para onde cada rotação aponta: 0 = sul, 1 = oeste, 2 = norte, 3 = leste (sentido horário). */
export const DIRECTIONS: Readonly<Record<Rotation, { dx: number; dy: number }>> = {
  0: { dx: 0, dy: 1 },
  1: { dx: -1, dy: 0 },
  2: { dx: 0, dy: -1 },
  3: { dx: 1, dy: 0 },
};

export interface TransportDef {
  /** Tiles por segundo. */
  speed: number;
  /** Calha: só passa o item para um tile igual ou mais baixo. */
  gravity: boolean;
  /** Quanto o item pode subir de um tile para o seguinte (sem o campo, sem limite). Guincho: sobe o relevo. */
  climb?: number;
  /** Divisor reparte entre frente, esquerda e direita; filtro manda o item escolhido em frente e os outros para os lados. */
  sort?: TransportSort;
}

export type TransportSort = 'split' | 'filter';

export interface SegmentItem {
  item: string;
  /** Posição no tile, de 0 (entrada) a 1 (saída). */
  t: number;
}

export interface SegmentView {
  id: number;
  x: number;
  y: number;
  rotation: Rotation;
  items: SegmentItem[];
  /** Só no filtro: o item que segue em frente (null até o primeiro item passar). */
  filter?: string | null;
}

/**
 * Um tile de calha ou esteira: fila de itens andando na direção da rotação.
 * Itens não são entidades: só a fila do segmento avança (custo por segmento, não por item).
 */
export class Segment {
  /** Ordenados da saída (t maior) para a entrada. */
  readonly items: SegmentItem[] = [];
  /** Filtro: item que segue em frente. Sem escolha, o primeiro que chegar vira o filtro. */
  filter: string | null = null;
  /** Divisor e filtro: próxima saída a tentar, para repartir por igual. */
  turn = 0;

  constructor(
    readonly id: number,
    readonly x: number,
    readonly y: number,
    readonly rotation: Rotation,
    readonly def: TransportDef,
  ) {}

  get next(): { x: number; y: number } {
    const { dx, dy } = DIRECTIONS[this.rotation];
    return { x: this.x + dx, y: this.y + dy };
  }

  /** Cabe mais um item na entrada? */
  canAccept(): boolean {
    const last = this.items[this.items.length - 1];
    return !last || last.t >= ITEM_SPACING;
  }

  push(item: string): boolean {
    if (!this.canAccept()) return false;
    this.items.push({ item, t: 0 });
    return true;
  }

  /** Tiles para onde o item da frente pode sair, na ordem de tentativa. */
  exits(item: string): { x: number; y: number }[] {
    const ahead = this.next;
    if (!this.def.sort) return [ahead];
    const sides = [this.side(1), this.side(3)];
    if (this.def.sort === 'filter') {
      this.filter ??= item;
      if (item === this.filter) return [ahead];
      return this.turn % 2 === 0 ? sides : [sides[1] ?? ahead, sides[0] ?? ahead];
    }
    const all = [ahead, ...sides];
    const start = this.turn % all.length;
    return [...all.slice(start), ...all.slice(0, start)];
  }

  /** Tile ao lado: `quarter` 1 = direita de quem anda, 3 = esquerda. */
  private side(quarter: 1 | 3): { x: number; y: number } {
    const { dx, dy } = DIRECTIONS[((this.rotation + quarter) % 4) as Rotation];
    return { x: this.x + dx, y: this.y + dy };
  }

  view(): SegmentView {
    const view: SegmentView = { id: this.id, x: this.x, y: this.y, rotation: this.rotation, items: this.items.map((i) => ({ ...i })) };
    if (this.def.sort === 'filter') view.filter = this.filter;
    return view;
  }
}

/** Para onde vai o item que chega ao fim de um segmento: outro segmento ou uma construção. */
export type Receiver = (x: number, y: number, item: string) => boolean;

/**
 * Rede de calhas e esteiras. A cada tick, cada fila anda; o primeiro item, ao chegar no fim,
 * passa para o próximo segmento (ou construção) se houver espaço, senão a fila para atrás dele.
 */
export class TransportNetwork {
  private readonly byTile = new Map<number, Segment>();
  /** Ordem de atualização: do fim das linhas para o começo, para a fila andar inteira no mesmo tick. */
  private order: Segment[] = [];

  constructor(private readonly grid: Grid) {}

  get segments(): Iterable<Segment> {
    return this.byTile.values();
  }

  at(x: number, y: number): Segment | null {
    return this.grid.isInside(x, y) ? (this.byTile.get(y * this.grid.size + x) ?? null) : null;
  }

  /** Troca o conjunto de segmentos, mantendo os itens dos que continuam iguais. */
  rebuild(segments: readonly Segment[]): void {
    const old = new Map([...this.byTile.values()].map((s) => [s.id, s]));
    this.byTile.clear();
    for (const segment of segments) {
      const previous = old.get(segment.id);
      if (previous && previous.rotation === segment.rotation) {
        segment.items.push(...previous.items);
        segment.filter = previous.filter;
        segment.turn = previous.turn;
      }
      this.byTile.set(segment.y * this.grid.size + segment.x, segment);
    }
    this.order = this.downstreamFirst();
  }

  /** Escolhe o item que o filtro manda em frente. */
  setFilter(id: number, item: string | null): boolean {
    for (const segment of this.byTile.values()) {
      if (segment.id !== id || segment.def.sort !== 'filter') continue;
      segment.filter = item;
      return true;
    }
    return false;
  }

  step(deliver: Receiver): void {
    for (const segment of this.order) this.advance(segment, deliver);
  }

  private advance(segment: Segment, deliver: Receiver): void {
    const move = segment.def.speed / TICKS_PER_SECOND;
    let limit = Infinity;
    for (let i = 0; i < segment.items.length; i++) {
      const entry = segment.items[i];
      if (!entry) continue;
      entry.t = Math.min(entry.t + move, limit);
      if (i === 0 && entry.t >= 1) {
        if (this.handOff(segment, entry.item, deliver)) {
          segment.items.shift();
          i--;
          continue;
        }
        entry.t = 1;
      }
      limit = entry.t - ITEM_SPACING;
    }
  }

  private handOff(segment: Segment, item: string, deliver: Receiver): boolean {
    for (const { x, y } of segment.exits(item)) {
      if (!this.passTo(segment, x, y, item, deliver)) continue;
      segment.turn++;
      return true;
    }
    return false;
  }

  private passTo(segment: Segment, x: number, y: number, item: string, deliver: Receiver): boolean {
    const next = this.at(x, y);
    if (!next) return this.grid.isInside(x, y) && deliver(x, y, item);
    // Nunca devolve para quem está mandando item para cá.
    if (next.next.x === segment.x && next.next.y === segment.y) return false;
    const rise = this.grid.getHeight(x, y) - this.grid.getHeight(segment.x, segment.y);
    const climb = segment.def.gravity ? 0 : (segment.def.climb ?? Infinity);
    return rise <= climb && next.push(item);
  }

  /** Ordena para que cada segmento seja atualizado antes do que alimenta ele. */
  private downstreamFirst(): Segment[] {
    // Iterativo: linhas longas não estouram a pilha. Cada linha é seguida até o fim ou até algo já visto.
    const visited = new Set<Segment>();
    const order: Segment[] = [];
    for (const start of this.byTile.values()) {
      const chain: Segment[] = [];
      for (let s: Segment | null = start; s && !visited.has(s); s = this.at(s.next.x, s.next.y)) {
        visited.add(s);
        chain.push(s);
      }
      order.push(...chain.reverse());
    }
    return order;
  }
}
