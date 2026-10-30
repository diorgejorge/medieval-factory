import { Rng } from '../random/rng';
import type { Grid } from './grid';
import { placeStartingVillage, scatterTrees, type MapObject, type StartingVillage } from './mapObjects';
import { findPath, type Tile } from './pathfinding';
import { Terrain, type TerrainType } from './terrain';

/** Itens que os vilarejos produzem e pedem. Os nomes de exibição ficam na UI. */
export const VILLAGE_GOODS = ['wood', 'stone', 'wheat', 'flour', 'bread', 'firewood', 'fish', 'wool', 'iron_ore', 'clay'] as const;
export type VillageGood = (typeof VILLAGE_GOODS)[number];

export interface VillageNames {
  prefixes: readonly string[];
  suffixes: readonly string[];
}

export interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Village {
  name: string;
  /** Índice do temperamento nos textos do Roteiro (data/texto/pt-BR/vilarejos.json). */
  temperament: number;
  population: number;
  produces: VillageGood[];
  wants: VillageGood[];
  /** Retângulo ocupado pelas casas, em tiles: é a área clicável. */
  area: Area;
  /** Tile logo abaixo das casas, onde chegam as trilhas. */
  door: Tile;
  buildings: MapObject[];
}

export const VILLAGE_GEN = {
  count: 5,
  /** Distância mínima, em tiles, entre dois vilarejos (e da vila do jogador). */
  minSpacing: 36,
  /** O vilarejo fica perto da água: entre estas distâncias, em tiles. */
  waterDistance: { min: 2, max: 6 },
  width: 7,
  height: 4,
  population: { min: 12, max: 60 },
  /** Raio onde o terreno em volta decide o que o vilarejo produz. */
  surroundingsRadius: 8,
  temperaments: 5,
} as const;

/** Casas de um vilarejo, posicionadas a partir do canto superior esquerdo da área. */
const LAYOUTS: readonly (readonly { frame: string; dx: number; dy: number }[])[] = [
  [
    { frame: 'house_flat', dx: 2, dy: 3 },
    { frame: 'hut_mud', dx: 5.5, dy: 3 },
  ],
  [
    { frame: 'hut_straw', dx: 1.5, dy: 3 },
    { frame: 'house_tile', dx: 5, dy: 3 },
  ],
  [
    { frame: 'house_thatch', dx: 2, dy: 3 },
    { frame: 'oven_stone', dx: 5, dy: 3 },
  ],
];

/**
 * Espalha os vilarejos vizinhos perto da água, longe uns dos outros e de `avoid`
 * (a vila do jogador). Determinístico: mesma seed, mesmos vilarejos.
 */
export function generateVillages(grid: Grid, seed: number, names: VillageNames, avoid: readonly Tile[]): Village[] {
  const rng = new Rng(seed ^ 0x5a11);
  const distance = distanceToWater(grid);
  const { width, height, waterDistance } = VILLAGE_GEN;
  const candidates: Tile[] = [];
  for (let top = 0; top + height <= grid.size; top++) {
    for (let left = 0; left + width <= grid.size; left++) {
      const d = distance[(top + height) * grid.size + left + (width >> 1)] ?? Infinity;
      if (d < waterDistance.min || d > waterDistance.max) continue;
      if (isAllGrass(grid, left, top, width, height)) candidates.push({ x: left, y: top });
    }
  }
  shuffle(candidates, rng);

  const villages: Village[] = [];
  const taken = [...avoid];
  const usedNames = new Set<string>();
  for (const { x: left, y: top } of candidates) {
    if (villages.length >= VILLAGE_GEN.count) break;
    const center = { x: left + width / 2, y: top + height / 2 };
    if (taken.some((t) => Math.hypot(t.x - center.x, t.y - center.y) < VILLAGE_GEN.minSpacing)) continue;
    taken.push(center);
    const layout = LAYOUTS[rng.int(0, LAYOUTS.length - 1)] ?? [];
    const produces = surroundingGoods(grid, center);
    villages.push({
      name: uniqueName(names, rng, usedNames),
      temperament: rng.int(0, VILLAGE_GEN.temperaments - 1),
      population: rng.int(VILLAGE_GEN.population.min, VILLAGE_GEN.population.max),
      produces,
      wants: pickWants(produces, rng),
      area: { left, top, width, height },
      door: { x: left + (width >> 1), y: top + height },
      buildings: layout.map((b) => ({ frame: b.frame, x: left + b.dx, y: top + b.dy })),
    });
  }
  return villages;
}

/**
 * Liga os pontos (portas dos vilarejos) por trilhas de terra: árvore geradora mínima pela
 * distância em linha reta, e cada ligação segue o caminho mais barato no terreno.
 * A água no caminho continua água: é onde falta uma ponte.
 */
export function carveTrails(grid: Grid, points: readonly Tile[], areas: readonly Area[] = []): void {
  const isBlocked = (x: number, y: number) => areas.some((area) => isInsideArea(area, x, y));
  for (const [a, b] of minimumSpanningTree(points)) {
    for (const tile of findPath(grid, a, b, isBlocked) ?? []) {
      const terrain = grid.getTerrain(tile.x, tile.y);
      if (terrain !== Terrain.Water) grid.setTerrain(tile.x, tile.y, Terrain.Dirt);
    }
  }
}

/** Vilarejo cuja área (com folga para os telhados) contém o tile, ou null. */
export function villageAt(villages: readonly Village[], x: number, y: number): Village | null {
  return (
    villages.find(
      ({ area }) => x >= area.left && x < area.left + area.width && y >= area.top - 1 && y < area.top + area.height,
    ) ?? null
  );
}

function isInsideArea(area: Area, x: number, y: number): boolean {
  return x >= area.left && x < area.left + area.width && y >= area.top && y < area.top + area.height;
}

function minimumSpanningTree(points: readonly Tile[]): [Tile, Tile][] {
  const first = points[0];
  if (!first) return [];
  const inTree = [first];
  const rest = points.slice(1);
  const edges: [Tile, Tile][] = [];
  while (rest.length > 0) {
    let bestDistance = Infinity;
    let bestFrom = first;
    let bestIndex = 0;
    for (const from of inTree) {
      rest.forEach((to, index) => {
        const d = Math.hypot(from.x - to.x, from.y - to.y);
        if (d < bestDistance) {
          bestDistance = d;
          bestFrom = from;
          bestIndex = index;
        }
      });
    }
    const [next] = rest.splice(bestIndex, 1);
    if (!next) break;
    edges.push([bestFrom, next]);
    inTree.push(next);
  }
  return edges;
}

/** Distância (4 vizinhos) de cada tile até a água mais próxima, por BFS a partir de toda a água. */
function distanceToWater(grid: Grid): Float64Array {
  const size = grid.size;
  const distance = new Float64Array(size * size).fill(Infinity);
  const queue: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid.getTerrain(x, y) !== Terrain.Water) continue;
      distance[y * size + x] = 0;
      queue.push(y * size + x);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head] ?? 0;
    const x = index % size;
    const y = Math.floor(index / size);
    const next = (distance[index] ?? 0) + 1;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (!grid.isInside(nx, ny) || (distance[ny * size + nx] ?? 0) <= next) continue;
      distance[ny * size + nx] = next;
      queue.push(ny * size + nx);
    }
  }
  return distance;
}

/** O que há em volta decide a produção: perto da água sempre há peixe. */
function surroundingGoods(grid: Grid, center: Tile): VillageGood[] {
  const counts = new Map<TerrainType, number>();
  const r = VILLAGE_GEN.surroundingsRadius;
  for (let y = Math.floor(center.y) - r; y <= center.y + r; y++) {
    for (let x = Math.floor(center.x) - r; x <= center.x + r; x++) {
      if (!grid.isInside(x, y)) continue;
      const terrain = grid.getTerrain(x, y);
      counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
    }
  }
  const has = (terrain: TerrainType, min: number) => (counts.get(terrain) ?? 0) >= min;
  const goods: VillageGood[] = ['fish'];
  if (has(Terrain.Forest, 20)) goods.push('wood');
  if (has(Terrain.OreIron, 3)) goods.push('iron_ore');
  else if (has(Terrain.Rock, 10)) goods.push('stone');
  if (goods.length < 3) goods.push(has(Terrain.Grass, 120) ? 'wheat' : 'wool');
  return goods;
}

function pickWants(produces: readonly VillageGood[], rng: Rng): VillageGood[] {
  const options = VILLAGE_GOODS.filter((good) => !produces.includes(good));
  shuffle(options, rng);
  return options.slice(0, rng.int(1, 2));
}

function uniqueName(names: VillageNames, rng: Rng, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const prefix = names.prefixes[rng.int(0, names.prefixes.length - 1)] ?? 'Vila';
    const suffix = names.suffixes[rng.int(0, names.suffixes.length - 1)] ?? '';
    const name = `${prefix} ${suffix}`.trim();
    if (used.has(name)) continue;
    used.add(name);
    return name;
  }
  return `Vila ${used.size + 1}`;
}

function isAllGrass(grid: Grid, left: number, top: number, width: number, height: number): boolean {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      if (grid.getTerrain(x, y) !== Terrain.Grass) return false;
    }
  }
  return true;
}

function shuffle<T>(items: T[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = items[i];
    const b = items[j];
    if (a === undefined || b === undefined) continue;
    items[i] = b;
    items[j] = a;
  }
}

export interface Settlements {
  start: StartingVillage | null;
  villages: Village[];
  /** Árvores e casas, prontas para a camada de objetos. */
  objects: MapObject[];
}

/**
 * Povoa o mapa recém-gerado: vila do jogador perto do centro, vilarejos vizinhos perto da água,
 * trilhas entre todos e, por último, as árvores (para nenhuma nascer em cima de uma trilha).
 */
export function settleWorld(grid: Grid, seed: number, names: VillageNames): Settlements {
  const middle = Math.floor(grid.size / 2);
  const start = placeStartingVillage(grid, middle, middle);
  const villages = generateVillages(grid, seed, names, start ? [start.center] : []);
  const doors = [...(start ? [start.door] : []), ...villages.map((v) => v.door)];
  const areas = [...(start ? [start.area] : []), ...villages.map((v) => v.area)];
  carveTrails(grid, doors, areas);
  const objects = [
    ...scatterTrees(grid, seed),
    ...(start?.buildings ?? []),
    ...villages.flatMap((v) => v.buildings),
  ];
  return { start, villages, objects };
}
