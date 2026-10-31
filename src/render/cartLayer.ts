import { AnimatedSprite, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { TILE_SIZE_PX } from '../core/config';
import type { Atlas, AtlasFrame } from './atlas';
import { createGlide, glidePosition, retarget, type Glide } from './glide';
import { nearestTexture } from './gridRenderer';

export type CartDirection = 'e' | 's' | 'w' | 'n';

/** Carroça no snapshot (frente 17): x/y em tiles fracionários no centro da carroça. */
export interface CartView {
  id: number | string;
  x: number;
  y: number;
  dir: CartDirection;
  moving: boolean;
  item: string | null;
}

const WALK_FPS = 4;
/** A carga aparece como o ícone do item, pela metade, em cima da caçamba. */
const LOAD_SCALE = 0.5;
const LOAD_LIFT_PX = 4;

interface CartFigure {
  view: Container;
  body: AnimatedSprite;
  load: Sprite;
  dir: CartDirection | null;
  item: string | null;
  glide: Glide;
}

/** Carroças puxadas por burro: `cart_<dir>` do atlas de objetos, andando só quando `moving`. */
export class CartLayer {
  readonly view = new Container();
  private readonly figures = new Map<CartView['id'], CartFigure>();
  private readonly source: Texture['source'];
  private readonly textures = new Map<string, Texture[]>();

  constructor(private readonly atlas: Atlas) {
    this.source = nearestTexture(atlas.image).source;
    this.view.sortableChildren = true;
  }

  update(carts: readonly CartView[]): void {
    const now = performance.now();
    const seen = new Set<CartView['id']>();
    for (const cart of carts) {
      seen.add(cart.id);
      const figure = this.figures.get(cart.id) ?? this.createFigure(cart.id);
      this.redraw(figure, cart);
      retarget(figure.glide, cart.x, cart.y, now);
      figure.view.position.set(...glidePosition(figure.glide, now, TILE_SIZE_PX));
      figure.view.zIndex = figure.view.y;
    }
    for (const [id, figure] of this.figures) {
      if (seen.has(id)) continue;
      figure.view.destroy({ children: true });
      this.figures.delete(id);
    }
  }

  private createFigure(id: CartView['id']): CartFigure {
    const body = new AnimatedSprite([Texture.EMPTY]);
    body.anchor.set(0.5);
    body.animationSpeed = WALK_FPS / 60;
    const load = new Sprite();
    load.anchor.set(0.5, 1);
    load.scale.set(LOAD_SCALE);
    const view = new Container();
    view.addChild(body, load);
    this.view.addChild(view);
    const figure: CartFigure = { view, body, load, dir: null, item: null, glide: createGlide() };
    this.figures.set(id, figure);
    return figure;
  }

  /** Troca texturas só quando a direção ou a carga mudam. */
  private redraw(figure: CartFigure, cart: CartView): void {
    if (figure.dir !== cart.dir) {
      figure.body.textures = this.frames(`cart_${cart.dir}`);
      figure.body.anchor.set(0.5);
      figure.dir = cart.dir;
    }
    if (cart.moving !== figure.body.playing) {
      if (cart.moving) figure.body.play();
      else figure.body.gotoAndStop(0);
    }
    if (figure.item !== cart.item) {
      const icon = cart.item ? this.frames(`item_${cart.item}`)[0] : undefined;
      figure.load.texture = icon ?? Texture.EMPTY;
      figure.load.visible = icon !== undefined;
      figure.item = cart.item;
    }
    figure.load.y = -figure.body.height / 2 + LOAD_LIFT_PX;
  }

  private frames(name: string): Texture[] {
    const cached = this.textures.get(name);
    if (cached) return cached;
    const still = this.atlas.frames.get(name);
    const source = this.atlas.animations.get(name) ?? (still ? [still] : []);
    const textures = source.length > 0 ? source.map((frame) => this.texture(frame)) : [Texture.EMPTY];
    this.textures.set(name, textures);
    return textures;
  }

  private texture(frame: AtlasFrame): Texture {
    return new Texture({ source: this.source, frame: new Rectangle(frame.x, frame.y, frame.w, frame.h) });
  }
}
