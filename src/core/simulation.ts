import { GAME_SPEEDS, MAX_TICKS_PER_ADVANCE, TICK_MS, type GameSpeed } from './config';
import { FixedStepClock } from './time/fixedStepClock';
import { RateMeter } from './time/rateMeter';
import type { Economy, EconomySnapshot } from './economy/economy';
import type { Building, BuildingKind, BuildingSite, Rotation } from './world/buildings';

/** Únicas entradas que alteram a simulação: facilita replay, undo e multiplayer no futuro. */
export type SimulationCommand =
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setSpeed'; speed: GameSpeed }
  | { type: 'placeBuilding'; kind: BuildingKind; x: number; y: number; rotation: Rotation }
  | { type: 'removeBuilding'; x: number; y: number }
  | { type: 'rotateBuilding'; x: number; y: number }
  | { type: 'setRecipe'; buildingId: number; recipe: string }
  | { type: 'trade'; village: number; give: string; receive: string }
  | { type: 'recruit'; village: number };

/** Estado publicado para a main thread a cada avanço. */
export interface SimulationSnapshot {
  tick: number;
  paused: boolean;
  speed: GameSpeed;
  ups: number;
  /** Muda a cada construção colocada, removida ou girada; a tela só redesenha quando muda. */
  buildingsVersion: number;
  /** Só vem quando `buildingsVersion` mudou desde o último snapshot. */
  buildings?: Building[];
  /** Estoque e estado de extratores e armazéns. */
  economy?: EconomySnapshot;
}

/** O mundo simulado. Por enquanto conta ticks e guarda as construções; os sistemas entram nas próximas frentes. */
export class Simulation {
  tick = 0;
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
  }
}

/** Liga relógio fixo, comandos e simulação. Sem dependência de Worker, para ser testável. */
export class SimulationLoop {
  private lastPublishedBuildings = -1;
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
    return ticks;
  }

  snapshot(): SimulationSnapshot {
    const snapshot: SimulationSnapshot = {
      tick: this.simulation.tick,
      paused: this.paused,
      speed: this.speed,
      ups: this.upsMeter.perSecond,
      buildingsVersion: this.simulation.buildingsVersion,
    };
    if (this.simulation.economy) snapshot.economy = this.simulation.economy.snapshot();
    if (this.simulation.buildingsVersion !== this.lastPublishedBuildings && this.simulation.site) {
      snapshot.buildings = this.simulation.site.all;
      this.lastPublishedBuildings = this.simulation.buildingsVersion;
    }
    return snapshot;
  }

  private applyPendingCommands(): void {
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
      case 'trade':
        this.simulation.economy?.tradeWithVillage(command.village, command.give, command.receive);
        break;
      case 'recruit':
        this.simulation.economy?.recruitFromVillage(command.village);
        break;
    }
  }
}
