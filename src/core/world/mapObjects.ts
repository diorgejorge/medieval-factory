import { hash2d } from '../random/rng';
import type { Grid } from './grid';
import { Terrain, type TerrainType } from './terrain';

/**
 * Objeto do mapa (árvore, construção). (x, y) é o centro da base em tiles, com fração:
 * é ali que o sprite "pisa" no chão, e é por esse y que a ordem de desenho é decidida.
 */
export interface MapObject {
  frame: string;
  x: number;
  y: number;
  /** Sem sombra desenhada pelo motor (construções do jogador: a arte já assenta no chão). */
  noShadow?: boolean;
  /** Máquina ou extrator produzindo agora: a camada de desenho pode animar só nesse caso. */
  working?: boolean;
}

export const TREES = {
  /** Uma árvore por bloco 2×2 de floresta, com esta chance (0–1). */
  density: 0.85,
  /** Deslocamento máximo, em tiles, para a floresta não parecer plantada em fileiras. */
  jitter: 0.3,
  /** Acima desta altitude (0–255) nascem pinheiros; abaixo, árvores redondas. */
  pineHeight: 150,
  variants: 2,
} as const;

/** Vila inicial: casa, cabana e forno lado a lado, num retângulo só de campo. */
export const STARTING_VILLAGE = {
  width: 10,
  height: 4,
  buildings: [
    { frame: 'house_thatch', dx: 2, dy: 3 },
    { frame: 'hut_straw', dx: 6.5, dy: 3 },
    { frame: 'oven_clay', dx: 9, dy: 3 },
  ],
} as const;

const TREE_SEED = 0x7733;

/** Árvores sobre a floresta. Determinístico: depende só do mapa e da seed. */
export function scatterTrees(grid: Grid, seed: number): MapObject[] {
  const trees: MapObject[] = [];
  for (let y = 0; y + 1 < grid.size; y += 2) {
    for (let x = 0; x + 1 < grid.size; x += 2) {
      if (!isBlockOf(grid, x, y, 2, 2, Terrain.Forest)) continue;
      const roll = hash2d(x, y, seed ^ TREE_SEED);
      if (fraction(roll) >= TREES.density) continue;
      const jitterX = (fraction(roll >>> 10) - 0.5) * 2 * TREES.jitter;
      const jitterY = (fraction(roll >>> 20) - 0.5) * 2 * TREES.jitter;
      const kind = grid.getHeight(x, y) > TREES.pineHeight ? 'tree_pine' : 'tree_round';
      trees.push({ frame: `${kind}_${roll % TREES.variants}`, x: x + 1 + jitterX, y: y + 2 + jitterY });
    }
  }
  return trees;
}

export interface StartingVillage {
  buildings: MapObject[];
  center: { x: number; y: number };
  /** Retângulo das casas, em tiles. */
  area: { left: number; top: number; width: number; height: number };
  /** Tile logo abaixo das casas, onde chegam as trilhas. */
  door: { x: number; y: number };
}

/**
 * Procura, em anéis a partir de (x, y), um retângulo só de campo para a vila inicial.
 * Devolve as construções e o centro da vila, ou null se o mapa não tiver espaço.
 */
export function placeStartingVillage(
  grid: Grid,
  x: number,
  y: number,
): StartingVillage | null {
  const { width, height, buildings } = STARTING_VILLAGE;
  for (let radius = 0; radius < grid.size; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const left = x + dx - Math.floor(width / 2);
        const top = y + dy - Math.floor(height / 2);
        if (!isBlockOf(grid, left, top, width, height, Terrain.Grass)) continue;
        return {
          buildings: buildings.map((b) => ({ frame: b.frame, x: left + b.dx, y: top + b.dy })),
          center: { x: left + width / 2, y: top + height / 2 },
          area: { left, top, width, height },
          door: { x: left + (width >> 1), y: top + height },
        };
      }
    }
  }
  return null;
}

/** Ordem de desenho em vista 3/4: quem está mais embaixo na tela fica na frente. */
export function compareDrawOrder(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.y - b.y || a.x - b.x;
}

function fraction(bits: number): number {
  return (bits % 1000) / 1000;
}

function isBlockOf(
  grid: Grid,
  left: number,
  top: number,
  width: number,
  height: number,
  terrain: TerrainType,
): boolean {
  for (let y = top; y < top + height; y++) {
    for (let x = left; x < left + width; x++) {
      if (!grid.isInside(x, y) || grid.getTerrain(x, y) !== terrain) return false;
    }
  }
  return true;
}
