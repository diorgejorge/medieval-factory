/** Tipos de terreno. Valores cabem em um byte para ficarem em Uint8Array. */
export const Terrain = {
  Grass: 0,
  Dirt: 1,
  Water: 2,
  Rock: 3,
} as const;

export type TerrainType = (typeof Terrain)[keyof typeof Terrain];
