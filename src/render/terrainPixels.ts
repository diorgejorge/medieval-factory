import { TILE_SIZE_PX } from '../core/config';
import { hash2d } from '../core/random/rng';
import type { Grid } from '../core/world/grid';
import { Terrain, type TerrainType } from '../core/world/terrain';

type Rgb = readonly [number, number, number];

/** Paleta pixel art provisória, até termos sprites desenhados à mão. */
const PALETTE = {
  grass: [92, 138, 58],
  grassDark: [74, 115, 46],
  grassLight: [118, 163, 72],
  flower: [222, 214, 120],
  sand: [214, 192, 134],
  sandDark: [190, 166, 110],
  water: [58, 110, 165],
  waterLight: [110, 160, 210],
  canopy: [46, 94, 40],
  canopyLight: [70, 124, 52],
  canopyDark: [32, 68, 30],
  trunk: [96, 66, 40],
  rock: [128, 124, 116],
  rockDark: [96, 92, 86],
  rockLight: [160, 156, 148],
  ore: [176, 92, 52],
  oreLight: [214, 132, 82],
} as const satisfies Record<string, Rgb>;

/** Quanto o relevo clareia/escurece a cor: ajuda a ler colinas e vales sem sprites de altura. */
const RELIEF_SHADE_RANGE = 0.3;
const MAX_HEIGHT = 255;

/**
 * Pinta os pixels RGBA de um chunk (lado `tiles` × TILE_SIZE_PX) em `out`.
 * O padrão de cada pixel vem de um hash da posição: o mesmo mapa sempre tem a mesma cara.
 */
export function paintChunk(
  grid: Grid,
  firstTileX: number,
  firstTileY: number,
  tiles: number,
  out: Uint8ClampedArray,
): void {
  const widthPx = tiles * TILE_SIZE_PX;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const tileX = firstTileX + tx;
      const tileY = firstTileY + ty;
      if (!grid.isInside(tileX, tileY)) continue;
      const terrain = grid.getTerrain(tileX, tileY);
      const shade = 1 + (grid.getHeight(tileX, tileY) / MAX_HEIGHT - 0.5) * RELIEF_SHADE_RANGE;
      const tileHash = hash2d(tileX, tileY, 0x7ea1);
      for (let py = 0; py < TILE_SIZE_PX; py++) {
        for (let px = 0; px < TILE_SIZE_PX; px++) {
          const color = tilePixel(terrain, px, py, tileX * TILE_SIZE_PX + px, tileY * TILE_SIZE_PX + py, tileHash);
          const offset = ((ty * TILE_SIZE_PX + py) * widthPx + tx * TILE_SIZE_PX + px) * 4;
          out[offset] = color[0] * shade;
          out[offset + 1] = color[1] * shade;
          out[offset + 2] = color[2] * shade;
          out[offset + 3] = 255;
        }
      }
    }
  }
}

function tilePixel(
  terrain: TerrainType,
  px: number,
  py: number,
  worldPx: number,
  worldPy: number,
  tileHash: number,
): Rgb {
  const noise = hash2d(worldPx, worldPy, 0x51e7) & 0xff;
  switch (terrain) {
    case Terrain.Grass:
      return grassPixel(noise);
    case Terrain.Sand:
      return noise < 30 ? PALETTE.sandDark : PALETTE.sand;
    case Terrain.Water:
      return waterPixel(worldPx, worldPy);
    case Terrain.Forest:
      return treePixel(px, py, tileHash, noise) ?? grassPixel(noise);
    case Terrain.Rock:
      return rockPixel(noise);
    case Terrain.IronOre:
      return orePixel(px, py, tileHash, noise) ?? rockPixel(noise);
  }
}

function grassPixel(noise: number): Rgb {
  if (noise < 2) return PALETTE.flower;
  if (noise < 40) return PALETTE.grassDark;
  if (noise > 225) return PALETTE.grassLight;
  return PALETTE.grass;
}

function rockPixel(noise: number): Rgb {
  if (noise < 45) return PALETTE.rockDark;
  if (noise > 220) return PALETTE.rockLight;
  return PALETTE.rock;
}

/** Reflexos em traços horizontais curtos: lê como água em movimento mesmo parado. */
function waterPixel(worldPx: number, worldPy: number): Rgb {
  const streak = hash2d(worldPx >> 2, worldPy, 0xa11a) & 0xff;
  return streak < 18 ? PALETTE.waterLight : PALETTE.water;
}

/** Uma copa redonda por tile, com posição levemente variada para a floresta não parecer grade. */
function treePixel(px: number, py: number, tileHash: number, noise: number): Rgb | null {
  const centerX = 7 + ((tileHash & 3) - 1);
  const centerY = 6 + (((tileHash >> 2) & 3) - 1);
  const dx = px - centerX;
  const dy = py - centerY;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq <= 30) {
    if (dx + dy < -4 && noise > 80) return PALETTE.canopyLight;
    if (distanceSq > 20 && dy > 0) return PALETTE.canopyDark;
    return PALETTE.canopy;
  }
  const isTrunk = py > centerY + 4 && py <= centerY + 8 && (px === centerX || px === centerX + 1);
  return isTrunk ? PALETTE.trunk : null;
}

/** Pepitas de minério em pequenos aglomerados sobre a rocha. */
function orePixel(px: number, py: number, tileHash: number, noise: number): Rgb | null {
  for (let nugget = 0; nugget < 3; nugget++) {
    const bits = tileHash >>> (nugget * 8);
    const nx = 3 + (bits & 7) + nugget;
    const ny = 3 + ((bits >> 3) & 7);
    const dx = px - nx;
    const dy = py - ny;
    if (dx * dx + dy * dy <= 3) return dx + dy < 0 && noise > 60 ? PALETTE.oreLight : PALETTE.ore;
  }
  return null;
}
