import { hash2d } from './rng';

const UINT32_RANGE = 0x100000000;

/** Ruído de valor 2D com interpolação suave, em [0, 1). Determinístico pela seed. */
export function valueNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const top = lerp(corner(x0, y0, seed), corner(x0 + 1, y0, seed), tx);
  const bottom = lerp(corner(x0, y0 + 1, seed), corner(x0 + 1, y0 + 1, seed), tx);
  return lerp(top, bottom, ty);
}

/**
 * Soma de oitavas de ruído (fractal Brownian motion), normalizada para [0, 1).
 * Mais oitavas = mais detalhe fino; é o que deixa costas e relevo com cara natural.
 */
export function fractalNoise2d(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  persistence = 0.5,
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;
  for (let octave = 0; octave < octaves; octave++) {
    total += valueNoise2d(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total / maxAmplitude;
}

function corner(x: number, y: number, seed: number): number {
  return hash2d(x, y, seed) / UINT32_RANGE;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
