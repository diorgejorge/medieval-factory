/** Saltos maiores que isso (peça nova, troca de índice) vão direto, sem deslizar. */
const TELEPORT_TILES = 2;
/** Intervalo inicial entre snapshots, até medir o real. */
const DEFAULT_SNAPSHOT_MS = 100;
/** Depois de uma pausa longa, o próximo passo não pode virar um deslize lento. */
const MAX_SNAPSHOT_MS = 500;

/**
 * Deslize entre posições do snapshot (em tiles). O snapshot chega mais devagar que os quadros,
 * então a figura vai da posição anterior até a nova no tempo medido entre snapshots.
 */
export interface Glide {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  movedAt: number;
  interval: number;
}

export function createGlide(): Glide {
  return { fromX: NaN, fromY: NaN, toX: NaN, toY: NaN, movedAt: 0, interval: DEFAULT_SNAPSHOT_MS };
}

/** Quando a posição do snapshot muda, recomeça o deslize a partir de onde a figura está desenhada. */
export function retarget(glide: Glide, x: number, y: number, now: number): void {
  if (x === glide.toX && y === glide.toY) return;
  const jump = Math.hypot(x - glide.toX, y - glide.toY);
  if (!(jump <= TELEPORT_TILES)) {
    Object.assign(glide, { fromX: x, fromY: y, toX: x, toY: y, movedAt: now });
    return;
  }
  const t = progress(glide, now);
  glide.fromX += (glide.toX - glide.fromX) * t;
  glide.fromY += (glide.toY - glide.fromY) * t;
  glide.interval = Math.min(MAX_SNAPSHOT_MS, Math.max(1, now - glide.movedAt));
  glide.toX = x;
  glide.toY = y;
  glide.movedAt = now;
}

/** Posição desenhada agora, em pixels inteiros. */
export function glidePosition(glide: Glide, now: number, tilePx: number): [number, number] {
  const t = progress(glide, now);
  return [
    Math.round((glide.fromX + (glide.toX - glide.fromX) * t) * tilePx),
    Math.round((glide.fromY + (glide.toY - glide.fromY) * t) * tilePx),
  ];
}

function progress(glide: Glide, now: number): number {
  return Math.min(1, (now - glide.movedAt) / glide.interval);
}
