import type { Point } from '../render/camera';

/** Quanto o ponteiro pode andar entre apertar e soltar e ainda contar como clique (não arrasto). */
const CLICK_TOLERANCE_PX = 4;

/** Chama `onClick` com a posição na tela quando o ponteiro aperta e solta quase no mesmo lugar. */
export function bindClicks(target: HTMLElement, onClick: (screen: Point) => void): void {
  let down: Point | null = null;
  target.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointerup', (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > CLICK_TOLERANCE_PX) return;
    const rect = target.getBoundingClientRect();
    onClick({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  });
}
