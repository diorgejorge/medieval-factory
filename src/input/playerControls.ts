import type { Player } from '../core/player';

const MOVE_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** WASD/setas andam com o camponês do jogador (8 direções). */
export class PlayerControls {
  private readonly pressed = new Set<string>();

  constructor(private readonly player: Player) {
    window.addEventListener('keydown', (event) => {
      if (MOVE_KEYS[event.code]) this.pressed.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.pressed.delete(event.code));
    window.addEventListener('blur', () => this.pressed.clear());
  }

  /** Chamar uma vez por quadro. Devolve true se o camponês tentou andar. */
  update(seconds: number): boolean {
    let dx = 0;
    let dy = 0;
    for (const code of this.pressed) {
      const direction = MOVE_KEYS[code];
      if (!direction) continue;
      dx += direction[0];
      dy += direction[1];
    }
    if (dx === 0 && dy === 0) return false;
    this.player.move(dx, dy, seconds);
    return true;
  }
}
