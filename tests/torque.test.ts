import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { Economy } from '../src/core/economy/economy';
import { buildNetworks } from '../src/core/economy/torque';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';
import { Terrain } from '../src/core/world/terrain';

const part = (id: number, x: number, y: number, size: number, supply: number, need: number) => ({ id, x, y, width: size, height: size, supply, need });

describe('rede de eixos', () => {
  it('peças que se tocam pelos lados formam uma rede; pela diagonal, não', () => {
    const networks = buildNetworks([part(1, 0, 0, 4, 8, 0), part(2, 4, 1, 1, 0, 0), part(3, 5, 0, 4, 0, 4), part(4, 9, 4, 1, 0, 0)]);
    expect(networks.get(3)).toEqual({ supply: 8, demand: 4, powered: true });
    expect(networks.get(4)).toEqual({ supply: 0, demand: 0, powered: false });
  });

  it('força de menos não move nenhuma máquina da rede', () => {
    const networks = buildNetworks([part(1, 0, 0, 4, 6, 0), part(2, 4, 0, 4, 0, 4), part(3, 8, 0, 4, 0, 4)]);
    expect(networks.get(2)?.powered).toBe(false);
  });

  it('roda d\'água + engrenagem + moinho: o moinho trabalha 2× mais rápido e a engrenagem gira', () => {
    const grid = new Grid(40);
    for (let y = 0; y < 40; y++) grid.setTerrain(0, y, Terrain.Water);
    const site = new BuildingSite(grid);
    site.era = 2;
    const economy = new Economy(grid, { x: 20, y: 2 }, { capacity: 100, servants: 0, stock: [{ item: 'wheat', amount: 20 }] });
    site.place('watermill', 1, 0, 0); // 1..4
    site.place('gearbox', 5, 1, 0);
    site.place('mill', 6, 0, 0); // 6..9
    site.place('storage', 10, 0, 0);
    economy.sync(site);
    const gearbox = site.buildingAt(5, 1)?.id ?? -1;
    for (let i = 0; i < 2 * TICKS_PER_SECOND; i++) economy.step();
    const report = economy.snapshot().buildings;
    expect(report[gearbox]?.status).toBe('working');
    expect(economy.poweredCount('mill')).toBe(1);
  });
});
