import { BuildingSite } from './buildings';
import { generateWorld } from './generator';
import type { Grid } from './grid';
import { settleWorld, type Settlements, type VillageNames } from './villages';

export interface World {
  grid: Grid;
  settlements: Settlements;
  site: BuildingSite;
}

/**
 * Mapa completo a partir da seed: terreno, vilas, trilhas e o terreno construível.
 * A simulação (no Worker) e a tela geram o mesmo mundo, porque tudo é determinístico.
 */
export function createWorld(seed: number, size: number, names: VillageNames): World {
  const grid = generateWorld(seed, size);
  const settlements = settleWorld(grid, seed, names);
  const { start, villages } = settlements;
  const reserved = [...(start ? [start.area] : []), ...villages.map((v) => v.area)];
  return { grid, settlements, site: new BuildingSite(grid, reserved) };
}
