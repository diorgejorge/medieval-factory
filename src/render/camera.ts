export interface Point {
  x: number;
  y: number;
}

/** Intervalo inclusivo de índices (tiles ou chunks). */
export interface IndexRange {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Níveis de zoom permitidos. Pixel art só fica nítida em escalas inteiras (ou frações de 2 ao afastar);
 * escalas como 1.1× borram ou deformam pixels.
 */
export const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 3, 4, 6, 8] as const;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ?? 1;

/**
 * Câmera 2D sem dependência do Pixi, para ser testável.
 * (x, y) é o ponto do mundo que aparece no canto superior esquerdo da tela.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  screenToWorld(screen: Point): Point {
    return { x: screen.x / this.zoom + this.x, y: screen.y / this.zoom + this.y };
  }

  worldToScreen(world: Point): Point {
    return { x: (world.x - this.x) * this.zoom, y: (world.y - this.y) * this.zoom };
  }

  /** Desloca a câmera por um delta em pixels de tela (arrastar o mapa). */
  panByScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Aplica zoom mantendo fixo o ponto do mundo sob `anchor` (ex.: o cursor). */
  zoomAt(anchor: Point, factor: number): void {
    const before = this.screenToWorld(anchor);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.x = before.x - anchor.x / this.zoom;
    this.y = before.y - anchor.y / this.zoom;
  }

  /** Sobe ou desce `steps` níveis de ZOOM_LEVELS, mantendo fixo o ponto sob `anchor`. */
  stepZoomAt(anchor: Point, steps: number): void {
    const current = nearestZoomLevelIndex(this.zoom);
    const target = clamp(current + steps, 0, ZOOM_LEVELS.length - 1);
    const zoom = ZOOM_LEVELS[target] ?? this.zoom;
    this.zoomAt(anchor, zoom / this.zoom);
  }

  /** Centraliza a câmera em um ponto do mundo. */
  centerOn(world: Point, viewWidth: number, viewHeight: number): void {
    this.x = world.x - viewWidth / 2 / this.zoom;
    this.y = world.y - viewHeight / 2 / this.zoom;
  }

  /**
   * Células (de lado `cellSize` em unidades de mundo) visíveis na tela,
   * limitadas a [0, cellCount). Retorna null se nada estiver visível.
   */
  visibleCells(
    viewWidth: number,
    viewHeight: number,
    cellSize: number,
    cellCount: number,
  ): IndexRange | null {
    const bottomRight = this.screenToWorld({ x: viewWidth, y: viewHeight });
    const minX = Math.max(0, Math.floor(this.x / cellSize));
    const minY = Math.max(0, Math.floor(this.y / cellSize));
    const maxX = Math.min(cellCount - 1, Math.floor(bottomRight.x / cellSize));
    const maxY = Math.min(cellCount - 1, Math.floor(bottomRight.y / cellSize));
    if (minX > maxX || minY > maxY) return null;
    return { minX, minY, maxX, maxY };
  }
}

function nearestZoomLevelIndex(zoom: number): number {
  let best = 0;
  ZOOM_LEVELS.forEach((level, index) => {
    if (Math.abs(level - zoom) < Math.abs((ZOOM_LEVELS[best] ?? level) - zoom)) best = index;
  });
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
