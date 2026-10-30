import { describe, expect, it } from 'vitest';
import { Camera, MAX_ZOOM, MIN_ZOOM } from '../src/render/camera';

describe('Camera', () => {
  it('converte tela ↔ mundo de forma inversa', () => {
    const camera = new Camera();
    camera.x = 100;
    camera.y = 50;
    camera.zoom = 2;
    const world = camera.screenToWorld({ x: 40, y: 20 });
    expect(world).toEqual({ x: 120, y: 60 });
    expect(camera.worldToScreen(world)).toEqual({ x: 40, y: 20 });
  });

  it('pan move o mundo junto com o arrasto, compensando o zoom', () => {
    const camera = new Camera();
    camera.zoom = 2;
    camera.panByScreen(20, -10);
    expect(camera.x).toBe(-10);
    expect(camera.y).toBe(5);
  });

  it('zoom mantém fixo o ponto sob o cursor', () => {
    const camera = new Camera();
    camera.x = 300;
    camera.y = 200;
    const anchor = { x: 400, y: 250 };
    const before = camera.screenToWorld(anchor);
    camera.zoomAt(anchor, 1.5);
    const after = camera.screenToWorld(anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('limita o zoom ao intervalo permitido', () => {
    const camera = new Camera();
    camera.zoomAt({ x: 0, y: 0 }, 1000);
    expect(camera.zoom).toBe(MAX_ZOOM);
    camera.zoomAt({ x: 0, y: 0 }, 0.0001);
    expect(camera.zoom).toBe(MIN_ZOOM);
  });

  it('calcula as células visíveis limitadas ao mapa', () => {
    const camera = new Camera();
    camera.x = 100;
    camera.y = -50;
    expect(camera.visibleCells(250, 200, 100, 8)).toEqual({ minX: 1, minY: 0, maxX: 3, maxY: 1 });
  });

  it('retorna null quando o mapa está fora da tela', () => {
    const camera = new Camera();
    camera.x = 5000;
    expect(camera.visibleCells(800, 600, 100, 8)).toBeNull();
  });
});
