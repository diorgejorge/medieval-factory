import type { Grid } from './grid';
import { Terrain } from './terrain';
import type { MapObject } from './mapObjects';
import type { Area } from './villages';

/**
 * Construções disponíveis. Provisório: na frente 7 viram dados em JSON.
 * Tamanho em tiles na rotação 0; girar 90° troca largura e altura.
 */
export const BUILDINGS = {
  oven: { width: 2, height: 2, frame: 'oven_stone', needsWater: false },
  hut: { width: 3, height: 2, frame: 'hut_straw', needsWater: false },
  house: { width: 4, height: 2, frame: 'house_thatch', needsWater: false },
  watermill: { width: 2, height: 2, frame: 'watermill', needsWater: true },
} as const;

export type BuildingKind = keyof typeof BUILDINGS;
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];

/**
 * Para onde a frente da construção olha, girando no sentido horário: 0 = sul (de frente para a câmera,
 * como a arte padrão), 1 = oeste, 2 = norte, 3 = leste. Depois define por onde a máquina recebe e entrega.
 * A arte de cada direção é o frame `<frame>_r<rotação>`; sem ele, usa o frame padrão.
 */
export type Rotation = 0 | 1 | 2 | 3;

export interface Building {
  id: number;
  kind: BuildingKind;
  /** Canto superior esquerdo do terreno ocupado, em tiles. */
  x: number;
  y: number;
  rotation: Rotation;
}

/** Por que não dá para construir ali; a UI traduz em texto. */
export type PlacementProblem = 'outside' | 'water' | 'forest' | 'occupied' | 'reserved' | 'needsWater';

export function footprint(kind: BuildingKind, rotation: Rotation): { width: number; height: number } {
  const { width, height } = BUILDINGS[kind];
  return rotation % 2 === 0 ? { width, height } : { width: height, height: width };
}

/** Objeto para a camada de desenho: centro da base, embaixo do terreno ocupado. */
export function buildingObject(building: Building): MapObject {
  const { width, height } = footprint(building.kind, building.rotation);
  const frame = `${BUILDINGS[building.kind].frame}_r${building.rotation}`;
  return { frame, x: building.x + width / 2, y: building.y + height };
}

export function rotateClockwise(rotation: Rotation): Rotation {
  return ((rotation + 1) % 4) as Rotation;
}

/**
 * Terreno construído: guarda as construções e qual delas ocupa cada tile.
 * É a mesma classe na simulação (que decide) e na tela (que só prevê, para a prévia fantasma).
 */
export class BuildingSite {
  private readonly occupancy: Int32Array;
  private readonly reserved: Uint8Array;
  private readonly buildings = new Map<number, Building>();
  private nextId = 1;

  constructor(
    private readonly grid: Grid,
    reservedAreas: readonly Area[] = [],
  ) {
    this.occupancy = new Int32Array(grid.size * grid.size);
    this.reserved = new Uint8Array(grid.size * grid.size);
    for (const area of reservedAreas) {
      forEachTile(area.left, area.top, area.width, area.height, (x, y) => {
        if (grid.isInside(x, y)) this.reserved[y * grid.size + x] = 1;
      });
    }
  }

  get all(): Building[] {
    return [...this.buildings.values()];
  }

  /** Primeiro problema que impede construir ali, ou null se pode. `ignoreId` permite girar no lugar. */
  check(kind: BuildingKind, x: number, y: number, rotation: Rotation, ignoreId = 0): PlacementProblem | null {
    const { width, height } = footprint(kind, rotation);
    for (let ty = y; ty < y + height; ty++) {
      for (let tx = x; tx < x + width; tx++) {
        const problem = this.tileProblem(tx, ty, ignoreId);
        if (problem) return problem;
      }
    }
    if (BUILDINGS[kind].needsWater && !this.touchesWater(x, y, width, height)) return 'needsWater';
    return null;
  }

  place(kind: BuildingKind, x: number, y: number, rotation: Rotation): Building | null {
    if (this.check(kind, x, y, rotation) !== null) return null;
    const building: Building = { id: this.nextId++, kind, x, y, rotation };
    this.occupy(building, building.id);
    this.buildings.set(building.id, building);
    return building;
  }

  buildingAt(x: number, y: number): Building | null {
    if (!this.grid.isInside(x, y)) return null;
    return this.buildings.get(this.occupancy[y * this.grid.size + x] ?? 0) ?? null;
  }

  removeAt(x: number, y: number): Building | null {
    const building = this.buildingAt(x, y);
    if (!building) return null;
    this.occupy(building, 0);
    this.buildings.delete(building.id);
    return building;
  }

  /** Gira 90° no mesmo canto; não gira se a nova forma não couber. */
  rotateAt(x: number, y: number): Building | null {
    const building = this.buildingAt(x, y);
    if (!building) return null;
    const rotation = rotateClockwise(building.rotation);
    if (this.check(building.kind, building.x, building.y, rotation, building.id) !== null) return null;
    this.occupy(building, 0);
    building.rotation = rotation;
    this.occupy(building, building.id);
    return building;
  }

  /** Troca tudo pelo estado publicado pela simulação (usado na main thread). */
  replaceAll(buildings: readonly Building[]): void {
    this.occupancy.fill(0);
    this.buildings.clear();
    for (const building of buildings) {
      this.buildings.set(building.id, { ...building });
      this.occupy(building, building.id);
    }
  }

  private tileProblem(x: number, y: number, ignoreId: number): PlacementProblem | null {
    if (!this.grid.isInside(x, y)) return 'outside';
    const index = y * this.grid.size + x;
    if (this.reserved[index]) return 'reserved';
    const occupant = this.occupancy[index] ?? 0;
    if (occupant !== 0 && occupant !== ignoreId) return 'occupied';
    const terrain = this.grid.getTerrain(x, y);
    if (terrain === Terrain.Water) return 'water';
    if (terrain === Terrain.Forest) return 'forest';
    return null;
  }

  /** Água encostada num dos lados (não vale só pela diagonal). */
  private touchesWater(left: number, top: number, width: number, height: number): boolean {
    const isWater = (x: number, y: number) => this.grid.isInside(x, y) && this.grid.getTerrain(x, y) === Terrain.Water;
    for (let x = left; x < left + width; x++) {
      if (isWater(x, top - 1) || isWater(x, top + height)) return true;
    }
    for (let y = top; y < top + height; y++) {
      if (isWater(left - 1, y) || isWater(left + width, y)) return true;
    }
    return false;
  }

  private occupy(building: Building, value: number): void {
    const { width, height } = footprint(building.kind, building.rotation);
    forEachTile(building.x, building.y, width, height, (x, y) => {
      this.occupancy[y * this.grid.size + x] = value;
    });
  }
}

function forEachTile(left: number, top: number, width: number, height: number, visit: (x: number, y: number) => void): void {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) visit(x, y);
  }
}
