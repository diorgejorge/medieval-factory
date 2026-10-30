import type { GameSpeed } from '../core/config';
import type { SimulationClient } from '../bridge/simulationClient';

const SPEED_KEYS: Readonly<Record<string, GameSpeed>> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 4,
};

/** Espaço pausa/continua; 1, 2 e 3 escolhem a velocidade (1x, 2x, 4x). */
export function bindSimulationControls(client: SimulationClient): void {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'Space') {
      event.preventDefault();
      client.send({ type: 'setPaused', paused: !(client.snapshot?.paused ?? false) });
      return;
    }
    const speed = SPEED_KEYS[event.code];
    if (speed !== undefined) client.send({ type: 'setSpeed', speed });
  });
}
