import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import type { ChallengesDef } from '../src/core/data/gameData';
import { KingCourt } from '../src/core/decrees';
import { Economy } from '../src/core/economy/economy';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';
import { Terrain } from '../src/core/world/terrain';
import decreeTexts from '../data/texto/pt-BR/decretos.json';

const CHALLENGES: ChallengesDef = {
  cycleSeconds: 10,
  favor: { start: 50, max: 100 },
  decrees: [
    { id: 'a', type: 'engenharia', era: 1, goal: { kind: 'deliver', deliver: 'water', to: 'fountain', amount: 3 }, reward: { favor: 15 }, penalty: { favor: 10 } },
    { id: 'b', type: 'benfeitoria', era: 1, goal: { kind: 'deliver', deliver: 'water', to: 'fountain', amount: 3 }, reward: { favor: 5 }, penalty: { favor: 10 } },
  ],
};

function counter() {
  let delivered = 0;
  return { deliveredTo: () => delivered, builtNearTown: () => 0, storedIn: () => 0, poweredCount: () => 0, add: (n: number) => (delivered += n) };
}

function run(court: KingCourt, seconds: number): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) court.step(1);
}

describe('decretos do rei', () => {
  it('todo decreto de desafios.json tem os textos do Roteiro', () => {
    const ids = new Set(decreeTexts.decrees.map((d) => d.id));
    for (const decree of GAME_DATA.challenges.decrees) expect(ids, decree.id).toContain(decree.id);
  });

  it('o decreto chega no primeiro tick e só conta o entregue depois dele', () => {
    const deliveries = counter();
    deliveries.add(10);
    const court = new KingCourt(CHALLENGES, deliveries);
    court.step(1);
    expect(court.view()).toMatchObject({ id: 'a', cycle: 1, delivered: 0, amount: 3, favor: 50 });
  });

  it('cumprir dá favor; o próximo ciclo traz um decreto de outro tipo', () => {
    const deliveries = counter();
    const court = new KingCourt(CHALLENGES, deliveries);
    court.step(1);
    deliveries.add(3);
    court.step(1);
    expect(court.view()).toMatchObject({ id: null, favor: 65, last: { id: 'a', success: true } });
    run(court, 10);
    expect(court.view()).toMatchObject({ id: 'b', cycle: 2 });
  });

  it('o prazo acabar tira favor e traz o decreto seguinte', () => {
    const court = new KingCourt(CHALLENGES, counter());
    run(court, 10.5);
    expect(court.view()).toMatchObject({ id: 'b', cycle: 2, favor: 40, last: { id: 'a', success: false } });
  });
});

describe('tomada d\'água e fonte', () => {
  function village(home: { x: number; y: number }) {
    const grid = new Grid(40);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 2; x++) grid.setTerrain(x, y, Terrain.Water);
    const site = new BuildingSite(grid);
    const economy = new Economy(grid, home, { capacity: 50, servants: 0, stock: [] });
    site.place('water_intake', 2, 0, 0); // 4×4 em (2..5, 0..3), rio a oeste
    for (let x = 6; x <= 8; x++) site.place('belt', x, 1, 3); // leste até a fonte
    site.place('fountain', 9, 0, 0); // 2×2 em (9..10, 0..1)
    economy.sync(site);
    const fountain = site.buildingAt(9, 0)?.id ?? -1;
    return { economy, fountain };
  }

  it('a água vai pela esteira até a fonte perto da vila, que conta e jorra', () => {
    const { economy, fountain } = village({ x: 12, y: 4 });
    for (let i = 0; i < 12 * TICKS_PER_SECOND; i++) economy.step();
    expect(economy.deliveredTo('fountain', 'water')).toBeGreaterThanOrEqual(2);
    expect(economy.snapshot().buildings[fountain]?.status).toBe('working');
  });

  it('fonte longe da vila recusa a água', () => {
    const { economy, fountain } = village({ x: 38, y: 38 });
    for (let i = 0; i < 12 * TICKS_PER_SECOND; i++) economy.step();
    expect(economy.deliveredTo('fountain', 'water')).toBe(0);
    expect(economy.snapshot().buildings[fountain]?.status).toBe('farFromTown');
  });
});

describe('contagem para os decretos', () => {
  it('conta o que chega numa máquina por esteira e tudo o que foi produzido', () => {
    const grid = new Grid(40);
    const site = new BuildingSite(grid);
    const economy = new Economy(grid, { x: 39, y: 39 }, { capacity: 50, servants: 0, stock: [] });
    site.place('farm', 0, 0, 0);
    for (let x = 4; x <= 6; x++) site.place('belt', x, 1, 3);
    site.place('mill', 7, 0, 0);
    for (let x = 11; x <= 12; x++) site.place('belt', x, 1, 3);
    site.place('storage', 13, 0, 0);
    economy.sync(site);
    const farmSeconds = GAME_DATA.buildings.get('farm')?.extracts?.seconds ?? 0;
    for (let i = 0; i < (farmSeconds * 2 + 15) * TICKS_PER_SECOND; i++) economy.step();
    expect(economy.deliveredTo('mill', 'wheat')).toBeGreaterThanOrEqual(2);
    expect(economy.deliveredTo('produce', 'wheat')).toBeGreaterThanOrEqual(2);
    expect(economy.deliveredTo('produce', 'flour')).toBe(1);
  });

  it('os decretos usam construção, "village" e "produce" como destino', () => {
    const targets = new Set(GAME_DATA.challenges.decrees.flatMap((d) => (d.goal.kind === 'deliver' ? [d.goal.to] : [])));
    expect(targets).toEqual(new Set(['fountain', 'oven', 'village', 'produce']));
    expect(GAME_DATA.challenges.decrees.map((d) => d.goal.kind)).toContain('build');
    expect(GAME_DATA.challenges.decrees.map((d) => d.goal.kind)).toContain('stock');
  });
});

describe('benfeitorias (frente 19)', () => {
  it('poço perto da vila conta; longe, não; celeiro conta o trigo guardado nele', () => {
    const grid = new Grid(60);
    const site = new BuildingSite(grid);
    const economy = new Economy(grid, { x: 10, y: 10 }, { capacity: 50, servants: 0, stock: [] });
    site.place('well', 12, 12, 0);
    site.place('well', 50, 50, 0);
    site.place('granary', 20, 20, 0);
    economy.sync(site);
    expect(economy.builtNearTown('well')).toBe(1);
    expect(economy.storedIn('granary', 'wheat')).toBe(0);
  });

  it('a corte mede construção e estoque pelo que há agora, sem linha de base', () => {
    let wells = 1;
    const court = new KingCourt(
      {
        cycleSeconds: 10,
        favor: { start: 50, max: 100 },
        decrees: [{ id: 'p', type: 'benfeitoria', era: 1, goal: { kind: 'build', build: 'well', amount: 2 }, reward: { favor: 10 }, penalty: { favor: 10 } }],
      },
      { deliveredTo: () => 0, builtNearTown: () => wells, storedIn: () => 0, poweredCount: () => 0 },
    );
    court.step(1);
    expect(court.view()).toMatchObject({ id: 'p', delivered: 1, amount: 2 });
    wells = 2;
    court.step(1);
    expect(court.view()).toMatchObject({ last: { id: 'p', success: true }, favor: 60 });
  });
});
