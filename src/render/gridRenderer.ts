import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { CHUNK_SIZE_TILES, TILE_SIZE_PX } from '../core/config';
import { hash2d } from '../core/random/rng';
import type { Grid } from '../core/world/grid';
import { Terrain } from '../core/world/terrain';
import type { Atlas } from './atlas';
import type { Camera } from './camera';
import { ATLAS_VARIANTS, TERRAIN_FRAME_PREFIX, transitionFrame } from './terrainAtlas';
import { paintChunk } from './terrainPixels';

const CHUNK_SIZE_PX = CHUNK_SIZE_TILES * TILE_SIZE_PX;
/** A ondinha da água anima a ~4 FPS, como definido no atlas da equipe Visual. */
const RIPPLE_FRAME_MS = 250;
/** ~1 de cada 7 tiles de água em mar aberto ganha uma ondinha (docs/ESTILO.md). */
const RIPPLE_EVERY = 7;
const RIPPLE_SEED = 0x51bb;
/** Quanto o relevo clareia/escurece cada tile: ajuda a ler colinas e vales. */
const RELIEF_SHADE_RANGE = 0.3;
const MAX_HEIGHT = 255;
const VARIANT_SEED = 0x7ea1;

/**
 * Cada chunk vira uma textura pintada uma única vez; no frame só alternamos a visibilidade
 * dos sprites (culling). As ondinhas da água são sprites por cima, agrupados por chunk.
 */
export class GridRenderer {
  readonly view = new Container();
  private readonly chunks: Sprite[] = [];
  private readonly ripples: Container[] = [];
  private readonly chunksPerSide: number;
  private readonly rippleFrames: Texture[] = [];
  private rippleFrameIndex = 0;
  private sinceRippleFrameMs = 0;

  constructor(grid: Grid, atlas: Atlas | null) {
    this.chunksPerSide = Math.ceil(grid.size / CHUNK_SIZE_TILES);
    if (atlas) {
      const source = nearestTexture(atlas.image).source;
      this.rippleFrames = (atlas.animations.get('water_ripple') ?? []).map(
        (f) => new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) }),
      );
    }

    const canvas = document.createElement('canvas');
    canvas.width = CHUNK_SIZE_PX;
    canvas.height = CHUNK_SIZE_PX;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponível');
    context.imageSmoothingEnabled = false;

    const rippleLayer = new Container();
    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        context.clearRect(0, 0, CHUNK_SIZE_PX, CHUNK_SIZE_PX);
        const firstX = cx * CHUNK_SIZE_TILES;
        const firstY = cy * CHUNK_SIZE_TILES;
        if (atlas) drawChunkFromAtlas(context, grid, atlas, firstX, firstY);
        else drawProceduralChunk(context, grid, firstX, firstY);
        const sprite = new Sprite(nearestTexture(copyCanvas(canvas)));
        sprite.position.set(cx * CHUNK_SIZE_PX, cy * CHUNK_SIZE_PX);
        this.chunks.push(sprite);
        this.view.addChild(sprite);

        const ripples = this.createRipples(grid, firstX, firstY);
        this.ripples.push(ripples);
        rippleLayer.addChild(ripples);
      }
    }
    this.view.addChild(rippleLayer);
  }

  /** Avança a animação da água. Chamar uma vez por frame. */
  update(deltaMs: number): void {
    if (this.rippleFrames.length < 2) return;
    this.sinceRippleFrameMs += deltaMs;
    if (this.sinceRippleFrameMs < RIPPLE_FRAME_MS) return;
    this.sinceRippleFrameMs %= RIPPLE_FRAME_MS;
    this.rippleFrameIndex = (this.rippleFrameIndex + 1) % this.rippleFrames.length;
    for (const chunk of this.ripples) {
      if (!chunk.visible) continue;
      for (const ripple of chunk.children as Ripple[]) {
        const frame = this.rippleFrames[(this.rippleFrameIndex + ripple.phase) % this.rippleFrames.length];
        if (frame) ripple.texture = frame;
      }
    }
  }

  cull(camera: Camera, viewWidth: number, viewHeight: number): void {
    const visible = camera.visibleCells(viewWidth, viewHeight, CHUNK_SIZE_PX, this.chunksPerSide);
    for (let cy = 0; cy < this.chunksPerSide; cy++) {
      for (let cx = 0; cx < this.chunksPerSide; cx++) {
        const index = cy * this.chunksPerSide + cx;
        const isVisible =
          visible !== null &&
          cx >= visible.minX &&
          cx <= visible.maxX &&
          cy >= visible.minY &&
          cy <= visible.maxY;
        const chunk = this.chunks[index];
        const ripples = this.ripples[index];
        if (chunk) chunk.visible = isVisible;
        if (ripples) ripples.visible = isVisible;
      }
    }
  }

  /** Ondinhas só em água aberta (os 8 vizinhos são água), para não invadirem a margem. */
  private createRipples(grid: Grid, firstX: number, firstY: number): Container {
    const container = new Container();
    const firstFrame = this.rippleFrames[0];
    if (!firstFrame) return container;
    for (let y = firstY; y < firstY + CHUNK_SIZE_TILES; y++) {
      for (let x = firstX; x < firstX + CHUNK_SIZE_TILES; x++) {
        if (!isOpenWater(grid, x, y)) continue;
        const roll = hash2d(x, y, RIPPLE_SEED);
        if (roll % RIPPLE_EVERY !== 0) continue;
        const ripple = new Ripple(firstFrame, (roll >>> 8) % this.rippleFrames.length);
        ripple.position.set(x * TILE_SIZE_PX, y * TILE_SIZE_PX);
        container.addChild(ripple);
      }
    }
    return container;
  }
}

/** Cada ondinha começa num quadro diferente, senão o lago inteiro "pisca" junto. */
class Ripple extends Sprite {
  constructor(
    texture: Texture,
    readonly phase: number,
  ) {
    super(texture);
  }
}

function isOpenWater(grid: Grid, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!grid.isInside(x + dx, y + dy) || grid.getTerrain(x + dx, y + dy) !== Terrain.Water) return false;
    }
  }
  return true;
}

/**
 * Pinta o chunk em três passadas: tiles base, transições (dual grid, deslocadas meio tile,
 * cada uma no canto entre 4 células) e o sombreamento do relevo.
 */
function drawChunkFromAtlas(
  context: CanvasRenderingContext2D,
  grid: Grid,
  atlas: Atlas,
  firstX: number,
  firstY: number,
): void {
  forEachChunkTile(grid, firstX, firstY, (x, y, dx, dy) => {
    const variant = hash2d(x, y, VARIANT_SEED) % ATLAS_VARIANTS;
    drawFrame(context, atlas, `${TERRAIN_FRAME_PREFIX[grid.getTerrain(x, y)]}_${variant}`, dx, dy);
  });

  // Os cantos vão de firstX até firstX + CHUNK inclusive: as transições da borda passam para o vizinho.
  const half = TILE_SIZE_PX / 2;
  for (let cy = firstY; cy <= firstY + CHUNK_SIZE_TILES; cy++) {
    for (let cx = firstX; cx <= firstX + CHUNK_SIZE_TILES; cx++) {
      if (!grid.isInside(cx - 1, cy - 1) || !grid.isInside(cx, cy)) continue;
      const frame = transitionFrame(
        grid.getTerrain(cx - 1, cy - 1),
        grid.getTerrain(cx, cy - 1),
        grid.getTerrain(cx - 1, cy),
        grid.getTerrain(cx, cy),
      );
      if (!frame) continue;
      drawFrame(context, atlas, frame, (cx - firstX) * TILE_SIZE_PX - half, (cy - firstY) * TILE_SIZE_PX - half);
    }
  }

  forEachChunkTile(grid, firstX, firstY, (x, y, dx, dy) => {
    if (grid.getTerrain(x, y) !== Terrain.Water) shadeByRelief(context, grid.getHeight(x, y), dx, dy);
  });
}

function forEachChunkTile(
  grid: Grid,
  firstX: number,
  firstY: number,
  visit: (x: number, y: number, dx: number, dy: number) => void,
): void {
  for (let ty = 0; ty < CHUNK_SIZE_TILES; ty++) {
    for (let tx = 0; tx < CHUNK_SIZE_TILES; tx++) {
      const x = firstX + tx;
      const y = firstY + ty;
      if (grid.isInside(x, y)) visit(x, y, tx * TILE_SIZE_PX, ty * TILE_SIZE_PX);
    }
  }
}

function drawFrame(context: CanvasRenderingContext2D, atlas: Atlas, name: string, dx: number, dy: number): void {
  const frame = atlas.frames.get(name);
  if (!frame) return;
  context.drawImage(atlas.image, frame.x, frame.y, frame.w, frame.h, dx, dy, TILE_SIZE_PX, TILE_SIZE_PX);
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

function copyCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext('2d')?.drawImage(source, 0, 0);
  return canvas;
}

export function nearestTexture(image: HTMLCanvasElement | HTMLImageElement): Texture {
  const texture = Texture.from(image);
  texture.source.scaleMode = 'nearest';
  return texture;
}
