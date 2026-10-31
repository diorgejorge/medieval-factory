import { describe, expect, it } from 'vitest';
import { TICK_MS, TICKS_PER_SECOND } from '../src/core/config';
import { GAME_DATA } from '../src/core/data/data';
import type { CartRoute } from '../src/core/economy/carts';
import { Economy, START_STORAGE_ID } from '../src/core/economy/economy';
import { Simulation, SimulationLoop } from '../src/core/simulation';
import { BuildingSite } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';

const CAPACITY = GAME_DATA.buildings.get('cart_yard')?.carts?.capacity ?? 0;
const ROAD_Y = 14;
/** Vila do jogador (armazém inicial) em 10..13 × 10..13; vilarejo em 30..36 × 10..13. */
const START_AREA = { left: 10, top: 10, width: 4, height: 4 };
const VILLAGE = { produces: ['wool'], wants: ['bread'], population: 20, area: { left: 30, top: 10, width: 7, height: 4 } };
const BREAD_OUT: CartRoute = { from: { storage: START_STORAGE_ID }, to: { village: 0 }, item: 'bread', back: 'wool' };

/** Pátio em 0..3 × 10..13; com `road`, uma estrada reta em y = 14 de x = 0 a 36. */
function setup(bread: number, road = true) {
  const grid = new Grid(40);
  const site = new BuildingSite(grid);
  const economy = new Economy(
    grid,
    { x: 12, y: 12 },
    { capacity: 100, servants: 0, stock: [{ item: 'bread', amount: bread }] },
    [VILLAGE],
    START_AREA,
  );
  const yard = site.place('cart_yard', 0, 10, 0);
  if (!yard) throw new Error('pátio não coube');
  if (road) for (let x = 0; x <= 36; x++) site.place('road', x, ROAD_Y, 0);
  economy.sync(site);
  return { grid, site, economy, yardId: yard.id };
}

function run(economy: Economy, seconds: number, each?: () => void): void {
  for (let i = 0; i < seconds * TICKS_PER_SECOND; i++) {
    economy.step();
    each?.();
  }
}

describe('carroças e estradas', () => {
  it('leva pão ao vilarejo e volta com lã, em loop, até acabar o pão', () => {
    const { economy, yardId } = setup(CAPACITY + 10);
    expect(economy.setCartRoute(yardId, BREAD_OUT)).toBe(true);
    run(economy, 60);
    const snapshot = economy.snapshot();
    // Duas viagens: a primeira cheia, a segunda com o resto; cada pão vira uma lã.
    expect(snapshot.stock).toEqual({ wool: CAPACITY + 10 });
    expect(snapshot.carts[0]).toMatchObject({ status: 'noItems', moving: false, item: null, amount: 0 });
    expect(snapshot.buildings[yardId]?.route).toEqual(BREAD_OUT);
    expect(snapshot.buildings[yardId]?.carts?.[0]?.status).toBe('noItems');
  });

  it('só anda por estrada (ou dentro do próprio pátio)', () => {
    const { economy, site, yardId } = setup(CAPACITY);
    economy.setCartRoute(yardId, BREAD_OUT);
    const offRoad: string[] = [];
    run(economy, 30, () => {
      const cart = economy.snapshot().carts[0];
      if (!cart) return;
      const x = Math.floor(cart.x);
      const y = Math.floor(cart.y);
      const kind = site.buildingAt(x, y)?.kind;
      if (kind !== 'road' && kind !== 'cart_yard') offRoad.push(`${x},${y}`);
    });
    expect(offRoad).toEqual([]);
  });

  it('desvia pela estrada em vez de cortar caminho pelo campo', () => {
    const { economy, site, yardId } = setup(CAPACITY);
    // Tira um trecho da estrada reta e liga as pontas por baixo (y = 15..16).
    for (let x = 15; x <= 17; x++) site.removeAt(x, ROAD_Y);
    for (let y = 15; y <= 16; y++) {
      site.place('road', 14, y, 0);
      site.place('road', 18, y, 0);
    }
    for (let x = 15; x <= 17; x++) site.place('road', x, 16, 0);
    economy.sync(site);
    economy.setCartRoute(yardId, BREAD_OUT);
    let lowest = 0;
    run(economy, 30, () => {
      lowest = Math.max(lowest, economy.snapshot().carts[0]?.y ?? 0);
    });
    expect(lowest).toBeCloseTo(16.5);
    expect(economy.snapshot().stock['wool']).toBe(CAPACITY);
  });

  it('sem estrada até a ponta, fica parada com status noPath', () => {
    const { economy, yardId } = setup(CAPACITY, false);
    economy.setCartRoute(yardId, BREAD_OUT);
    run(economy, 5);
    expect(economy.snapshot().carts[0]).toMatchObject({ status: 'noPath', moving: false, x: 2, y: 12 });
    expect(economy.snapshot().stock['bread']).toBe(CAPACITY);
  });

  it('a posição e a direção acompanham o movimento', () => {
    const { economy, yardId } = setup(CAPACITY);
    economy.setCartRoute(yardId, BREAD_OUT);
    run(economy, 1.5);
    const first = economy.snapshot().carts[0];
    expect(first).toMatchObject({ moving: true, status: 'moving', dir: 'e', y: ROAD_Y + 0.5 });
    run(economy, 0.5);
    const second = economy.snapshot().carts[0];
    expect(second?.x).toBeGreaterThan(first?.x ?? Infinity);
    expect(second?.dir).toBe('e');
    // Na volta, carregada de lã, anda para oeste.
    run(economy, 9);
    expect(economy.snapshot().carts[0]).toMatchObject({ item: 'wool', amount: CAPACITY, dir: 'w' });
  });

  it('a rota sobrevive a uma mudança nas construções', () => {
    const { economy, site, yardId } = setup(CAPACITY);
    economy.setCartRoute(yardId, BREAD_OUT);
    run(economy, 3);
    site.place('road', 20, 20, 0);
    economy.sync(site);
    expect(economy.snapshot().buildings[yardId]?.route).toEqual(BREAD_OUT);
    run(economy, 30);
    expect(economy.snapshot().stock['wool']).toBe(CAPACITY);
  });

  it('recusa rota impossível e aceita tirar a rota', () => {
    const { economy, yardId } = setup(CAPACITY);
    expect(economy.setCartRoute(yardId, { ...BREAD_OUT, item: 'wood' })).toBe(false); // o vilarejo não quer
    expect(economy.setCartRoute(yardId, { ...BREAD_OUT, back: 'fish' })).toBe(false); // nem produz
    expect(economy.setCartRoute(yardId, { from: { village: 0 }, to: { storage: START_STORAGE_ID }, item: 'wool' })).toBe(false); // sem pagamento
    expect(economy.setCartRoute(yardId, { ...BREAD_OUT, to: { storage: 99 } })).toBe(false);
    expect(economy.setCartRoute(99, BREAD_OUT)).toBe(false);
    expect(economy.setCartRoute(yardId, BREAD_OUT)).toBe(true);
    run(economy, 2);
    expect(economy.setCartRoute(yardId, null)).toBe(true);
    const parked = economy.snapshot().carts[0];
    run(economy, 2);
    expect(economy.snapshot().carts[0]).toMatchObject({ status: 'noRoute', moving: false, x: parked?.x, y: parked?.y });
  });

  it('comandos setCartRoute e clearCartRoute pela simulação', () => {
    const { site, economy, yardId } = setup(CAPACITY);
    const loop = new SimulationLoop(new Simulation(site, economy));
    loop.enqueue({ type: 'setCartRoute', buildingId: yardId, ...BREAD_OUT });
    loop.advance(TICK_MS, 0);
    expect(loop.snapshot().economy?.buildings[yardId]?.route).toEqual(BREAD_OUT);
    loop.enqueue({ type: 'clearCartRoute', buildingId: yardId });
    loop.advance(TICK_MS, 1);
    expect(loop.snapshot().economy?.buildings[yardId]).toMatchObject({ route: null, carts: [{ status: 'noRoute' }] });
  });

  it('pátio removido leva as carroças junto', () => {
    const { economy, site } = setup(CAPACITY);
    site.removeAt(0, 10);
    economy.sync(site);
    expect(economy.snapshot().carts).toEqual([]);
  });
});
