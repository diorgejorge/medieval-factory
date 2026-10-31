import { AnimatedSprite, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { TILE_SIZE_PX } from '../core/config';
import type { ServantView } from '../core/economy/servants';
import type { Atlas, AtlasFrame } from './atlas';
import { createGlide, glidePosition, retarget, type Glide } from './glide';
import { nearestTexture } from './gridRenderer';

/** Cores do bonequinho provisório, usado só quando o atlas não carrega. */
const TUNIC = 0x6b4a2b;
const SKIN = 0xe8c49a;
const LOAD = 0xc89b4a;
const INK = 0x22182a;

/** Direções no sentido horário a partir do leste, de 45° em 45° (igual ao atan2 com y para baixo). */
const DIRECTIONS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;
type Direction = (typeof DIRECTIONS)[number];
const WALK_FPS = 4;
/** A carga vai nas costas, como o ícone do item pela metade, na altura dos ombros. */
const LOAD_SCALE = 0.5;
const LOAD_ABOVE_FEET_PX = 12;

interface Figure {
  view: Container;
  body: AnimatedSprite | Graphics;
  load: Sprite | null;
  direction: Direction;
  walking: boolean | null;
  carrying: string | null | undefined;
  glide: Glide;
}

/**
 * Servos deslizando entre as posições do snapshot. Com o atlas, usam o camponês (`peasant_<dir>`,
 * arte do usuário) virado para onde andam; sem ele, um bonequinho de pixels.
 */
export class ServantLayer {
  readonly view = new Container();
  private readonly figures: Figure[] = [];
  private readonly textures = new Map<string, Texture[]>();
  private readonly source: Texture['source'] | null;

  constructor(private readonly atlas: Atlas | null = null) {
    this.source = atlas ? nearestTexture(atlas.image).source : null;
    this.view.sortableChildren = true;
  }

  update(servants: readonly ServantView[]): void {
    const now = performance.now();
    while (this.figures.length < servants.length) this.figures.push(this.createFigure());
    this.figures.forEach((figure, index) => {
      const servant = servants[index];
      figure.view.visible = servant !== undefined;
      if (!servant) return;
      retarget(figure.glide, servant.x, servant.y, now);
      const [x, y] = glidePosition(figure.glide, now, TILE_SIZE_PX);
      this.pose(figure, servant.carrying, isWalking(figure.glide, now));
      figure.view.position.set(x, y);
      figure.view.zIndex = y;
    });
  }

  private createFigure(): Figure {
    const view = new Container();
    view.sortableChildren = true;
    this.view.addChild(view);
    const glide = createGlide();
    if (!this.atlas) {
      const body = new Graphics();
      view.addChild(body);
      return { view, body, load: null, direction: 's', walking: null, carrying: undefined, glide };
    }
    const body = new AnimatedSprite(this.frames('peasant_s'));
    body.anchor.set(0.5, 1);
    body.scale.set(1 / (this.atlas.frames.get('peasant_s')?.density ?? 1));
    body.animationSpeed = WALK_FPS / 60;
    const load = new Sprite();
    load.anchor.set(0.5, 1);
    load.scale.set(LOAD_SCALE);
    load.y = -LOAD_ABOVE_FEET_PX;
    view.addChild(body, load);
    return { view, body, load, direction: 's', walking: null, carrying: undefined, glide };
  }

  /** Só troca texturas quando muda a direção, o passo ou a carga. */
  private pose(figure: Figure, carrying: string | null, walking: boolean): void {
    const { body, load } = figure;
    if (body instanceof Graphics) {
      if (figure.carrying !== carrying) drawServant(body, carrying !== null);
      figure.carrying = carrying;
      return;
    }
    const direction = walking ? heading(figure.glide) ?? figure.direction : figure.direction;
    if (direction !== figure.direction || walking !== figure.walking) {
      body.textures = this.frames(walking ? `peasant_${direction}_walk` : `peasant_${direction}`);
      if (walking) body.play();
      figure.direction = direction;
      figure.walking = walking;
    }
    if (load && figure.carrying !== carrying) {
      const icon = carrying ? this.frames(`item_${carrying}`)[0] : undefined;
      load.texture = icon ?? Texture.EMPTY;
      load.visible = icon !== undefined;
      figure.carrying = carrying;
    }
    // A carga vai nas costas: atrás do corpo de frente, na frente dele de costas.
    if (load) load.zIndex = direction.startsWith('n') ? 1 : -1;
  }

  private frames(name: string): Texture[] {
    const cached = this.textures.get(name);
    if (cached) return cached;
    const still = this.atlas?.frames.get(name);
    const source = this.atlas?.animations.get(name) ?? (still ? [still] : []);
    const textures = source.length > 0 ? source.map((frame) => this.texture(frame)) : [Texture.EMPTY];
    this.textures.set(name, textures);
    return textures;
  }

  private texture(frame: AtlasFrame): Texture {
    if (!this.source) return Texture.EMPTY;
    return new Texture({ source: this.source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) });
  }
}

/** Andando enquanto ainda desliza para a posição nova do snapshot. */
function isWalking(glide: Glide, now: number): boolean {
  return now - glide.movedAt < glide.interval && (glide.fromX !== glide.toX || glide.fromY !== glide.toY);
}

function heading(glide: Glide): Direction | null {
  const dx = glide.toX - glide.fromX;
  const dy = glide.toY - glide.fromY;
  if (dx === 0 && dy === 0) return null;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return DIRECTIONS[(octant + DIRECTIONS.length) % DIRECTIONS.length] ?? null;
}

/** Bonequinho de 5×9 px com o pé na posição do servo. */
function drawServant(figure: Graphics, carrying: boolean): void {
  figure.clear();
  figure.rect(-2, -9, 5, 9).fill(INK);
  figure.rect(-1, -8, 3, 3).fill(SKIN);
  figure.rect(-1, -5, 3, 4).fill(TUNIC);
  if (carrying) figure.rect(-4, -8, 3, 4).fill(LOAD).stroke({ width: 1, color: INK, alignment: 1 });
}
