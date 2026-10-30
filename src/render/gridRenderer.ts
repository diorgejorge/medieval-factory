import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { CHUNK_SIZE_TILES, TILE_SIZE_PX } from '../core/config';
import { hash2d } from '../core/random/rng';
import type { Grid } from '../core/world/grid';
import { Terrain } from '../core/world/terrain';
import type { Camera } from './camera';
import { ATLAS_VARIANTS, TERRAIN_FRAME_PREFIX, type AtlasFrame, type TerrainAtlas } from './terrainAtlas';
import { paintChunk } from './terrainPixels';

const CHUNK_SIZE_PX = CHUNK_SIZE_TILES * TILE_SIZE_PX;
/** A água anima a ~4 FPS, como definido no atlas da equipe Visual. */
const WATER_FRAME_MS = 250;
/** Quanto o relevo clareia/escurece cada tile: ajuda a ler colinas e vales. */
const RELIEF_SHADE_RANGE = 0.3;
const MAX_HEIGHT = 255;
const VARIANT_SEED = 0x7ea1;

/**
 * Cada chunk vira uma textura pintada uma única vez; no frame só alternamos a visibilidade
 * dos sprites (culling). A água fica numa camada animada por baixo, vista pelos "buracos" dos chunks.
 */
export class GridRenderer {
  readonly view = new Container();
  private readonly chunks: Sprite[] = [];
  private readonly chunksPerSide: number;
  private readonly water: TilingSprite | null = null;
  private readonly waterFrames: Texture[] = [];
  private waterFrameIndex = 0;
  private sinceWaterFrameMs = 0;

  constructor(grid: Grid, atlas: TerrainAtlas | null) {
    this.chunksPerSide = Math.ceil(grid.size / CHUNK_SIZE_TILES);

    this.waterFrames = atlas ? atlas.waterAnimation.map((frame) => frameTexture(atlas.image, frame)) : [];
    const firstWaterFrame = this.waterFrames[0];
    if (firstWaterFrame) {
      this.water = new TilingSprite({
        texture: firstWaterFrame,
        width: grid.size * TILE_SIZE_PX,
        height: grid.size * TILE_SIZE_PX,
      });
      this.view.addChild(this.water);
    }

    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_SIZE_PX;
    canvas.height = CHUNK_SIZE_PX;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível');
    context.imageSmoothingEnabled = false;

    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        context.clearRect(0, 0, CHUNK_SIZE_PX, CHUNK_SIZE_PX);
        const firstX = cx * CHUNK_SIZE_TILES;
        const firstY = cy * CHUNK_SIZE_TILES;
        if (atlas && this.water) drawChunkFromAtlas(context, grid, atlas, firstX, firstY);
        else drawProceduralChunk(context, grid, firstX, firstY);
        const sprite = new Sprite(nearestTexture(copyCanvas(canvas)));
        sprite.position.set(cx * CHUNK_SIZE_PX, cy * CHUNK_SIZE_PX);
        this.chunks.push(sprite);
        this.view.addChild(sprite);
      }
    }
  }

  /** Avança a animação da água. Chamar uma vez por frame. */
  update(deltaMs: number): void {
    if (!this.water || this.waterFrames.length < 2) return;
    this.sinceWaterFrameMs += deltaMs;
    if (this.sinceWaterFrameMs < WATER_FRAME_MS) return;
    this.sinceWaterFrameMs %= WATER_FRAME_MS;
    this.waterFrameIndex = (this.waterFrameIndex + 1) % this.waterFrames.length;
    const next = this.waterFrames[this.waterFrameIndex];
    if (next) this.water.texture = next;
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
}

/** Desenha os tiles do atlas; a água fica transparente para a camada animada aparecer. */
function drawChunkFromAtlas(
  context: CanvasRenderingContext2D,
  grid: Grid,
  atlas: TerrainAtlas,
  firstX: number,
  firstY: number,
): void {
  for (let ty = 0; ty < CHUNK_SIZE_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE_TILES; tx++) {
      const x = firstX + tx;
      const y = firstY + ty;
      if (!grid.isInside(x, y)) continue;
      const terrain = grid.getTerrain(x, y);
      if (terrain === Terrain.Water) continue;
      const variant = hash2d(x, y, VARIANT_SEED) % ATLAS_VARIANTS;
      const frame = atlas.frames.get(`${TERRAIN_FRAME_PREFIX[terrain]}_${variant}`);
      if (!frame) continue;
      const dx = tx * TILE_SIZE_PX;
      const dy = ty * TILE_SIZE_PX;
      context.drawImage(atlas.image, frame.x, frame.y, frame.w, frame.h, dx, dy, TILE_SIZE_PX, TILE_SIZE_PX);
      shadeByRelief(context, grid.getHeight(x, y), dx, dy);
    }
  }
}

function shadeByRelief(context: CanvasRenderingContext2D, height: number, dx: number, dy: number): void {
  const shade = (height / MAX_HEIGHT - 0.5) * RELIEF_SHADE_RANGE;
  context.fillStyle = shade < 0 ? `rgba(0,0,0,${-shade})` : `rgba(255,255,255,${shade * 0.6})`;
  context.fillRect(dx, dy, TILE_SIZE_PX, TILE_SIZE_PX);
}

/** Sem atlas, usa a pintura procedural (placeholder). */
function drawProceduralChunk(context: CanvasRenderingContext2D, grid: Grid, firstX: number, firstY: number): void {
  const image = context.createImageData(CHUNK_SIZE_PX, CHUNK_SIZE_PX);
  paintChunk(grid, firstX, firstY, CHUNK_SIZE_TILES, image.data);
  context.putImageData(image, 0, 0);
}

/** Copia um quadro do atlas para uma textura própria: TilingSprite precisa repetir a textura inteira. */
function frameTexture(image: HTMLImageElement, frame: AtlasFrame): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = frame.w;
  canvas.height = frame.h;
  canvas.getContext('2d')?.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  return nearestTexture(canvas);
}

function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d')?.drawImage(source, 0, 0);
  return canvas;
}

function nearestTexture(canvas: HTMLCanvasElement): Texture {
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}
