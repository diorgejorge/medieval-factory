import { Terrain } from './world/terrain';
import type { Grid } from './world/grid';

/** Velocidade do camponês do jogador, em tiles por segundo. */
export const PLAYER_SPEED = 4;
/** Meia largura dos pés, em tiles: o corpo não entra em tile bloqueado nem de raspão. */
const FOOT_RADIUS = 0.3;
/** Maior passo de uma vez, em tiles. */
const MAX_STEP = 0.25;

/**
 * O camponês que o jogador anda (WASD/setas): o começo da progressão do manual ao automático.
 * Posição em tiles (o ponto é o meio dos pés). Água, construções e fora do mapa bloqueiam;
 * encostado num bloqueio, ele desliza pelo eixo que está livre.
 */
export class Player {
  constructor(
    public x: number,
    public y: number,
    private readonly grid: Grid,
    private readonly occupied: (x: number, y: number) => boolean,
  ) {}

  /** Anda na direção (dx, dy) por `seconds`; a diagonal tem a mesma velocidade das retas. */
  move(dx: number, dy: number, seconds: number): void {
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    // Em passos curtos, para um quadro lento não atravessar um rio de um tile.
    const distance = PLAYER_SPEED * seconds;
    const steps = Math.ceil(distance / MAX_STEP);
    const step = distance / steps / length;
    for (let i = 0; i < steps; i++) {
      const nextX = this.x + dx * step;
      if (this.free(nextX, this.y)) this.x = nextX;
      const nextY = this.y + dy * step;
      if (this.free(this.x, nextY)) this.y = nextY;
    }
  }

  /** Os quatro cantos dos pés caem em tiles livres. */
  private free(x: number, y: number): boolean {
    for (const cx of [x - FOOT_RADIUS, x + FOOT_RADIUS]) {
      for (const cy of [y - FOOT_RADIUS, y + FOOT_RADIUS]) {
        if (this.blocked(Math.floor(cx), Math.floor(cy))) return false;
      }
    }
    return true;
  }

  private blocked(x: number, y: number): boolean {
    return !this.grid.isInside(x, y) || this.grid.getTerrain(x, y) === Terrain.Water || this.occupied(x, y);
  }
}
