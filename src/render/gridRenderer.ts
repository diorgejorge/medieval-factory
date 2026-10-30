import { Container, Sprite, Texture } from 'pixi.js';
import { CHUNK_SIZE_TILES, TILE_SIZE_PX } from '../core/config';
import type { Grid } from '../core/world/grid';
import type { Camera } from './camera';
import { paintChunk } from './terrainPixels';

const CHUNK_SIZE_PX = CHUNK_SIZE_TILES * TILE_SIZE_PX;

/**
 * Cada chunk vira uma textura pixel art pintada uma única vez; no frame só alternamos
 * a visibilidade dos sprites (culling). São ~64 sprites para um mapa 256×256.
 */
export class GridRenderer {
  readonly view = new Container();
  private readonly chunks: Sprite[] = [];
  private readonly chunksPerSide: number;

  constructor(grid: Grid) {
    this.chunksPerSide = Math.ceil(grid.size / CHUNK_SIZE_TILES);
    const image = new ImageData(CHUNK_SIZE_PX, CHUNK_SIZE_PX);

    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        image.data.fill(0);
        paintChunk(grid, cx * CHUNK_SIZE_TILES, cy * CHUNK_SIZE_TILES, CHUNK_SIZE_TILES, image.data);
        const sprite = new Sprite(this.createTexture(image));
        sprite.position.set(cx * CHUNK_SIZE_PX, cy * CHUNK_SIZE_PX);
        this.chunks.push(sprite);
        this.view.addChild(sprite);
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

  /** Cada chunk ganha seu canvas; o buffer de pixels é reaproveitado entre chunks. */
  private createTexture(image: ImageData): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')?.putImageData(image, 0, 0);
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'nearest';
    return texture;
  }
}
