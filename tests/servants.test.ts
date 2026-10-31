import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import { Economy, STORAGE_RANGE } from '../src/core/economy/economy';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';
import { Terrain } from '../src/core/world/terrain';

function run(economy: Economy, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICKS_PER_SECOND); i++) economy.step();
}

/** Vila (armazém inicial) no canto e um armazém novo bem longe, fora do alcance das máquinas de lá. */
function farApart(stock: { item: string; amount: number }[], servants = 2) {
  const grid = new Grid(80);
  const site = new BuildingSite(grid);
  const economy = new Economy(grid, { x: 5, y: 5 }, { capacity: 200, servants, stock });
  const storage = site.place('storage', 60, 60, 0);
  const mill = site.place('mill', 63, 60, 0);
  economy.sync(site);
  return { site, economy, storage, mill };
}

describe('servos', () => {
  it('levam o trigo da vila até o armazém do moinho distante', () => {
    const { economy, storage, mill } = farApart([{ item: 'wheat', amount: 6 }]);
    expect(Math.hypot(61 - 5, 61 - 5)).toBeGreaterThan(STORAGE_RANGE);
    run(economy, 1);
    expect(economy.snapshot().buildings[mill?.id ?? -1]?.status).toBe('noInput');
    expect(economy.snapshot().servants.some((s) => s.busy)).toBe(true);

    run(economy, 60);
    const snapshot = economy.snapshot();
    expect(snapshot.stock['flour'] ?? 0).toBeGreaterThan(0);
    expect(snapshot.buildings[storage?.id ?? -1]?.items?.['flour'] ?? 0).toBeGreaterThan(0);
  });

  it('não pegam mais do que falta: dois servos não atendem o mesmo pedido de 2 trigos', () => {
    const { economy } = farApart([{ item: 'wheat', amount: 10 }], 4);
    run(economy, 1);
    const busy = economy.snapshot().servants.filter((s) => s.busy).length;
    expect(busy).toBe(1);
  });

  it('sem o item em lugar nenhum, ficam parados', () => {
    const { economy } = farApart([]);
    run(economy, 5);
    expect(economy.snapshot().servants.every((s) => !s.busy)).toBe(true);
  });

  it('levam ferramenta para o lenhador distante sem machado', () => {
    const grid = new Grid(80);
    for (let y = 0; y < 80; y++) grid.setTerrain(79, y, Terrain.Forest);
    const site = new BuildingSite(grid);
    const economy = new Economy(grid, { x: 5, y: 5 }, { capacity: 200, servants: 1, stock: [{ item: 'stone_axe', amount: 1 }] });
    site.place('storage', 74, 60, 0);
    const lumberjack = site.place('lumberjack', 76, 62, 0);
    economy.sync(site);
    run(economy, 40);
    const report = economy.snapshot().buildings[lumberjack?.id ?? -1];
    expect(report?.tool?.item).toBe('stone_axe');
    expect(GAME_DATA.start.servants).toBeGreaterThan(0);
  });
});
