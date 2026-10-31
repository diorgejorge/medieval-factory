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
}

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
}

/**
 * Um tile de calha ou esteira: fila de itens andando na direção da rotação.
 * Itens não são entidades: só a fila do segmento avança (custo por segmento, não por item).
 */
export class Segment {
  /** Ordenados da saída (t maior) para a entrada. */
  readonly items: SegmentItem[] = [];

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

  view(): SegmentView {
    return { id: this.id, x: this.x, y: this.y, rotation: this.rotation, items: this.items.map((i) => ({ ...i })) };
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
      if (previous && previous.rotation === segment.rotation) segment.items.push(...previous.items);
      this.byTile.set(segment.y * this.grid.size + segment.x, segment);
    }
    this.order = this.downstreamFirst();
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
    const { x, y } = segment.next;
    const next = this.at(x, y);
    if (next) {
      if (segment.def.gravity && this.grid.getHeight(x, y) > this.grid.getHeight(segment.x, segment.y)) return false;
      return next.push(item);
    }
    return deliver(x, y, item);
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
