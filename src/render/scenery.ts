import type { Grid } from '../core/world/grid';
import type { MapObject } from '../core/world/mapObjects';
import { hash2d } from '../core/random/rng';
import { Terrain, type TerrainType } from '../core/world/terrain';

/**
 * Montes de pedra e minério só de enfeite: a extração continua lendo o terreno 1×1, então espalhar os
 * montes é desenho, não regra. Um monte por bloco 2×2; montes grandes (4 tiles) se sobrepõem no miolo da
 * pedra e viram um maciço contínuo, e os pequenos (2,5 tiles) arrematam a borda.
 */
const BLOCK = 2;
/** Folga em volta do bloco que precisa ser pedra para ele contar como miolo do maciço. */
const CORE_MARGIN = 1;
const DENSITY = { core: 1, edge: 0.6 } as const;
const JITTER = 0.35;
const VARIANTS = 2;
const SEED = 0x51ed;

const KIND: Partial<Record<TerrainType, string>> = {
  [Terrain.Rock]: 'boulder_rock',
  [Terrain.OreIron]: 'boulder_ore_iron',
};

export function scatterBoulders(grid: Grid): MapObject[] {
  const boulders: MapObject[] = [];
  for (let y = 0; y + BLOCK <= grid.size; y += BLOCK) {
    for (let x = 0; x + BLOCK <= grid.size; x += BLOCK) {
      const kind = blockKind(grid, x, y, BLOCK, 0);
      if (!kind) continue;
      const core = blockKind(grid, x, y, BLOCK, CORE_MARGIN) !== null;
      const roll = hash2d(x, y, SEED);
      if (fraction(roll) >= (core ? DENSITY.core : DENSITY.edge)) continue;
      const jitterX = (fraction(roll >>> 10) - 0.5) * 2 * JITTER;
      const jitterY = (fraction(roll >>> 20) - 0.5) * 2 * JITTER;
      boulders.push({
        frame: `${kind}${core ? '' : '_small'}_${roll % VARIANTS}`,
        x: x + BLOCK / 2 + jitterX,
        y: y + BLOCK - 0.25 + jitterY,
        noShadow: true,
      });
    }
  }
  return boulders;
}

/**
 * Tipo de monte do bloco (com `margin` tiles de folga em volta), ou null se algum tile não for pedra.
 * Minério vence se aparecer no bloco.
 */
function blockKind(grid: Grid, left: number, top: number, size: number, margin: number): string | null {
  let kind: string | null = null;
  for (let y = top - margin; y < top + size + margin; y++) {
    for (let x = left - margin; x < left + size + margin; x++) {
      if (!grid.isInside(x, y)) return null;
      const here = KIND[grid.getTerrain(x, y)];
      if (!here) return null;
      if (!kind || here === KIND[Terrain.OreIron]) kind = here;
    }
  }
  return kind;
}

function fraction(bits: number): number {
  return (bits % 1000) / 1000;
}
