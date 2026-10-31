import { Container, Graphics } from 'pixi.js';
import { TILE_SIZE_PX } from '../core/config';
import type { ServantView } from '../core/economy/servants';

/** Cores provisórias até a Visual desenhar os servos: túnica, pele e a carga nas costas. */
const TUNIC = 0x6b4a2b;
const SKIN = 0xe8c49a;
const LOAD = 0xc89b4a;
const INK = 0x22182a;

/** Servos como bonequinhos de pixels, posicionados pelo snapshot da simulação. */
export class ServantLayer {
  readonly view = new Container();
  private readonly figures: Graphics[] = [];

  update(servants: readonly ServantView[]): void {
    while (this.figures.length < servants.length) {
      const figure = new Graphics();
      this.figures.push(figure);
      this.view.addChild(figure);
    }
    this.figures.forEach((figure, index) => {
      const servant = servants[index];
      figure.visible = servant !== undefined;
      if (!servant) return;
      drawServant(figure, servant.carrying !== null);
      figure.position.set(Math.round(servant.x * TILE_SIZE_PX), Math.round(servant.y * TILE_SIZE_PX));
    });
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
