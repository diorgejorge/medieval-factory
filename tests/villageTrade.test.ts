import { describe, expect, it } from 'vitest';
import { Economy } from '../src/core/economy/economy';
import { MIN_POPULATION, RECRUIT_FOOD, TRADE_AMOUNT } from '../src/core/economy/villageTrade';
import { Simulation, SimulationLoop } from '../src/core/simulation';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';

const VILLAGE = { produces: ['fish', 'wheat'], wants: ['firewood'], population: 20 };

function setup(stock: { item: string; amount: number }[], population = VILLAGE.population, capacity = 200) {
  const grid = new Grid(20);
  const economy = new Economy(grid, { x: 5, y: 5 }, { capacity, servants: 1, stock }, [{ ...VILLAGE, population }]);
  return { grid, economy };
}

describe('troca e recrutamento nos vilarejos', () => {
  it('troca o que o vilarejo pede pelo que ele produz', () => {
    const { economy } = setup([{ item: 'firewood', amount: 7 }]);
    expect(economy.tradeWithVillage(0, 'firewood', 'fish')).toBe(true);
    const snapshot = economy.snapshot();
    expect(snapshot.stock).toEqual({ firewood: 7 - TRADE_AMOUNT, fish: TRADE_AMOUNT });
    expect(snapshot.villages[0]).toMatchObject({ result: 'tradeAccepted', requests: 1 });
  });

  it('recusa item que o vilarejo não pede, produto que ele não faz ou falta de estoque', () => {
    const { economy } = setup([
      { item: 'firewood', amount: TRADE_AMOUNT - 1 },
      { item: 'wood', amount: 10 },
    ]);
    expect(economy.tradeWithVillage(0, 'wood', 'fish')).toBe(false);
    expect(economy.tradeWithVillage(0, 'firewood', 'wool')).toBe(false);
    expect(economy.tradeWithVillage(0, 'firewood', 'fish')).toBe(false);
    expect(economy.snapshot().villages[0]).toMatchObject({ result: 'tradeRefused', requests: 3 });
    expect(economy.snapshot().stock['firewood']).toBe(TRADE_AMOUNT - 1);
  });

  it('recruta um servo pagando comida e o vilarejo perde um morador', () => {
    const { economy } = setup([
      { item: 'bread', amount: 6 },
      { item: 'fish', amount: 6 },
    ]);
    expect(economy.recruitFromVillage(0)).toBe(true);
    const snapshot = economy.snapshot();
    expect(snapshot.servants).toHaveLength(2);
    expect(snapshot.villages[0]?.population).toBe(VILLAGE.population - 1);
    const food = (snapshot.stock['bread'] ?? 0) + (snapshot.stock['fish'] ?? 0);
    expect(food).toBe(12 - RECRUIT_FOOD);
  });

  it('não recruta sem comida ou com o vilarejo pequeno demais', () => {
    expect(setup([{ item: 'bread', amount: RECRUIT_FOOD - 1 }]).economy.recruitFromVillage(0)).toBe(false);
    expect(setup([{ item: 'bread', amount: RECRUIT_FOOD }], MIN_POPULATION).economy.recruitFromVillage(0)).toBe(false);
  });

  it('funciona por comandos na simulação', () => {
    const { grid, economy } = setup([{ item: 'firewood', amount: 5 }, { item: 'bread', amount: 10 }]);
    const loop = new SimulationLoop(new Simulation(new BuildingSite(grid), economy));
    loop.enqueue({ type: 'trade', village: 0, give: 'firewood', receive: 'wheat' });
    loop.enqueue({ type: 'recruit', village: 0 });
    loop.advance(0, 0);
    const snapshot = loop.snapshot().economy;
    expect(snapshot?.stock['wheat']).toBe(TRADE_AMOUNT);
    expect(snapshot?.servants).toHaveLength(2);
  });
});
