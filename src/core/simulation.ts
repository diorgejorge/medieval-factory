import { GAME_SPEEDS, MAX_TICKS_PER_ADVANCE, TICK_MS, type GameSpeed } from './config';
import { FixedStepClock } from './time/fixedStepClock';
import { RateMeter } from './time/rateMeter';

/** Únicas entradas que alteram a simulação: facilita replay, undo e multiplayer no futuro. */
export type SimulationCommand =
  | { type: 'setPaused'; paused: boolean }
  | { type: 'setSpeed'; speed: GameSpeed };

/** Estado publicado para a main thread a cada avanço. */
export interface SimulationSnapshot {
  tick: number;
  paused: boolean;
  speed: GameSpeed;
  ups: number;
}

/** O mundo simulado. Por enquanto só conta ticks; os sistemas entram nas próximas frentes. */
export class Simulation {
  tick = 0;

  step(): void {
    this.tick++;
  }
}

/** Liga relógio fixo, comandos e simulação. Sem dependência de Worker, para ser testável. */
export class SimulationLoop {
  readonly simulation = new Simulation();
  private readonly clock = new FixedStepClock(TICK_MS, MAX_TICKS_PER_ADVANCE);
  private readonly upsMeter = new RateMeter();
  private readonly pendingCommands: SimulationCommand[] = [];
  private paused = false;
  private speed: GameSpeed = 1;

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
    return {
      tick: this.simulation.tick,
      paused: this.paused,
      speed: this.speed,
      ups: this.upsMeter.perSecond,
    };
  }

  private applyPendingCommands(): void {
    for (const command of this.pendingCommands) this.apply(command);
    this.pendingCommands.length = 0;
  }

  private apply(command: SimulationCommand): void {
    switch (command.type) {
      case 'setPaused':
        this.paused = command.paused;
        break;
      case 'setSpeed':
        if (GAME_SPEEDS.includes(command.speed)) this.speed = command.speed;
        break;
    }
  }
}
