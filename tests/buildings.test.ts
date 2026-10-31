import { describe, expect, it } from 'vitest';
import { SimulationLoop, Simulation } from '../src/core/simulation';
import { BuildingSite, buildingObject, footprint } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';
import { Terrain } from '../src/core/world/terrain';

function site(): BuildingSite {
  const grid = new Grid(20);
  for (let y = 0; y < 20; y++) grid.setTerrain(10, y, Terrain.Water);
  grid.setTerrain(2, 15, Terrain.Forest);
  const s = new BuildingSite(grid, [{ left: 14, top: 14, width: 4, height: 4 }]);
  // Regras de ocupação valem para qualquer era; a trava de era tem teste próprio.
  s.era = 4;
  return s;
}

describe('BuildingSite: regras de ocupação', () => {
  it('coloca em campo livre e marca os tiles ocupados', () => {
    const s = site();
    const house = s.place('house', 1, 1, 0);
    expect(house).not.toBeNull();
    expect(s.buildingAt(4, 2)).toBe(house);
    expect(s.buildingAt(5, 2)).toBeNull();
  });

  it('não sobrepõe outra construção', () => {
    const s = site();
    s.place('house', 1, 1, 0);
    expect(s.check('oven', 3, 2, 0)).toBe('occupied');
    expect(s.place('oven', 3, 2, 0)).toBeNull();
  });

  it('recusa água, floresta, fora do mapa e terreno de vilarejo', () => {
    const s = site();
    expect(s.check('oven', 9, 5, 0)).toBe('water');
    expect(s.check('oven', 1, 14, 0)).toBe('forest');
    expect(s.check('oven', 19, 0, 0)).toBe('outside');
    expect(s.check('oven', -1, 0, 0)).toBe('outside');
    expect(s.check('oven', 13, 13, 0)).toBe('reserved');
  });

  it('a roda d’água precisa encostar na água', () => {
    const s = site();
    expect(s.check('watermill', 2, 2, 0)).toBe('needsWater');
    expect(s.check('watermill', 8, 2, 0)).toBeNull();
    expect(s.check('watermill', 11, 2, 0)).toBeNull();
  });

  it('girar troca largura e altura e respeita o espaço', () => {
    expect(footprint('house', 0)).toEqual({ width: 4, height: 2 });
    expect(footprint('house', 1)).toEqual({ width: 2, height: 4 });
    const s = site();
    s.place('house', 1, 1, 0);
    expect(s.rotateAt(1, 1)?.rotation).toBe(1);
    expect(s.buildingAt(1, 4)).not.toBeNull();
    expect(s.buildingAt(3, 1)).toBeNull();

    expect(s.rotateAt(1, 1)?.rotation).toBe(2);
    s.place('oven', 1, 3, 0);
    expect(s.rotateAt(1, 1)).toBeNull();
  });

  it('remove e libera os tiles', () => {
    const s = site();
    s.place('hut', 1, 1, 0);
    expect(s.removeAt(2, 2)?.kind).toBe('hut');
    expect(s.buildingAt(2, 2)).toBeNull();
    expect(s.check('hut', 1, 1, 0)).toBeNull();
  });

  it('o objeto de desenho fica no centro da base', () => {
    expect(buildingObject({ id: 1, kind: 'house', x: 1, y: 1, rotation: 0 })).toEqual({
      frame: 'house_thatch_r0',
      x: 3,
      y: 3,
      noShadow: true,
    });
  });
});

describe('comandos de construção na simulação', () => {
  it('coloca, gira e remove via comandos e publica as construções só quando mudam', () => {
    const loop = new SimulationLoop(new Simulation(site()));
    expect(loop.snapshot().buildings).toEqual([]);
    expect(loop.snapshot().buildings).toBeUndefined();

    loop.enqueue({ type: 'placeBuilding', kind: 'oven', x: 1, y: 1, rotation: 0 });
    loop.enqueue({ type: 'placeBuilding', kind: 'oven', x: 9, y: 1, rotation: 0 });
    loop.advance(0, 0);
    const placed = loop.snapshot();
    expect(placed.buildings).toHaveLength(1);
    expect(placed.buildingsVersion).toBe(1);

    loop.enqueue({ type: 'rotateBuilding', x: 1, y: 1 });
    loop.enqueue({ type: 'removeBuilding', x: 5, y: 5 });
    loop.advance(0, 0);
    expect(loop.snapshot().buildings?.[0]?.rotation).toBe(1);

    loop.enqueue({ type: 'removeBuilding', x: 2, y: 2 });
    loop.advance(0, 0);
    expect(loop.snapshot().buildings).toEqual([]);
  });
});
