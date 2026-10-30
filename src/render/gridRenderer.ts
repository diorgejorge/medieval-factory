import { Container, Graphics } from 'pixi.js';
import { CHUNK_SIZE_TILES, TILE_SIZE_PX } from '../core/config';
import type { Grid } from '../core/world/grid';
import type { Camera } from './camera';
import { TERRAIN_COLORS } from './terrainPalette';

const CHUNK_SIZE_PX = CHUNK_SIZE_TILES * TILE_SIZE_PX;

/**
 * Desenha o terreno em um Graphics por chunk. A geometria é construída uma vez;
 * a cada frame só alternamos a visibilidade dos chunks (culling).
 */
export class GridRenderer {
  readonly view = new Container();
  private readonly chunks: Graphics[] = [];
  private readonly chunksPerSide: number;

  constructor(private readonly grid: Grid) {
    this.chunksPerSide = Math.ceil(grid.size / CHUNK_SIZE_TILES);
    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        const chunk = this.buildChunk(cx, cy);
        this.chunks.push(chunk);
        this.view.addChild(chunk);
      }
    }
  }

  cull(camera: Camera, viewWidth: number, viewHeight: number): void {
    const visible = camera.visibleCells(viewWidth, viewHeight, CHUNK_SIZE_PX, this.chunksPerSide);
    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        const chunk = this.chunks[cy * this.chunksPerSide + cx];
        if (!chunk) continue;
        chunk.visible =
          visible !== null &&
          cx >= visible.minX &&
          cx <= visible.maxX &&
          cy >= visible.minY &&
          cy <= visible.maxY;
      }
    }
  }

  private buildChunk(cx: number, cy: number): Graphics {
    // Agrupa os tiles por cor e preenche cada grupo de uma vez: menos chamadas de fill.
    const tilesByColor = new Map<number, number[]>();
    const startX = cx * CHUNK_SIZE_TILES;
    const startY = cy * CHUNK_SIZE_TILES;
    const endX = Math.min(startX + CHUNK_SIZE_TILES, this.grid.size);
    const endY = Math.min(startY + CHUNK_SIZE_TILES, this.grid.size);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const shades = TERRAIN_COLORS[this.grid.getTerrain(x, y)];
        const color = shades[(x + y) & 1] ?? shades[0];
        let tiles = tilesByColor.get(color);
        if (!tiles) {
          tiles = [];
          tilesByColor.set(color, tiles);
        }
        tiles.push(x, y);
      }
    }

    const graphics = new Graphics();
    for (const [color, tiles] of tilesByColor) {
      for (let i = 0; i < tiles.length; i += 2) {
        const tileX = tiles[i] ?? 0;
        const tileY = tiles[i + 1] ?? 0;
        graphics.rect(tileX * TILE_SIZE_PX, tileY * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
      }
      graphics.fill(color);
    }
    return graphics;
  }
}
