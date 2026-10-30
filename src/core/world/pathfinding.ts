import type { Grid } from './grid';
import { Terrain, type TerrainType } from './terrain';

export interface Tile {
  x: number;
  y: number;
}

/**
 * Custo de andar por cada terreno. A água é cara mas não proibida: assim uma trilha
 * ainda liga margens opostas do rio, e o trecho na água fica sendo a "ponte que falta".
 */
export const TRAIL_COST: Readonly<Record<TerrainType, number>> = {
  [Terrain.Grass]: 1,
  [Terrain.Sand]: 1.5,
  [Terrain.Water]: 30,
  [Terrain.Forest]: 3,
  [Terrain.Rock]: 5,
  [Terrain.OreIron]: 5,
  [Terrain.Dirt]: 0.6,
};

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Caminho mais barato (A*, 4 vizinhos) de `from` até `to`, inclusive, sem passar por tiles bloqueados.
 * Null se não houver caminho ou algum ponto estiver fora do mapa.
 */
export function findPath(
  grid: Grid,
  from: Tile,
  to: Tile,
  isBlocked: (x: number, y: number) => boolean = () => false,
  cost = TRAIL_COST,
): Tile[] | null {
  if (!grid.isInside(from.x, from.y) || !grid.isInside(to.x, to.y)) return null;
  const size = grid.size;
  const minCost = Math.min(...Object.values(cost));
  const best = new Float64Array(size * size).fill(Infinity);
  const cameFrom = new Int32Array(size * size).fill(-1);
  const open = new MinHeap();
  const start = from.y * size + from.x;
  const goal = to.y * size + to.x;
  best[start] = 0;
  open.push(start, 0);

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) break;
    const cx = current % size;
    const cy = Math.floor(current / size);
    const currentCost = best[current] ?? Infinity;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.isInside(nx, ny) || isBlocked(nx, ny)) continue;
      const next = ny * size + nx;
      const nextCost = currentCost + cost[grid.getTerrain(nx, ny)];
      if (nextCost >= (best[next] ?? Infinity)) continue;
      best[next] = nextCost;
      cameFrom[next] = current;
      const heuristic = (Math.abs(nx - to.x) + Math.abs(ny - to.y)) * minCost;
      open.push(next, nextCost + heuristic);
    }
  }

  if (best[goal] === Infinity) return null;
  const path: Tile[] = [];
  for (let index = goal; index !== -1; index = cameFrom[index] ?? -1) {
    path.push({ x: index % size, y: Math.floor(index / size) });
  }
  return path.reverse();
}

/** Heap binário de índices por prioridade; entradas antigas são ignoradas por quem chama (custo maior). */
class MinHeap {
  private readonly items: number[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    this.items.push(item);
    this.priorities.push(priority);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.priorities[parent] ?? 0) <= priority) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0] ?? -1;
    const lastItem = this.items.pop();
    const lastPriority = this.priorities.pop();
    if (this.items.length === 0 || lastItem === undefined || lastPriority === undefined) return top;
    this.items[0] = lastItem;
    this.priorities[0] = lastPriority;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.items.length && (this.priorities[left] ?? 0) < (this.priorities[smallest] ?? 0)) smallest = left;
      if (right < this.items.length && (this.priorities[right] ?? 0) < (this.priorities[smallest] ?? 0)) smallest = right;
      if (smallest === i) return top;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const item = this.items[a] ?? 0;
    const priority = this.priorities[a] ?? 0;
    this.items[a] = this.items[b] ?? 0;
    this.priorities[a] = this.priorities[b] ?? 0;
    this.items[b] = item;
    this.priorities[b] = priority;
  }
}
