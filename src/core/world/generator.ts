import { fractalNoise2d } from '../random/noise';
import { Rng } from '../random/rng';
import { Grid } from './grid';
import { Terrain } from './terrain';

/** Parâmetros de geração. Frequências são "por tile": 1/48 = uma ondulação a cada ~48 tiles. */
export const WORLD_GEN = {
  height: { frequency: 1 / 48, octaves: 5 },
  /** Abaixo deste nível de altitude (0–1) a bacia vira lago. */
  lakeLevel: 0.34,
  /** Acima deste nível a altitude vira rocha (colinas). */
  mountainLevel: 0.66,
  forest: { frequency: 1 / 20, octaves: 4, threshold: 0.56 },
  ore: { frequency: 1 / 5, octaves: 2, threshold: 0.62 },
  river: { meanderFrequency: 1 / 70, octaves: 3, amplitudeRatio: 0.45, minWidth: 2, maxWidth: 4 },
} as const;

const MAX_HEIGHT = 255;

/** Gera o mapa a partir da seed. Mesma seed → mesmo mapa, sempre. */
export function generateWorld(seed: number, size: number): Grid {
  const grid = new Grid(size);
  const rng = new Rng(seed);
  // Cada camada usa uma seed derivada para que relevo, rio e florestas não fiquem correlacionados.
  const heightSeed = rng.nextUint32();
  const riverSeed = rng.nextUint32();
  const forestSeed = rng.nextUint32();
  const oreSeed = rng.nextUint32();
  const riverIsVertical = rng.next() < 0.5;

  applyRelief(grid, heightSeed);
  carveRiver(grid, riverSeed, riverIsVertical);
  scatterOre(grid, oreSeed);
  growForests(grid, forestSeed);
  addBeaches(grid);
  return grid;
}

/**
 * Tile de campo mais próximo de (x, y), procurando em anéis quadrados crescentes.
 * Serve para a câmera (e depois a vila inicial) não começar no meio de um lago.
 */
export function findNearestGrass(grid: Grid, x: number, y: number): { x: number; y: number } | null {
  for (let radius = 0; radius < grid.size; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (grid.isInside(tx, ty) && grid.getTerrain(tx, ty) === Terrain.Grass) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

function applyRelief(grid: Grid, seed: number): void {
  const { frequency, octaves } = WORLD_GEN.height;
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const altitude = fractalNoise2d(x * frequency, y * frequency, seed, octaves);
      grid.setHeight(x, y, Math.round(altitude * MAX_HEIGHT));
      if (altitude < WORLD_GEN.lakeLevel) grid.setTerrain(x, y, Terrain.Water);
      else if (altitude > WORLD_GEN.mountainLevel) grid.setTerrain(x, y, Terrain.Rock);
    }
  }
}

/** Rio de borda a borda, serpenteando pelo ruído; a largura também varia ao longo do curso. */
function carveRiver(grid: Grid, seed: number, vertical: boolean): void {
  const { meanderFrequency, octaves, amplitudeRatio, minWidth, maxWidth } = WORLD_GEN.river;
  const amplitude = grid.size * amplitudeRatio;
  const center = grid.size / 2;
  const riverbedHeight = Math.round(WORLD_GEN.lakeLevel * MAX_HEIGHT);

  for (let along = 0; along < grid.size; along++) {
    const meander = fractalNoise2d(along * meanderFrequency, 0, seed, octaves) - 0.5;
    const across = Math.round(center + meander * 2 * amplitude);
    const widthNoise = fractalNoise2d(along * meanderFrequency * 4, 7, seed, 2);
    const width = minWidth + Math.round(widthNoise * (maxWidth - minWidth));
    const start = across - Math.floor(width / 2);
    for (let offset = 0; offset < width; offset++) {
      const x = vertical ? start + offset : along;
      const y = vertical ? along : start + offset;
      if (!grid.isInside(x, y)) continue;
      grid.setTerrain(x, y, Terrain.Water);
      grid.setHeight(x, y, Math.min(grid.getHeight(x, y), riverbedHeight));
    }
  }
}

function scatterOre(grid: Grid, seed: number): void {
  const { frequency, octaves, threshold } = WORLD_GEN.ore;
  forEachTile(grid, (x, y) => {
    if (grid.getTerrain(x, y) !== Terrain.Rock) return;
    if (fractalNoise2d(x * frequency, y * frequency, seed, octaves) > threshold) {
      grid.setTerrain(x, y, Terrain.OreIron);
    }
  });
}

function growForests(grid: Grid, seed: number): void {
  const { frequency, octaves, threshold } = WORLD_GEN.forest;
  forEachTile(grid, (x, y) => {
    if (grid.getTerrain(x, y) !== Terrain.Grass) return;
    if (fractalNoise2d(x * frequency, y * frequency, seed, octaves) > threshold) {
      grid.setTerrain(x, y, Terrain.Forest);
    }
  });
}

/** Toda terra firme encostada na água vira areia: margens legíveis para rios e lagos. */
function addBeaches(grid: Grid): void {
  forEachTile(grid, (x, y) => {
    const terrain = grid.getTerrain(x, y);
    if (terrain === Terrain.Water || terrain === Terrain.Rock || terrain === Terrain.OreIron) return;
    if (touchesWater(grid, x, y)) grid.setTerrain(x, y, Terrain.Sand);
  });
}

function touchesWater(grid: Grid, x: number, y: number): boolean {
  return (
    isWater(grid, x - 1, y) || isWater(grid, x + 1, y) || isWater(grid, x, y - 1) || isWater(grid, x, y + 1)
  );
}

function isWater(grid: Grid, x: number, y: number): boolean {
  return grid.isInside(x, y) && grid.getTerrain(x, y) === Terrain.Water;
}

function forEachTile(grid: Grid, visit: (x: number, y: number) => void): void {
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) visit(x, y);
  }
}
