import { GAME_SPEEDS, MAX_TICKS_PER_ADVANCE, TICK_MS, type GameSpeed } from './config';
import { GAME_DATA } from './data/data';
import { FixedStepClock } from './time/fixedStepClock';
import { RateMeter } from './time/rateMeter';
import type { Economy, EconomySnapshot } from './economy/economy';
import type { CartEndpoint } from './economy/carts';
import type { Building, BuildingKind, BuildingSite, Rotation } from './world/buildings';

/** Únicas entradas que alteram a simulação: facilita replay, undo e multiplayer no futuro. */
export type SimulationCommand =
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setSpeed'; speed: GameSpeed }
  | { type: 'placeBuilding'; kind: BuildingKind; x: number; y: number; rotation: Rotation }
  | { type: 'removeBuilding'; x: number; y: number }
  | { type: 'rotateBuilding'; x: number; y: number }
  | { type: 'setRecipe'; buildingId: number; recipe: string }
  | { type: 'setFilter'; buildingId: number; item: string | null }
  | { type: 'trade'; village: number; give: string; receive: string }
  | { type: 'recruit'; village: number }
  /** Rota em loop de um pátio das carroças (ver CartRoute); clearCartRoute tira a rota. */
  | { type: 'setCartRoute'; buildingId: number; from: CartEndpoint; to: CartEndpoint; item: string; back?: string }
  | { type: 'clearCartRoute'; buildingId: number };

/** Estado publicado para a main thread a cada avanço. */
export interface SimulationSnapshot {
  tick: number;
  paused: boolean;
  speed: GameSpeed;
  ups: number;
  /** Era atual (1 = Madeira, 2 = Ferro...). */
  era: number;
  /** Muda a cada construção colocada, removida ou girada; a tela só redesenha quando muda. */
  buildingsVersion: number;
  /** Só vem quando `buildingsVersion` mudou desde o último snapshot. */
  buildings?: Building[];
  /**
   * Estoque e estado de extratores e armazéns. Vem a ~4 Hz (ECONOMY_INTERVAL_MS) e logo após
   * qualquer comando; sem ele, vale o último recebido.
   */
  economy?: EconomySnapshot;
}

/** Intervalo mínimo entre dois envios da economia (montar o snapshot dela custa caro). */
export const ECONOMY_INTERVAL_MS = 250;

/** O mundo simulado. Por enquanto conta ticks e guarda as construções; os sistemas entram nas próximas frentes. */
export class Simulation {
  tick = 0;
  era = 1;
  buildingsVersion = 0;

  constructor(
    readonly site: BuildingSite | null = null,
    readonly economy: Economy | null = null,
  ) {
    if (site) economy?.sync(site);
  }

  step(): void {
    this.tick++;
    this.economy?.step();
    this.advanceEra();
  }

  /** A era seguinte abre na primeira vez que o item dela aparece num armazém (data/jogo/eras.json). */
  private advanceEra(): void {
    const next = GAME_DATA.eras.find((era) => era.id === this.era + 1);
    if (!next || !this.economy || this.economy.stockOf(next.unlockItem) === 0) return;
    this.era = next.id;
    if (this.site) this.site.era = next.id;
  }
}

/** Liga relógio fixo, comandos e simulação. Sem dependência de Worker, para ser testável. */
export class SimulationLoop {
  private lastPublishedBuildings = -1;
  private nowMs = 0;
  private lastEconomyMs = -Infinity;
  /** Um comando foi aplicado desde o último envio da economia: a tela precisa ver o efeito já. */
  private economyDirty = true;
  private readonly clock = new FixedStepClock(TICK_MS, MAX_TICKS_PER_ADVANCE);
  private readonly upsMeter = new RateMeter();
  private readonly pendingCommands: SimulationCommand[] = [];
  private paused = false;
  private speed: GameSpeed = 1;

  constructor(readonly simulation = new Simulation()) {}

  enqueue(command: SimulationCommand): void {
    this.pendingCommands.push(command);
  }

  /** Avança pelo tempo real decorrido e retorna quantos ticks rodaram. */
  advance(elapsedMs: number, nowMs: number): number {
    // Comandos só são aplicados entre ticks, nunca no meio de um: mantém o determinismo.
    this.applyPendingCommands();
    const ticks = this.paused ? 0 : this.clock.advance(elapsedMs * this.speed);
    for (let i = 0; i < ticks; i++) this.simulation.step();
    this.upsMeter.record(ticks, nowMs);
    this.nowMs = nowMs;
    return ticks;
  }

  snapshot(): SimulationSnapshot {
    const snapshot: SimulationSnapshot = {
      tick: this.simulation.tick,
      paused: this.paused,
      speed: this.speed,
      ups: this.upsMeter.perSecond,
      era: this.simulation.era,
      buildingsVersion: this.simulation.buildingsVersion,
    };
    if (this.simulation.economy && (this.economyDirty || this.nowMs - this.lastEconomyMs >= ECONOMY_INTERVAL_MS)) {
      snapshot.economy = this.simulation.economy.snapshot();
      this.lastEconomyMs = this.nowMs;
      this.economyDirty = false;
    }
    if (this.simulation.buildingsVersion !== this.lastPublishedBuildings && this.simulation.site) {
      snapshot.buildings = this.simulation.site.all;
      this.lastPublishedBuildings = this.simulation.buildingsVersion;
    }
    return snapshot;
  }

  private applyPendingCommands(): void {
    if (this.pendingCommands.length > 0) this.economyDirty = true;
    for (const command of this.pendingCommands) this.apply(command);
    this.pendingCommands.length = 0;
  }

  private changedBuildings(): void {
    this.simulation.buildingsVersion++;
    if (this.simulation.site) this.simulation.economy?.sync(this.simulation.site);
  }

  private apply(command: SimulationCommand): void {
    switch (command.type) {
      case 'setPaused':
        this.paused = command.paused;
        break;
      case 'setSpeed':
        if (GAME_SPEEDS.includes(command.speed)) this.speed = command.speed;
        break;
      case 'placeBuilding':
        if (this.simulation.site?.place(command.kind, command.x, command.y, command.rotation)) this.changedBuildings();
        break;
      case 'removeBuilding':
        if (this.simulation.site?.removeAt(command.x, command.y)) this.changedBuildings();
        break;
      case 'rotateBuilding':
        if (this.simulation.site?.rotateAt(command.x, command.y)) this.changedBuildings();
        break;
      case 'setRecipe':
        this.simulation.economy?.setRecipe(command.buildingId, command.recipe);
        break;
      case 'setFilter':
        this.simulation.economy?.setFilter(command.buildingId, command.item);
        break;
      case 'trade':
        this.simulation.economy?.tradeWithVillage(command.village, command.give, command.receive);
        break;
      case 'recruit':
        this.simulation.economy?.recruitFromVillage(command.village);
        break;
      case 'setCartRoute': {
        const { from, to, item, back } = command;
        this.simulation.economy?.setCartRoute(command.buildingId, back === undefined ? { from, to, item } : { from, to, item, back });
        break;
      }
      case 'clearCartRoute':
        this.simulation.economy?.setCartRoute(command.buildingId, null);
        break;
    }
  }
}
