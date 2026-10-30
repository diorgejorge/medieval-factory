import { describe, expect, it } from 'vitest';
import { TILE_SIZE_PX } from '../src/core/config';
import { generateWorld } from '../src/core/world/generator';
import { paintChunk } from '../src/render/terrainPixels';

const TILES = 8;
const PIXELS = (TILES * TILE_SIZE_PX) ** 2 * 4;

describe('paintChunk', () => {
  it('pinta todos os pixels de forma opaca', () => {
    const out = new Uint8ClampedArray(PIXELS);
    paintChunk(generateWorld(3, 32), 0, 0, TILES, out);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });

  it('é determinístico: o mesmo mapa tem sempre a mesma imagem', () => {
    const grid = generateWorld(3, 32);
    const a = new Uint8ClampedArray(PIXELS);
    const b = new Uint8ClampedArray(PIXELS);
    paintChunk(grid, 8, 8, TILES, a);
    paintChunk(grid, 8, 8, TILES, b);
    expect(a).toEqual(b);
  });

  it('deixa transparente o que fica fora do mapa', () => {
    const out = new Uint8ClampedArray(PIXELS);
    paintChunk(generateWorld(3, 4), 0, 0, TILES, out);
    expect(out[3]).toBe(255);
    expect(out[out.length - 1]).toBe(0);
  });
});
