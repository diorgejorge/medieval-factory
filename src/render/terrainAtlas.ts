import { Terrain, type TerrainType } from '../core/world/terrain';
import { loadAtlas, type Atlas } from './atlas';

/** Prefixo dos frames de cada terreno no atlas; as variantes são `<prefixo>_0` … `_3`. */
export const TERRAIN_FRAME_PREFIX: Readonly<Record<TerrainType, string>> = {
  [Terrain.Grass]: 'grass',
  [Terrain.Sand]: 'sand',
  [Terrain.Water]: 'water',
  [Terrain.Forest]: 'forest',
  [Terrain.Rock]: 'rock',
  [Terrain.OreIron]: 'ore_iron',
  [Terrain.Dirt]: 'dirt',
};

export const ATLAS_VARIANTS = 4;

/** Pares com tiles de transição no atlas (`<a>_<b>_<máscara>`), na ordem em que aparecem no nome. */
const TRANSITION_PAIRS: readonly (readonly [TerrainType, TerrainType])[] = [
  [Terrain.Grass, Terrain.Sand],
  [Terrain.Grass, Terrain.Dirt],
  [Terrain.Grass, Terrain.Water],
  [Terrain.Sand, Terrain.Water],
];

/**
 * Tile de transição (dual grid) para o canto entre 4 células: NO, NE, SO, SE.
 * Só existe quando os 4 cantos misturam exatamente os dois terrenos de um par conhecido.
 * Perto da água, toda terra firme conta como areia: sem isso, um canto com água e dois outros terrenos
 * (areia e floresta, por exemplo) fica sem transição e mostra um quadrado de água.
 * Bits da máscara = cantos com o terreno `a` (1 = NO, 2 = NE, 4 = SO, 8 = SE).
 */
export function transitionFrame(nw: TerrainType, ne: TerrainType, sw: TerrainType, se: TerrainType): string | null {
  const corners = [nw, ne, sw, se];
  const frame = pairFrame(corners);
  if (frame || !corners.includes(Terrain.Water)) return frame;
  return pairFrame(corners.map((t) => (t === Terrain.Water ? t : Terrain.Sand)));
}

function pairFrame(corners: readonly TerrainType[]): string | null {
  for (const [a, b] of TRANSITION_PAIRS) {
    if (!corners.every((t) => t === a || t === b)) continue;
    const mask = corners.reduce<number>((bits, t, i) => (t === a ? bits | (1 << i) : bits), 0);
    if (mask === 0 || mask === 15) return null;
    return `${TERRAIN_FRAME_PREFIX[a]}_${TERRAIN_FRAME_PREFIX[b]}_${mask}`;
  }
  return null;
}

const TERRAIN_JSON_URL = new URL('../../assets/terrain/terrain.json', import.meta.url).href;
const TERRAIN_IMAGE_URL = new URL('../../assets/terrain/terrain.png', import.meta.url).href;
const OBJECTS_JSON_URL = new URL('../../assets/objects/objects.json', import.meta.url).href;
const OBJECTS_IMAGE_URL = new URL('../../assets/objects/objects.png', import.meta.url).href;

export function loadTerrainAtlas(): Promise<Atlas | null> {
  return loadAtlas(TERRAIN_JSON_URL, TERRAIN_IMAGE_URL);
}

export function loadObjectsAtlas(): Promise<Atlas | null> {
  return loadAtlas(OBJECTS_JSON_URL, OBJECTS_IMAGE_URL);
}
