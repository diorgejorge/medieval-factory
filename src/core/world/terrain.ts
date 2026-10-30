/** Tipos de terreno. Valores cabem em um byte para ficarem em Uint8Array. */
export const Terrain = {
  Grass: 0,
  Sand: 1,
  Water: 2,
  Forest: 3,
  Rock: 4,
  OreIron: 5,
} as const;

export type TerrainType = (typeof Terrain)[keyof typeof Terrain];

export const TERRAIN_TYPES: readonly TerrainType[] = Object.values(Terrain);
