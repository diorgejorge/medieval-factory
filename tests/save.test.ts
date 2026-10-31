import { describe, expect, it } from 'vitest';
import villageTexts from '../data/texto/pt-BR/vilarejos.json';
import { GAME_DATA } from '../src/core/data/data';
import { Economy } from '../src/core/economy/economy';
import { Simulation, type SaveData } from '../src/core/simulation';
import { createWorld } from '../src/core/world/world';

const SEED = 4242;
const SIZE = 96;

function newGame(): Simulation {
  const world = createWorld(SEED, SIZE, villageTexts.names);
  const { start, villages } = world.settlements;
  const economy = new Economy(world.grid, start?.center ?? null, GAME_DATA.start, villages, start?.area ?? null);
  return new Simulation(world.site, economy);
}

/** Primeiro canto livre onde a construção cabe. */
function placeSomewhere(simulation: Simulation, kind: string): void {
  const site = simulation.site;
  if (!site) throw new Error('sem terreno');
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (site.place(kind, x, y, 0)) return;
    }
  }
  throw new Error(`não coube ${kind}`);
}

describe('salvar e carregar', () => {
  it('o jogo carregado tem as mesmas construções, estoque, mãos, era e decreto', () => {
    const game = newGame();
    placeSomewhere(game, 'storage');
    placeSomewhere(game, 'workbench');
    if (game.site) game.economy?.sync(game.site);
    for (let i = 0; i < 90; i++) game.step();
    game.economy?.depositHand(0);
    const saved = JSON.parse(JSON.stringify(game.save(SEED))) as SaveData;

    const loaded = newGame();
    loaded.load(saved);
    expect(loaded.tick).toBe(game.tick);
    expect(loaded.era).toBe(game.era);
    expect(loaded.site?.all).toEqual(game.site?.all);
    expect(loaded.economy?.snapshot().stock).toEqual(game.economy?.snapshot().stock);
    expect(loaded.court?.view()).toEqual(game.court?.view());
    expect(loaded.save(SEED)).toEqual(saved);
  });

  it('construção nova depois de carregar ganha um id que ainda não existe', () => {
    const game = newGame();
    placeSomewhere(game, 'storage');
    const loaded = newGame();
    loaded.load(game.save(SEED));
    placeSomewhere(loaded, 'workbench');
    const ids = loaded.site?.all.map((b) => b.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
