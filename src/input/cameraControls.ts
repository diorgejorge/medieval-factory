import type { Camera } from '../render/camera';

/** Velocidade de pan pelo teclado, em pixels de tela por segundo. */
const KEYBOARD_PAN_SPEED = 800;

const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** Arrastar com o mouse e WASD/setas movem a câmera; a roda dá zoom no cursor. */
export class CameraControls {
  private readonly pressedKeys = new Set<string>();
  private dragPointerId: number | null = null;
  private lastPointer = { x: 0, y: 0 };
  /** Com o camponês do jogador, WASD/setas andam com ele e a câmera só segue (sem pan pelo teclado). */
  keyboardPan = true;

  constructor(
    private readonly camera: Camera,
    private readonly target: HTMLElement,
  ) {
    target.addEventListener('pointerdown', this.onPointerDown);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointercancel', this.onPointerUp);
    target.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Aplica o pan contínuo do teclado. Chamar uma vez por frame. */
  update(deltaSeconds: number): void {
    if (!this.keyboardPan) return;
    let dx = 0;
    let dy = 0;
    for (const code of this.pressedKeys) {
      const direction = PAN_KEYS[code];
      if (!direction) continue;
      dx += direction[0];
      dy += direction[1];
    }
    if (dx === 0 && dy === 0) return;
    const distance = KEYBOARD_PAN_SPEED * deltaSeconds;
    // panByScreen arrasta o mundo; para a câmera seguir a tecla, o sinal é invertido.
    this.camera.panByScreen(-dx * distance, -dy * distance);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.dragPointerId = event.pointerId;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.target.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.dragPointerId) return;
    this.camera.panByScreen(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y);
    this.lastPointer = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.dragPointerId) this.dragPointerId = null;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.target.getBoundingClientRect();
    const steps = event.deltaY < 0 ? 1 : -1;
    this.camera.stepZoomAt({ x: event.clientX - rect.left, y: event.clientY - rect.top }, steps);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code in PAN_KEYS) this.pressedKeys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.pressedKeys.clear();
  };
}
