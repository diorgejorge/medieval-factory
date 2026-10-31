import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import { Economy } from '../src/core/economy/economy';
import { Simulation, SimulationLoop } from '../src/core/simulation';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';

const seconds = (recipe: string) => GAME_DATA.recipes.get(recipe)?.seconds ?? 0;

function setup(stock: { item: string; amount: number }[], capacity = 200) {
  const grid = new Grid(30);
  const site = new BuildingSite(grid);
  const economy = new Economy(grid, { x: 10, y: 10 }, { capacity, servants: 0, stock });
  return { site, economy };
}

function run(economy: Economy, secs: number): void {
  for (let i = 0; i < Math.round(secs * TICKS_PER_SECOND); i++) economy.step();
}

describe('máquinas com receitas', () => {
  it('o moinho transforma trigo do armazém em farinha', () => {
    const { site, economy } = setup([{ item: 'wheat', amount: 4 }]);
    site.place('mill', 6, 6, 0);
    economy.sync(site);
    run(economy, seconds('grind_flour') * 2);
    expect(economy.snapshot().stock).toEqual({ flour: 2 });
  });

  it('o forno de pão queima lenha e para sem combustível', () => {
    const { site, economy } = setup([
      { item: 'flour', amount: 5 },
      { item: 'firewood', amount: 1 },
    ]);
    const oven = site.place('oven', 6, 6, 0);
    economy.sync(site);
    const burn = GAME_DATA.items.get('firewood')?.fuel ?? 0;
    const batches = Math.floor(burn / seconds('bake_bread'));
    run(economy, seconds('bake_bread') * (batches + 1));
    const snapshot = economy.snapshot();
    expect(snapshot.stock['bread']).toBe(2 * batches);
    expect(snapshot.stock['firewood']).toBeUndefined();
    expect(snapshot.buildings[oven?.id ?? -1]?.status).toBe('noFuel');
  });

  it('sem insumos a máquina dorme e acorda quando o armazém muda', () => {
    const { site, economy } = setup([]);
    const mill = site.place('mill', 6, 6, 0);
    const farm = site.place('farm', 2, 2, 0);
    economy.sync(site);
    economy.step();
    expect(economy.snapshot().buildings[mill?.id ?? -1]?.status).toBe('noInput');

    // A lavoura entrega trigo sozinha; com 2 trigos o moinho volta a trabalhar.
    run(economy, (GAME_DATA.buildings.get('farm')?.extracts?.seconds ?? 0) * 2 + 1);
    expect(farm).not.toBeNull();
    expect(economy.snapshot().buildings[mill?.id ?? -1]?.status).toBe('working');
  });

  it('a cadeia do pão roda sozinha: lavoura → moinho → forno', () => {
    const { site, economy } = setup([{ item: 'firewood', amount: 20 }], 500);
    site.place('farm', 2, 2, 0);
    site.place('mill', 6, 6, 0);
    site.place('oven', 9, 6, 0);
    economy.sync(site);
    run(economy, 120);
    expect(economy.snapshot().stock['bread'] ?? 0).toBeGreaterThan(0);
  });

  it('para quando não há espaço para o produto', () => {
    // 1 madeira vira 2 lenhas; com capacidade 2 e 1 pedra ocupando, as 2 lenhas não cabem.
    const { site, economy } = setup(
      [
        { item: 'wood', amount: 1 },
        { item: 'stone', amount: 1 },
      ],
      2,
    );
    const bench = site.place('workbench', 6, 6, 0);
    economy.sync(site);
    run(economy, seconds('split_firewood') + 1);
    expect(economy.snapshot().buildings[bench?.id ?? -1]?.status).toBe('outputFull');
    expect(economy.snapshot().stock).toEqual({ stone: 1 });
  });

  it('a bancada troca de receita por comando', () => {
    const { site, economy } = setup([
      { item: 'wood', amount: 5 },
      { item: 'stone', amount: 4 },
    ]);
    const loop = new SimulationLoop(new Simulation(site, economy));
    loop.enqueue({ type: 'placeBuilding', kind: 'workbench', x: 6, y: 6, rotation: 0 });
    loop.advance(0, 0);
    const bench = site.all[0];
    expect(loop.snapshot().economy?.buildings[bench?.id ?? -1]).toMatchObject({
      recipe: 'split_firewood',
      recipes: ['split_firewood', 'stone_axe', 'stone_pickaxe'],
    });

    loop.enqueue({ type: 'setRecipe', buildingId: bench?.id ?? -1, recipe: 'stone_axe' });
    loop.advance(0, 0);
    for (let i = 0; i < seconds('stone_axe') * TICKS_PER_SECOND; i++) loop.simulation.step();
    expect(loop.snapshot().economy?.stock['stone_axe']).toBe(1);
  });

  it('recusa receita de outra construção', () => {
    const { site, economy } = setup([]);
    const mill = site.place('mill', 6, 6, 0);
    economy.sync(site);
    expect(economy.setRecipe(mill?.id ?? -1, 'bake_bread')).toBe(false);
  });
});
