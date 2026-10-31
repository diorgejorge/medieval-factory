import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import { Economy, START_STORAGE_ID } from '../src/core/economy/economy';
import { Simulation, SimulationLoop } from '../src/core/simulation';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';
import { Terrain } from '../src/core/world/terrain';

const LUMBER_SECONDS = GAME_DATA.buildings.get('lumberjack')?.extracts?.seconds ?? 0;

/** Mapa 40×40 de campo com uma faixa de floresta e outra de rocha. */
function world(stock = [{ item: 'stone_axe', amount: 1 }], capacity = 100) {
  const grid = new Grid(40);
  for (let y = 0; y < 40; y++) {
    grid.setTerrain(0, y, Terrain.Forest);
    grid.setTerrain(39, y, Terrain.Rock);
  }
  const site = new BuildingSite(grid);
  const economy = new Economy(grid, { x: 5, y: 5 }, { capacity, servants: 0, stock });
  return { grid, site, economy };
}

function runSeconds(economy: Economy, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) economy.step();
}

describe('Economy: extratores e armazém', () => {
  it('o lenhador pega o machado no armazém e entrega madeira no ritmo do dado', () => {
    const { site, economy } = world();
    const lumberjack = site.place('lumberjack', 2, 4, 0);
    economy.sync(site);
    runSeconds(economy, LUMBER_SECONDS * 3);
    const snapshot = economy.snapshot();
    expect(snapshot.stock['wood']).toBe(3);
    expect(snapshot.stock['stone_axe']).toBeUndefined();
    expect(snapshot.buildings[lumberjack?.id ?? -1]).toMatchObject({ status: 'working', tool: { item: 'stone_axe' } });
  });

  it('sem ferramenta no armazém, o lenhador fica parado', () => {
    const { site, economy } = world([]);
    const lumberjack = site.place('lumberjack', 2, 4, 0);
    economy.sync(site);
    runSeconds(economy, LUMBER_SECONDS * 2);
    expect(economy.snapshot().buildings[lumberjack?.id ?? -1]?.status).toBe('noTool');
    expect(economy.snapshot().stock['wood']).toBeUndefined();
  });

  it('a ferramenta quebra depois dos usos e o extrator busca outra', () => {
    const uses = GAME_DATA.items.get('stone_axe')?.tool?.uses ?? 0;
    const { site, economy } = world([{ item: 'stone_axe', amount: 2 }], 1000);
    site.place('lumberjack', 2, 4, 0);
    economy.sync(site);
    runSeconds(economy, LUMBER_SECONDS * (uses + 1));
    expect(economy.snapshot().stock['wood']).toBe(uses + 1);
    expect(economy.snapshot().stock['stone_axe']).toBeUndefined();
  });

  it('para quando o armazém enche', () => {
    const { site, economy } = world([{ item: 'stone_axe', amount: 1 }], 3);
    const lumberjack = site.place('lumberjack', 2, 4, 0);
    economy.sync(site);
    runSeconds(economy, LUMBER_SECONDS * 5);
    const snapshot = economy.snapshot();
    expect(snapshot.buildings[START_STORAGE_ID]?.items).toEqual({ wood: 3 });
    expect(snapshot.buildings[lumberjack?.id ?? -1]?.status).toBe('storageFull');
  });

  it('entrega no armazém mais próximo e para se nenhum estiver ao alcance', () => {
    const { site, economy } = world();
    const far = site.place('quarry', 36, 30, 0);
    economy.sync(site);
    runSeconds(economy, 1);
    expect(economy.snapshot().buildings[far?.id ?? -1]?.status).toBe('noStorage');

    const storage = site.place('storage', 34, 34, 0);
    economy.sync(site);
    expect(economy.snapshot().buildings[storage?.id ?? -1]).toMatchObject({ items: {}, capacity: 300 });
  });

  it('a lavoura não precisa de ferramenta', () => {
    const { site, economy } = world([]);
    site.place('farm', 8, 8, 0);
    economy.sync(site);
    runSeconds(economy, GAME_DATA.buildings.get('farm')?.extracts?.seconds ?? 0);
    expect(economy.snapshot().stock['wheat']).toBe(1);
  });

  it('extrator só pode ser construído com o recurso em volta', () => {
    const { site } = world();
    expect(site.check('lumberjack', 20, 20, 0)).toBe('noResource');
    expect(site.check('lumberjack', 2, 20, 0)).toBeNull();
  });

  it('a simulação extrai pelos ticks e publica o estoque no snapshot', () => {
    const { site, economy } = world();
    const loop = new SimulationLoop(new Simulation(site, economy));
    loop.enqueue({ type: 'placeBuilding', kind: 'lumberjack', x: 2, y: 4, rotation: 0 });
    loop.advance(0, 0);
    for (let i = 0; i < LUMBER_SECONDS * TICKS_PER_SECOND; i++) loop.simulation.step();
    expect(loop.snapshot().economy?.stock['wood']).toBe(1);
  });
});
