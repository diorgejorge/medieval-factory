import { Terrain, type TerrainType } from '../core/world/terrain';

/** Cores provisórias até termos arte (placeholders do plano, seção 9). Par = [base, alternada]. */
export const TERRAIN_COLORS: Readonly<Record<TerrainType, readonly [number, number]>> = {
  [Terrain.Grass]: [0x5d8a3a, 0x56823a],
  [Terrain.Dirt]: [0x8b6b43, 0x83643e],
  [Terrain.Water]: [0x3a6ea5, 0x376a9f],
  [Terrain.Rock]: [0x7d7a72, 0x76736b],
};
