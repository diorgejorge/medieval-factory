import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/core/time/fixedStepClock';
import { RateMeter } from '../src/core/time/rateMeter';

describe('FixedStepClock', () => {
  it('acumula frações de passo entre chamadas', () => {
    const clock = new FixedStepClock(10, 100);
    expect(clock.advance(4)).toBe(0);
    expect(clock.advance(7)).toBe(1);
    expect(clock.advance(9)).toBe(1);
  });

  it('roda vários passos de uma vez quando atrasado', () => {
    const clock = new FixedStepClock(10, 100);
    expect(clock.advance(35)).toBe(3);
    expect(clock.advance(5)).toBe(1);
  });

  it('limita os passos e descarta o atraso excedente', () => {
    const clock = new FixedStepClock(10, 4);
    expect(clock.advance(1000)).toBe(4);
    expect(clock.advance(5)).toBe(0);
  });

  it('ignora tempo negativo', () => {
    const clock = new FixedStepClock(10, 4);
    expect(clock.advance(-50)).toBe(0);
    expect(clock.advance(10)).toBe(1);
  });
});

describe('RateMeter', () => {
  it('reporta eventos por segundo ao fechar cada janela', () => {
    const meter = new RateMeter(1000);
    meter.record(0, 0);
    meter.record(15, 500);
    expect(meter.perSecond).toBe(0);
    meter.record(15, 1000);
    expect(meter.perSecond).toBe(30);
  });
});
