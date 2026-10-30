import { describe, expect, it } from 'vitest';
import { findNearestGrass, generateWorld } from '../src/core/world/generator';
import type { Grid } from '../src/core/world/grid';
import { Terrain, TERRAIN_TYPES, type TerrainType } from '../src/core/world/terrain';

const SIZE = 128;

function countTerrain(grid: Grid): Map<TerrainType, number> {
  const counts = new Map<TerrainType, number>(TERRAIN_TYPES.map((type) => [type, 0]));
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const type = grid.getTerrain(x, y);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return counts;
}

function sameMap(a: Grid, b: Grid): boolean {
  for (let y = 0; y < a.size; y++) {
    for (let x = 0; x < a.size; x++) {
      if (a.getTerrain(x, y) !== b.getTerrain(x, y)) return false;
      if (a.getHeight(x, y) !== b.getHeight(x, y)) return false;
    }
  }
  return true;
}

describe('generateWorld', () => {
  it('mesma seed → mesmo mapa (terreno e relevo)', () => {
    expect(sameMap(generateWorld(42, SIZE), generateWorld(42, SIZE))).toBe(true);
  });

  it('seeds diferentes → mapas diferentes', () => {
    expect(sameMap(generateWorld(1, SIZE), generateWorld(2, SIZE))).toBe(false);
  });

  it.each([1, 42, 9001])('seed %i tem água, floresta, rocha e campo', (seed) => {
    const counts = countTerrain(generateWorld(seed, SIZE));
    const total = SIZE * SIZE;
    expect(counts.get(Terrain.Water)).toBeGreaterThan(total * 0.03);
    expect(counts.get(Terrain.Forest)).toBeGreaterThan(total * 0.05);
    expect(counts.get(Terrain.Grass)).toBeGreaterThan(total * 0.2);
    expect((counts.get(Terrain.Rock) ?? 0) + (counts.get(Terrain.OreIron) ?? 0)).toBeGreaterThan(0);
  });

  it('o rio atravessa o mapa de borda a borda', () => {
    const grid = generateWorld(42, SIZE);
    const hasWaterInRow = (y: number) =>
      Array.from({ length: SIZE }, (_, x) => grid.getTerrain(x, y)).includes(Terrain.Water);
    const hasWaterInColumn = (x: number) =>
      Array.from({ length: SIZE }, (_, y) => grid.getTerrain(x, y)).includes(Terrain.Water);
    const crossesVertically = Array.from({ length: SIZE }, (_, y) => y).every(hasWaterInRow);
    const crossesHorizontally = Array.from({ length: SIZE }, (_, x) => x).every(hasWaterInColumn);
    expect(crossesVertically || crossesHorizontally).toBe(true);
  });

  it('encontra o campo mais próximo de um ponto', () => {
    const grid = generateWorld(42, SIZE);
    const found = findNearestGrass(grid, SIZE / 2, SIZE / 2);
    expect(found).not.toBeNull();
    if (found) expect(grid.getTerrain(found.x, found.y)).toBe(Terrain.Grass);
  });

  it('areia só aparece encostada na água', () => {
    const grid = generateWorld(7, SIZE);
    const isWater = (x: number, y: number) => grid.isInside(x, y) && grid.getTerrain(x, y) === Terrain.Water;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (grid.getTerrain(x, y) !== Terrain.Sand) continue;
        expect(isWater(x - 1, y) || isWater(x + 1, y) || isWater(x, y - 1) || isWater(x, y + 1)).toBe(true);
      }
    }
  });
});
