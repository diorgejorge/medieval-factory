import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/core/world/generator';
import { Grid } from '../src/core/world/grid';
import { compareDrawOrder, placeStartingVillage, scatterTrees, STARTING_VILLAGE } from '../src/core/world/mapObjects';
import { Terrain } from '../src/core/world/terrain';
import { transitionFrame } from '../src/render/terrainAtlas';

describe('scatterTrees', () => {
  it('só planta árvores com a base em floresta', () => {
    const grid = generateWorld(42, 128);
    const trees = scatterTrees(grid, 42);
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      expect(grid.getTerrain(Math.floor(tree.x), Math.floor(tree.y - 0.5))).toBe(Terrain.Forest);
      expect(tree.frame).toMatch(/^tree_(round|pine)_[01]$/);
    }
  });

  it('é determinístico', () => {
    const grid = generateWorld(7, 96);
    expect(scatterTrees(grid, 7)).toEqual(scatterTrees(grid, 7));
  });

  it('não planta nada fora da floresta', () => {
    expect(scatterTrees(new Grid(16), 1)).toEqual([]);
  });
});

describe('placeStartingVillage', () => {
  it('põe as construções num retângulo só de campo', () => {
    const grid = new Grid(32);
    grid.setTerrain(16, 16, Terrain.Water);
    const village = placeStartingVillage(grid, 16, 16);
    expect(village?.buildings.map((b) => b.frame)).toEqual(STARTING_VILLAGE.buildings.map((b) => b.frame));
    expect(village?.buildings.every((b) => grid.getTerrain(Math.floor(b.x), Math.floor(b.y) - 1) === Terrain.Grass)).toBe(
      true,
    );
  });

  it('devolve null quando não há campo livre', () => {
    expect(placeStartingVillage(new Grid(32, Terrain.Water), 16, 16)).toBeNull();
  });
});

describe('compareDrawOrder', () => {
  it('desenha antes quem está mais acima (y menor)', () => {
    const sorted = [
      { x: 0, y: 5 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
    ].sort(compareDrawOrder);
    expect(sorted).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 0, y: 5 },
    ]);
  });
});

describe('transitionFrame', () => {
  const { Grass, Sand, Water, Rock } = Terrain;

  it('monta a máscara com os cantos do primeiro terreno do par', () => {
    expect(transitionFrame(Grass, Sand, Sand, Sand)).toBe('grass_sand_1');
    expect(transitionFrame(Sand, Sand, Water, Water)).toBe('sand_water_3');
    expect(transitionFrame(Water, Grass, Water, Grass)).toBe('grass_water_10');
  });

  it('não tem transição quando os cantos são iguais ou o par não existe', () => {
    expect(transitionFrame(Grass, Grass, Grass, Grass)).toBeNull();
    expect(transitionFrame(Grass, Rock, Grass, Grass)).toBeNull();
    expect(transitionFrame(Grass, Sand, Water, Water)).toBeNull();
  });
});
