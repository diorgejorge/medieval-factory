import { AnimatedSprite, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { TILE_SIZE_PX } from '../core/config';
import { compareDrawOrder, type MapObject } from '../core/world/mapObjects';
import type { Atlas, AtlasFrame } from './atlas';
import type { Camera } from './camera';
import { nearestTexture } from './gridRenderer';
import { connectRoads, connectTransport } from './transportTiles';

/** Cor `ink` da paleta; a sombra é o único caso de semitransparência (docs/ESTILO.md). */
const SHADOW_COLOR = 0x22182a;
const SHADOW_ALPHA = 0.35;
/** Sombra colada à base: de ~4 px acima até 1 px abaixo, deslocada 1 px para a direita. */
const SHADOW_ABOVE_PX = 4;
const SHADOW_BELOW_PX = 1;
const SHADOW_OFFSET_X_PX = 1;
const ANIMATION_FPS = 6;
/** Folga do culling: copas e telhados passam da célula da base. */
const CULL_MARGIN_PX = 4 * TILE_SIZE_PX;
/** O culling liga/desliga blocos de objetos de uma vez; só refaz quando a câmera muda de bloco. */
const CHUNK_PX = 16 * TILE_SIZE_PX;
const CHUNK_KEY_STRIDE = 1 << 16;

interface ChunkRange {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface PlacedSprite {
  group: string;
  sprite: Sprite;
  shadow: Sprite | null;
  x: number;
  y: number;
}

/**
 * Árvores e construções em vista 3/4: o sprite cresce para cima a partir da base e a ordem
 * de desenho segue o y da base. Sombras ficam numa camada própria, por baixo de todos os objetos.
 */
export class ObjectLayer {
  readonly view = new Container();
  private readonly shadows = new Container();
  private readonly sprites = new Container();
  private readonly placed: PlacedSprite[] = [];
  private readonly source: Texture['source'];
  private readonly shadowTextures = new Map<number, Texture>();
  private readonly bounds = new Map<string, OpaqueBounds>();
  private readonly chunks = new Map<number, PlacedSprite[]>();
  private visibleRange: ChunkRange | null = null;

  constructor(private readonly atlas: Atlas) {
    this.source = nearestTexture(atlas.image).source;
    this.view.addChild(this.shadows, this.sprites);
  }

  /**
   * Adiciona objetos mantendo a ordem por y da base. Frames que faltam no atlas são ignorados.
   * O grupo permite trocar um conjunto inteiro depois (ex.: as construções do jogador).
   */
  add(objects: readonly MapObject[], group = 'map'): void {
    const hasFrame = (name: string) => this.hasFrame(name);
    for (const object of connectRoads(connectTransport(objects, hasFrame), hasFrame)) {
      const placed = this.createSprite(object, group);
      if (placed) this.placed.push(placed);
    }
    this.placed.sort(compareDrawOrder);
    this.sprites.removeChildren();
    this.shadows.removeChildren();
    for (const { sprite, shadow } of this.placed) {
      this.sprites.addChild(sprite);
      if (shadow) this.shadows.addChild(shadow);
    }
    this.indexChunks();
  }

  /** Troca todos os objetos de um grupo pelos novos. */
  replaceGroup(group: string, objects: readonly MapObject[]): void {
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const placed = this.placed[i];
      if (placed?.group !== group) continue;
      placed.sprite.destroy();
      placed.shadow?.destroy();
      this.placed.splice(i, 1);
    }
    this.add(objects, group);
  }

  /** Sprite avulso posicionado como o objeto, sem sombra nem ordenação (para a prévia fantasma). */
  spriteFor(object: MapObject): Sprite | null {
    const placed = this.createSprite(object, '');
    placed?.shadow?.destroy();
    return placed?.sprite ?? null;
  }

  cull(camera: Camera, viewWidth: number, viewHeight: number): void {
    const bottomRight = camera.screenToWorld({ x: viewWidth, y: viewHeight });
    const range: ChunkRange = {
      minX: chunkOf(camera.x - CULL_MARGIN_PX),
      minY: chunkOf(camera.y - CULL_MARGIN_PX),
      maxX: chunkOf(bottomRight.x + CULL_MARGIN_PX),
      maxY: chunkOf(bottomRight.y + CULL_MARGIN_PX * 2),
    };
    const previous = this.visibleRange;
    if (previous && sameRange(previous, range)) return;
    if (previous) this.setRangeVisible(previous, false, range);
    this.setRangeVisible(range, true, null);
    this.visibleRange = range;
  }

  /** Reagrupa os objetos por bloco e esconde todos; o próximo `cull` mostra só os da tela. */
  private indexChunks(): void {
    this.chunks.clear();
    for (const placed of this.placed) {
      setVisible(placed, false);
      const key = chunkKey(chunkOf(placed.x), chunkOf(placed.y));
      const chunk = this.chunks.get(key);
      if (chunk) chunk.push(placed);
      else this.chunks.set(key, [placed]);
    }
    this.visibleRange = null;
  }

  /** Muda a visibilidade dos blocos de `range`, pulando os que continuam dentro de `keep`. */
  private setRangeVisible(range: ChunkRange, visible: boolean, keep: ChunkRange | null): void {
    for (let cy = range.minY; cy <= range.maxY; cy++) {
      for (let cx = range.minX; cx <= range.maxX; cx++) {
        if (keep && cx >= keep.minX && cx <= keep.maxX && cy >= keep.minY && cy <= keep.maxY) continue;
        for (const placed of this.chunks.get(chunkKey(cx, cy)) ?? []) setVisible(placed, visible);
      }
    }
  }

  private createSprite(object: MapObject, group: string): PlacedSprite | null {
    const name = this.resolveFrame(object.frame);
    const frames = this.atlas.animations.get(name) ?? [];
    const still = this.atlas.frames.get(name);
    const first = frames[0] ?? still;
    if (!first) return null;

    const textures = (frames.length > 0 ? frames : [first]).map((f) => this.texture(f));
    let sprite: Sprite;
    if (textures.length > 1) {
      const animated = new AnimatedSprite(textures);
      animated.animationSpeed = ANIMATION_FPS / 60;
      // Máquina parada fica no primeiro quadro; objetos sem o dado (árvores, rodas) sempre animam.
      if (object.working !== false) animated.play();
      sprite = animated;
    } else {
      sprite = new Sprite(textures[0]);
    }

    // A base é a última linha opaca do sprite: assim nada "flutua" se o PNG tiver margem embaixo.
    // Arte em alta definição tem mais pixels que o chão e é reduzida pela densidade.
    const density = first.density ?? 1;
    const bounds = scaleBounds(this.opaqueBounds(name, first), density);
    const x = Math.round(object.x * TILE_SIZE_PX);
    const y = Math.round(object.y * TILE_SIZE_PX);
    sprite.scale.set(1 / density);
    sprite.position.set(x - Math.floor(first.w / density / 2), y - bounds.bottom - 1);

    // Sombra colada à base, na largura da silhueta. Construções não têm: a arte já assenta no chão.
    if (object.noShadow) return { group, sprite, shadow: null, x, y };
    const shadow = new Sprite(this.shadowTexture(bounds.right - bounds.left + 1));
    shadow.tint = SHADOW_COLOR;
    shadow.alpha = SHADOW_ALPHA;
    shadow.position.set(sprite.x + bounds.left + SHADOW_OFFSET_X_PX, y - SHADOW_ABOVE_PX);
    return { group, sprite, shadow, x, y };
  }

  private hasFrame(name: string): boolean {
    return this.atlas.animations.has(name) || this.atlas.frames.has(name);
  }

  /** Sem a arte de uma direção (`<frame>_r<n>`), usa a arte padrão do objeto. */
  private resolveFrame(name: string): string {
    if (this.hasFrame(name)) return name;
    return name.replace(/_r\d+$/, '');
  }

  private texture(frame: AtlasFrame): Texture {
    return new Texture({ source: this.source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) });
  }

  /** Elipse achatada em pixels chapados (sem anti-aliasing), branca para ser tingida. */
  private shadowTexture(width: number): Texture {
    const cached = this.shadowTextures.get(width);
    if (cached) return cached;
    const height = SHADOW_ABOVE_PX + SHADOW_BELOW_PX;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#fff';
      for (const row of ellipseRows(width, height)) context.fillRect(row.left, row.y, row.width, 1);
    }
    const texture = nearestTexture(canvas);
    this.shadowTextures.set(width, texture);
    return texture;
  }

  private opaqueBounds(name: string, frame: AtlasFrame): OpaqueBounds {
    const cached = this.bounds.get(name);
    if (cached) return cached;
    const bounds = measureOpaqueBounds(this.atlas.image, frame);
    this.bounds.set(name, bounds);
    return bounds;
  }
}

function scaleBounds(bounds: OpaqueBounds, density: number): OpaqueBounds {
  if (density === 1) return bounds;
  return {
    left: Math.floor(bounds.left / density),
    right: Math.floor(bounds.right / density),
    bottom: Math.floor(bounds.bottom / density),
  };
}

function chunkOf(px: number): number {
  return Math.max(0, Math.floor(px / CHUNK_PX));
}

function chunkKey(cx: number, cy: number): number {
  return cy * CHUNK_KEY_STRIDE + cx;
}

function sameRange(a: ChunkRange, b: ChunkRange): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}

function setVisible({ sprite, shadow }: PlacedSprite, visible: boolean): void {
  sprite.visible = visible;
  if (shadow) shadow.visible = visible;
}

interface OpaqueBounds {
  left: number;
  right: number;
  bottom: number;
}

function measureOpaqueBounds(image: HTMLImageElement, frame: AtlasFrame): OpaqueBounds {
  const full = { left: 0, right: frame.w - 1, bottom: frame.h - 1 };
  const canvas = document.createElement('canvas');
  canvas.width = frame.w;
  canvas.height = frame.h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return full;
  context.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  const pixels = context.getImageData(0, 0, frame.w, frame.h).data;
  let left = frame.w;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) {
      if ((pixels[(y * frame.w + x) * 4 + 3] ?? 0) === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? full : { left, right, bottom };
}

/** Linhas horizontais que formam uma elipse de `width`×`height` pixels inteiros. */
export function ellipseRows(width: number, height: number): { y: number; left: number; width: number }[] {
  const rows = [];
  const rx = width / 2;
  const ry = height / 2;
  for (let y = 0; y < height; y++) {
    const dy = (y + 0.5 - ry) / ry;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
    const rowWidth = Math.max(1, half * 2);
    rows.push({ y, left: Math.round(rx - rowWidth / 2), width: rowWidth });
  }
  return rows;
}
