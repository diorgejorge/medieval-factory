import { describe, expect, it } from 'vitest';
import { Grid } from '../src/core/world/grid';
import { Terrain } from '../src/core/world/terrain';

describe('Grid', () => {
  it('começa preenchida com o terreno padrão', () => {
    const grid = new Grid(4);
    expect(grid.getTerrain(0, 0)).toBe(Terrain.Grass);
    expect(grid.getTerrain(3, 3)).toBe(Terrain.Grass);
  });

  it('grava e lê terreno por coordenada sem afetar vizinhos', () => {
    const grid = new Grid(4);
    grid.setTerrain(2, 1, Terrain.Water);
    expect(grid.getTerrain(2, 1)).toBe(Terrain.Water);
    expect(grid.getTerrain(1, 2)).toBe(Terrain.Grass);
  });

  it('detecta coordenadas fora da grade', () => {
    const grid = new Grid(4);
    expect(grid.isInside(0, 3)).toBe(true);
    expect(grid.isInside(4, 0)).toBe(false);
    expect(grid.isInside(-1, 0)).toBe(false);
    expect(() => grid.getTerrain(4, 0)).toThrow(RangeError);
  });

  it('guarda o relevo de cada tile', () => {
    const grid = new Grid(4);
    grid.setHeight(1, 2, 200);
    expect(grid.getHeight(1, 2)).toBe(200);
    expect(grid.getHeight(2, 1)).toBe(0);
  });

  it('rejeita tamanho inválido', () => {
    expect(() => new Grid(0)).toThrow(RangeError);
    expect(() => new Grid(1.5)).toThrow(RangeError);
  });
});
