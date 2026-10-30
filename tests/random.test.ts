import { describe, expect, it } from 'vitest';
import { fractalNoise2d, valueNoise2d } from '../src/core/random/noise';
import { Rng, hash2d } from '../src/core/random/rng';

describe('Rng', () => {
  it('mesma seed gera a mesma sequência', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 100; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it('seeds diferentes geram sequências diferentes', () => {
    expect(new Rng(1).nextUint32()).not.toBe(new Rng(2).nextUint32());
  });

  it('gera floats em [0, 1) e inteiros no intervalo pedido', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const int = rng.int(3, 5);
      expect(int).toBeGreaterThanOrEqual(3);
      expect(int).toBeLessThanOrEqual(5);
    }
  });
});

describe('ruído', () => {
  it('hash2d é determinístico e depende da seed', () => {
    expect(hash2d(4, 9, 1)).toBe(hash2d(4, 9, 1));
    expect(hash2d(4, 9, 1)).not.toBe(hash2d(4, 9, 2));
  });

  it('ruído de valor fica em [0, 1) e é contínuo', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const value = valueNoise2d(x, 1.5, 99);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(Math.abs(valueNoise2d(x + 0.001, 1.5, 99) - value)).toBeLessThan(0.01);
    }
  });

  it('ruído fractal é determinístico e normalizado', () => {
    const value = fractalNoise2d(3.3, 8.1, 5, 4);
    expect(fractalNoise2d(3.3, 8.1, 5, 4)).toBe(value);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});
