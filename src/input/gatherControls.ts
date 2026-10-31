import { handGatherItem } from '../core/economy/economy';
import type { Player } from '../core/player';
import type { Area } from '../core/world/villages';
import type { Grid } from '../core/world/grid';
import type { SimulationClient } from '../bridge/simulationClient';

/** Segurando E, um golpe de machado ou picareta a cada tanto. */
const GATHER_INTERVAL_S = 0.6;
/** Perto assim (em tiles, do pé até a borda) de um armazém, o camponês larga o que carrega. */
const DEPOSIT_RANGE = 1.5;
const DEPOSIT_INTERVAL_S = 0.5;

/** Um lugar onde o camponês pode largar a carga: a vila ou um armazém construído. */
export interface DropPoint {
  storageId: number;
  area: Area;
}

/**
 * Colheita à mão: segurando E ao lado de floresta ou rocha, o camponês tira 1 item por golpe
 * (comando `gather` para a simulação). Chegando perto de um armazém, larga a carga (`deposit`).
 */
export class GatherControls {
  private holding = false;
  private sinceGather = GATHER_INTERVAL_S;
  private sinceDeposit = 0;

  constructor(
    private readonly player: Player,
    private readonly grid: Grid,
    private readonly client: SimulationClient,
  ) {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyE') this.holding = true;
    });
    window.addEventListener('keyup', (event) => {
      if (event.code === 'KeyE') this.holding = false;
    });
    window.addEventListener('blur', () => (this.holding = false));
  }

  /** Chamar uma vez por quadro, com o quanto o camponês carrega e onde dá para largar. */
  update(seconds: number, carrying: number, drops: readonly DropPoint[]): void {
    this.sinceGather += seconds;
    this.sinceDeposit += seconds;
    if (this.holding && this.sinceGather >= GATHER_INTERVAL_S) {
      const tile = this.resourceNear();
      if (tile) {
        this.client.send({ type: 'gather', x: tile.x, y: tile.y });
        this.sinceGather = 0;
      }
    }
    if (carrying > 0 && this.sinceDeposit >= DEPOSIT_INTERVAL_S) {
      const drop = drops.find(({ area }) => distanceToArea(this.player, area) <= DEPOSIT_RANGE);
      if (drop) {
        this.client.send({ type: 'deposit', storageId: drop.storageId });
        this.sinceDeposit = 0;
      }
    }
  }

  /** O tile com recurso mais perto dos pés, entre os vizinhos do tile onde o camponês está. */
  private resourceNear(): { x: number; y: number } | null {
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    let best: { x: number; y: number } | null = null;
    let bestDistance = Infinity;
    for (let y = py - 1; y <= py + 1; y++) {
      for (let x = px - 1; x <= px + 1; x++) {
        if (!this.grid.isInside(x, y) || !handGatherItem(this.grid.getTerrain(x, y))) continue;
        const distance = Math.hypot(x + 0.5 - this.player.x, y + 0.5 - this.player.y);
        if (distance < bestDistance) {
          best = { x, y };
          bestDistance = distance;
        }
      }
    }
    return best;
  }
}

function distanceToArea(point: { x: number; y: number }, area: Area): number {
  const dx = Math.max(area.left - point.x, 0, point.x - (area.left + area.width));
  const dy = Math.max(area.top - point.y, 0, point.y - (area.top + area.height));
  return Math.hypot(dx, dy);
}
