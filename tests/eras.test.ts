import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import { Economy } from '../src/core/economy/economy';
import { Simulation, SimulationLoop } from '../src/core/simulation';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';

function setup() {
  const grid = new Grid(30);
  const site = new BuildingSite(grid);
  const economy = new Economy(grid, { x: 10, y: 10 }, {
    capacity: 200,
    servants: 0,
    stock: [
      { item: 'iron_ore', amount: 2 },
      { item: 'charcoal', amount: 1 },
    ],
  });
  return { site, loop: new SimulationLoop(new Simulation(site, economy)) };
}

describe('eras', () => {
  it('a Era II abre com a primeira barra de ferro e destrava a forja', () => {
    const { site, loop } = setup();
    expect(loop.snapshot().era).toBe(1);
    expect(site.check('forge', 4, 4, 0)).toBe('lockedEra');
    loop.enqueue({ type: 'placeBuilding', kind: 'forge', x: 4, y: 4, rotation: 0 });
    loop.enqueue({ type: 'placeBuilding', kind: 'smelter', x: 7, y: 7, rotation: 0 });
    loop.advance(0, 0);
    expect(site.all.map((b) => b.kind)).toEqual(['smelter']);

    const seconds = GAME_DATA.recipes.get('smelt_iron')?.seconds ?? 0;
    for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) loop.simulation.step();
    expect(loop.snapshot().era).toBe(2);
    expect(site.check('forge', 4, 4, 0)).toBeNull();
  });

  it('toda era em eras.json abre com um item que existe', () => {
    for (const era of GAME_DATA.eras) expect(GAME_DATA.items.has(era.unlockItem)).toBe(true);
  });
});
