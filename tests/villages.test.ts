import { describe, expect, it } from 'vitest';
import villageTexts from '../data/texto/pt-BR/vilarejos.json';
import { generateWorld } from '../src/core/world/generator';
import { Grid } from '../src/core/world/grid';
import { findPath } from '../src/core/world/pathfinding';
import { Terrain } from '../src/core/world/terrain';
import { carveTrails, settleWorld, VILLAGE_GEN, villageAt } from '../src/core/world/villages';

const SIZE = 256;

describe('settleWorld', () => {
  it.each([1, 42, 9001])('seed %i: vilarejos perto da água, afastados e com dados completos', (seed) => {
    const grid = generateWorld(seed, SIZE);
    const { start, villages } = settleWorld(grid, seed, villageTexts.names);
    expect(start).not.toBeNull();
    expect(villages.length).toBeGreaterThanOrEqual(3);

    const names = new Set(villages.map((v) => v.name));
    expect(names.size).toBe(villages.length);
    for (const village of villages) {
      const { left, top, width, height } = village.area;
      expect(hasWaterWithin(grid, left + width / 2, top + height, VILLAGE_GEN.waterDistance.max + 1)).toBe(true);
      expect(village.population).toBeGreaterThanOrEqual(VILLAGE_GEN.population.min);
      expect(village.produces).toContain('fish');
      expect(village.wants.length).toBeGreaterThan(0);
      for (const want of village.wants) expect(village.produces).not.toContain(want);
      for (const other of villages) {
        if (other === village) continue;
        const d = Math.hypot(other.area.left - left, other.area.top - top);
        expect(d).toBeGreaterThanOrEqual(VILLAGE_GEN.minSpacing - 1);
      }
    }
  });

  it('é determinístico', () => {
    const a = settleWorld(generateWorld(7, SIZE), 7, villageTexts.names);
    const b = settleWorld(generateWorld(7, SIZE), 7, villageTexts.names);
    expect(a.villages).toEqual(b.villages);
    expect(a.objects).toEqual(b.objects);
  });

  it('abre trilhas de terra até a porta de cada vilarejo', () => {
    const grid = generateWorld(42, SIZE);
    const { villages } = settleWorld(grid, 42, villageTexts.names);
    for (const { door } of villages) {
      const terrain = grid.getTerrain(door.x, door.y);
      expect([Terrain.Dirt, Terrain.Water]).toContain(terrain);
    }
  });
});

describe('villageAt', () => {
  it('acha o vilarejo pelo tile clicado, incluindo o telhado logo acima', () => {
    const grid = generateWorld(42, SIZE);
    const { villages } = settleWorld(grid, 42, villageTexts.names);
    const village = villages[0];
    if (!village) throw new Error('sem vilarejos');
    const { left, top } = village.area;
    expect(villageAt(villages, left, top)).toBe(village);
    expect(villageAt(villages, left, top - 1)).toBe(village);
    expect(villageAt(villages, left - 1, top)).toBeNull();
  });
});

describe('findPath e carveTrails', () => {
  it('contorna a água quando há caminho por terra', () => {
    const grid = new Grid(10);
    for (let y = 0; y < 9; y++) grid.setTerrain(5, y, Terrain.Water);
    const path = findPath(grid, { x: 0, y: 0 }, { x: 9, y: 0 });
    expect(path?.some((t) => grid.getTerrain(t.x, t.y) === Terrain.Water)).toBe(false);
    expect(path?.at(-1)).toEqual({ x: 9, y: 0 });
  });

  it('cruza o rio quando não há outro jeito, sem aterrar a água', () => {
    const grid = new Grid(10);
    for (let y = 0; y < 10; y++) grid.setTerrain(5, y, Terrain.Water);
    carveTrails(grid, [
      { x: 0, y: 4 },
      { x: 9, y: 4 },
    ]);
    expect(grid.getTerrain(0, 4)).toBe(Terrain.Dirt);
    expect(grid.getTerrain(9, 4)).toBe(Terrain.Dirt);
    for (let y = 0; y < 10; y++) expect(grid.getTerrain(5, y)).toBe(Terrain.Water);
  });

  it('não passa por dentro de uma área bloqueada', () => {
    const grid = new Grid(10);
    carveTrails(
      grid,
      [
        { x: 0, y: 5 },
        { x: 9, y: 5 },
      ],
      [{ left: 3, top: 3, width: 4, height: 5 }],
    );
    for (let y = 3; y < 8; y++) {
      for (let x = 3; x < 7; x++) expect(grid.getTerrain(x, y)).toBe(Terrain.Grass);
    }
  });
});

function hasWaterWithin(grid: Grid, cx: number, cy: number, radius: number): boolean {
  for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      if (grid.isInside(x, y) && grid.getTerrain(x, y) === Terrain.Water) return true;
    }
  }
  return false;
}
