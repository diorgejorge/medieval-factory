import { Container, Graphics } from 'pixi.js';
import { TILE_SIZE_PX } from '../core/config';
import type { ServantView } from '../core/economy/servants';

/** Cores provisórias até a Visual desenhar os servos: túnica, pele e a carga nas costas. */
const TUNIC = 0x6b4a2b;
const SKIN = 0xe8c49a;
const LOAD = 0xc89b4a;
const INK = 0x22182a;
/** Saltos maiores que isso (servo novo, troca de índice) vão direto, sem deslizar. */
const TELEPORT_TILES = 2;
/** Intervalo inicial entre snapshots, até medir o real. */
const DEFAULT_SNAPSHOT_MS = 100;
/** Depois de uma pausa longa, o próximo passo não pode virar um deslize lento. */
const MAX_SNAPSHOT_MS = 500;

interface Figure {
  graphics: Graphics;
  carrying: boolean | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  movedAt: number;
  interval: number;
}

/**
 * Servos como bonequinhos de pixels. O snapshot chega mais devagar que os quadros, então cada
 * servo desliza da posição anterior até a nova no tempo medido entre snapshots.
 */
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
      retarget(figure, servant.x, servant.y, now);
      const t = Math.min(1, (now - figure.movedAt) / figure.interval);
      figure.graphics.position.set(
        Math.round((figure.fromX + (figure.toX - figure.fromX) * t) * TILE_SIZE_PX),
        Math.round((figure.fromY + (figure.toY - figure.fromY) * t) * TILE_SIZE_PX),
      );
    });
  }

  private createFigure(): Figure {
    const graphics = new Graphics();
    this.view.addChild(graphics);
    return { graphics, carrying: null, fromX: NaN, fromY: NaN, toX: NaN, toY: NaN, movedAt: 0, interval: DEFAULT_SNAPSHOT_MS };
  }
}

/** Quando a posição do snapshot muda, recomeça o deslize a partir de onde o servo está desenhado. */
function retarget(figure: Figure, x: number, y: number, now: number): void {
  if (x === figure.toX && y === figure.toY) return;
  const jump = Math.hypot(x - figure.toX, y - figure.toY);
  if (!(jump <= TELEPORT_TILES)) {
    Object.assign(figure, { fromX: x, fromY: y, toX: x, toY: y, movedAt: now });
    return;
  }
  const t = Math.min(1, (now - figure.movedAt) / figure.interval);
  figure.fromX += (figure.toX - figure.fromX) * t;
  figure.fromY += (figure.toY - figure.fromY) * t;
  figure.interval = Math.min(MAX_SNAPSHOT_MS, Math.max(1, now - figure.movedAt));
  figure.toX = x;
  figure.toY = y;
  figure.movedAt = now;
}

/** Bonequinho de 5×9 px com o pé na posição do servo. */
function drawServant(figure: Graphics, carrying: boolean): void {
  figure.clear();
  figure.rect(-2, -9, 5, 9).fill(INK);
  figure.rect(-1, -8, 3, 3).fill(SKIN);
  figure.rect(-1, -5, 3, 4).fill(TUNIC);
  if (carrying) figure.rect(-4, -8, 3, 4).fill(LOAD).stroke({ width: 1, color: INK, alignment: 1 });
}
