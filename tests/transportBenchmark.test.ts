import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/core/config';
import { Segment, TransportNetwork } from '../src/core/economy/transport';
import type { Rotation } from '../src/core/world/buildings';
import { Grid } from '../src/core/world/grid';

/**
 * Frente 14: 5 mil itens andando nas esteiras sem derrubar o UPS.
 * Um tick tem ~33 ms (30 UPS); o transporte tem de ficar numa fração pequena disso.
 * Teto folgado para não falhar à toa no CI (máquinas do GitHub Actions são lentas e variam).
 */
const BUDGET_MS_PER_TICK = 4;

const BELT = { speed: 2, gravity: false };
const RINGS = 64;
/** Cada anel ocupa 2 linhas × RING_LENGTH colunas: 2 × RING_LENGTH tiles. */
const RING_LENGTH = 40;
/** Itens por tile no começo: em 0 e 0,5 (metade da lotação, para a fila sempre andar). */
const ITEMS_PER_TILE = 2;
const WARMUP_TICKS = 60;
const MEASURED_TICKS = 300;

/**
 * Anel fechado em (0..len-1, y..y+1): leste na linha de cima, desce no fim, oeste na de baixo, sobe no começo.
 * Devolve os segmentos na ordem em que o item passa por eles.
 */
function ring(firstId: number, y: number, len: number): Segment[] {
  const path: Segment[] = [];
  let id = firstId;
  for (let x = 0; x < len - 1; x++) path.push(new Segment(id++, x, y, 3 as Rotation, BELT));
  path.push(new Segment(id++, len - 1, y, 0 as Rotation, BELT));
  for (let x = len - 1; x > 0; x--) path.push(new Segment(id++, x, y + 1, 1 as Rotation, BELT));
  path.push(new Segment(id++, 0, y + 1, 2 as Rotation, BELT));
  return path;
}

describe('benchmark das esteiras', () => {
  it(`5 mil+ itens andando custam menos de ${BUDGET_MS_PER_TICK} ms por tick`, () => {
    const grid = new Grid(256);
    const network = new TransportNetwork(grid);
    const rings: Segment[][] = [];
    for (let r = 0; r < RINGS; r++) rings.push(ring(r * RING_LENGTH * 2 + 1, r * 2, RING_LENGTH));
    network.rebuild(rings.flat());

    // Cada item tem nome único para sabermos em que tile do anel ele está.
    let total = 0;
    for (const path of rings) {
      for (const segment of path) {
        for (let k = ITEMS_PER_TILE - 1; k >= 0; k--) {
          segment.items.push({ item: `i${total++}`, t: k / ITEMS_PER_TILE });
        }
      }
    }
    expect(total).toBeGreaterThanOrEqual(5000);

    const positions = (): Map<string, number> => {
      const where = new Map<string, number>();
      for (const path of rings) path.forEach((segment, index) => segment.items.forEach((i) => where.set(i.item, index)));
      return where;
    };

    const deliver = (): boolean => false;
    for (let i = 0; i < WARMUP_TICKS; i++) network.step(deliver);

    const before = positions();
    const start = performance.now();
    for (let i = 0; i < MEASURED_TICKS; i++) network.step(deliver);
    const msPerTick = (performance.now() - start) / MEASURED_TICKS;
    const after = positions();

    console.info(
      `[benchmark] ${total} itens em ${RINGS * RING_LENGTH * 2} segmentos: ${msPerTick.toFixed(3)} ms/tick ` +
        `(${((msPerTick / TICK_MS) * 100).toFixed(1)}% do tick de ${TICK_MS.toFixed(1)} ms)`,
    );

    // Nenhum item some nem duplica nos anéis.
    expect(after.size).toBe(total);
    // 300 ticks a 2 tiles/s = 20 tiles: praticamente todo item tem de ter trocado de tile.
    let moved = 0;
    for (const [item, index] of after) if (before.get(item) !== index) moved++;
    expect(moved / total).toBeGreaterThan(0.95);

    expect(msPerTick).toBeLessThan(BUDGET_MS_PER_TICK);
  });
});
