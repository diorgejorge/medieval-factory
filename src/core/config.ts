/** Lado do mapa em tiles. O critério do M0 é um mapa 256×256 a 60 FPS. */
export const MAP_SIZE_TILES = 256;

/** Tamanho de um tile em unidades de mundo (pixels com zoom 1). */
export const TILE_SIZE_PX = 32;

/** Lado de um chunk em tiles: unidade de culling e de cache de render. */
export const CHUNK_SIZE_TILES = 32;

/** Ticks de simulação por segundo (UPS). Fixo para a simulação ser determinística. */
export const TICKS_PER_SECOND = 30;

export const TICK_MS = 1000 / TICKS_PER_SECOND;

/**
 * Teto de ticks por avanço do relógio. Se a aba ficar em segundo plano ou travar, descartamos
 * o atraso em vez de simular tudo de uma vez e travar ainda mais ("espiral da morte").
 */
export const MAX_TICKS_PER_ADVANCE = 8;

/** Velocidades de jogo permitidas (multiplicadores do tempo real). */
export const GAME_SPEEDS = [1, 2, 4] as const;

export type GameSpeed = (typeof GAME_SPEEDS)[number];
