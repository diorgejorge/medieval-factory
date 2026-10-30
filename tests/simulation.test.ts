import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND, TICK_MS } from '../src/core/config';
import { SimulationLoop } from '../src/core/simulation';

/** Simula `seconds` de tempo real em passos de ~60 FPS. */
function runFor(loop: SimulationLoop, seconds: number, startMs = 0): number {
  const frameMs = 1000 / 60;
  const frames = Math.round((seconds * 1000) / frameMs);
  let now = startMs;
  for (let i = 0; i < frames; i++) {
    now += frameMs;
    loop.advance(frameMs, now);
  }
  return now;
}

describe('SimulationLoop', () => {
  it(`roda ${TICKS_PER_SECOND} ticks por segundo de tempo real`, () => {
    const loop = new SimulationLoop();
    runFor(loop, 2);
    expect(loop.snapshot().tick).toBeCloseTo(2 * TICKS_PER_SECOND, -1);
    expect(Math.abs(loop.snapshot().ups - TICKS_PER_SECOND)).toBeLessThanOrEqual(1);
  });

  it('não avança enquanto pausado e retoma depois', () => {
    const loop = new SimulationLoop();
    loop.enqueue({ type: 'setPaused', paused: true });
    runFor(loop, 1);
    expect(loop.snapshot()).toMatchObject({ tick: 0, paused: true });

    loop.enqueue({ type: 'setPaused', paused: false });
    loop.advance(TICK_MS * 3, 0);
    expect(loop.snapshot().tick).toBe(3);
  });

  it('acelera conforme a velocidade escolhida', () => {
    const loop = new SimulationLoop();
    loop.enqueue({ type: 'setSpeed', speed: 4 });
    runFor(loop, 1);
    expect(loop.snapshot().speed).toBe(4);
    expect(loop.snapshot().tick).toBeCloseTo(4 * TICKS_PER_SECOND, -1);
  });

  it('é determinística: mesma sequência de entradas gera o mesmo tick', () => {
    const a = new SimulationLoop();
    const b = new SimulationLoop();
    runFor(a, 3);
    runFor(b, 3);
    expect(a.snapshot().tick).toBe(b.snapshot().tick);
  });
});
