import { Container, Graphics } from 'pixi.js';
import { TILE_SIZE_PX } from '../core/config';
import type { ServantView } from '../core/economy/servants';
import { createGlide, glidePosition, retarget, type Glide } from './glide';

/** Cores provisórias até a Visual desenhar os servos: túnica, pele e a carga nas costas. */
const TUNIC = 0x6b4a2b;
const SKIN = 0xe8c49a;
const LOAD = 0xc89b4a;
const INK = 0x22182a;

interface Figure {
  graphics: Graphics;
  carrying: boolean | null;
  glide: Glide;
}

/** Servos como bonequinhos de pixels que deslizam entre as posições do snapshot. */
export class ServantLayer {
  readonly view = new Container();
  private readonly figures: Figure[] = [];

  update(servants: readonly ServantView[]): void {
    const now = performance.now();
    while (this.figures.length < servants.length) this.figures.push(this.createFigure());
    this.figures.forEach((figure, index) => {
      const servant = servants[index];
      figure.graphics.visible = servant !== undefined;
      if (!servant) return;
      const carrying = servant.carrying !== null;
      if (figure.carrying !== carrying) {
        drawServant(figure.graphics, carrying);
        figure.carrying = carrying;
      }
      retarget(figure.glide, servant.x, servant.y, now);
      figure.graphics.position.set(...glidePosition(figure.glide, now, TILE_SIZE_PX));
    });
  }

  private createFigure(): Figure {
    const graphics = new Graphics();
    this.view.addChild(graphics);
    return { graphics, carrying: null, glide: createGlide() };
  }
}

/** Bonequinho de 5×9 px com o pé na posição do servo. */
function drawServant(figure: Graphics, carrying: boolean): void {
  figure.clear();
  figure.rect(-2, -9, 5, 9).fill(INK);
  figure.rect(-1, -8, 3, 3).fill(SKIN);
  figure.rect(-1, -5, 3, 4).fill(TUNIC);
  if (carrying) figure.rect(-4, -8, 3, 4).fill(LOAD).stroke({ width: 1, color: INK, alignment: 1 });
}
