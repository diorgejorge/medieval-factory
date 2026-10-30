import { Terrain, type TerrainType } from '../core/world/terrain';

/** Formato do spritesheet exportado pela equipe Visual (assets/terrain/terrain.json). */
interface AtlasJson {
  frames: Record<string, { frame: AtlasFrame }>;
  animations?: Record<string, string[]>;
}

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TerrainAtlas {
  image: HTMLImageElement;
  frames: ReadonlyMap<string, AtlasFrame>;
  waterAnimation: readonly AtlasFrame[];
}

/** Prefixo dos frames de cada terreno no atlas; as variantes são `<prefixo>_0` … `_3`. */
export const TERRAIN_FRAME_PREFIX: Readonly<Record<TerrainType, string>> = {
  [Terrain.Grass]: 'grass',
  [Terrain.Sand]: 'sand',
  [Terrain.Water]: 'water',
  [Terrain.Forest]: 'forest',
  [Terrain.Rock]: 'rock',
  [Terrain.OreIron]: 'ore_iron',
};

export const ATLAS_VARIANTS = 4;

const ATLAS_JSON_URL = new URL('../../assets/terrain/terrain.json', import.meta.url).href;
const ATLAS_IMAGE_URL = new URL('../../assets/terrain/terrain.png', import.meta.url).href;

/** Carrega o atlas; devolve null se ele ainda não existir, e o jogo cai no terreno procedural. */
export async function loadTerrainAtlas(): Promise<TerrainAtlas | null> {
  try {
    const response = await fetch(ATLAS_JSON_URL);
    if (!response.ok) return null;
    const json = (await response.json()) as AtlasJson;
    const image = new Image();
    image.src = ATLAS_IMAGE_URL;
    await image.decode();

    const frames = new Map(Object.entries(json.frames).map(([name, entry]) => [name, entry.frame]));
    const waterAnimation = (json.animations?.['water'] ?? [])
      .map((name) => frames.get(name))
      .filter((frame): frame is AtlasFrame => frame !== undefined);
    return { image, frames, waterAnimation };
  } catch {
    return null;
  }
}
