import type { SimulationCommand, SimulationSnapshot } from '../core/simulation';
import type { Building } from '../core/world/buildings';
import type { CommandMessage, InitMessage, SnapshotMessage } from './protocol';

/** Lado da main thread: envia comandos ao Worker e guarda o snapshot mais recente. */
export class SimulationClient {
  private readonly worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
    type: 'module',
  });
  private latestSnapshot: SimulationSnapshot | null = null;
  /** Chamado quando a simulação publica uma lista nova de construções. */
  onBuildingsChanged: (buildings: Building[]) => void = () => {};

  constructor(seed: number) {
    const init: InitMessage = { kind: 'init', seed };
    this.worker.postMessage(init);
    this.worker.onmessage = (event: MessageEvent<SnapshotMessage>) => {
      this.latestSnapshot = event.data.snapshot;
      if (event.data.snapshot.buildings) this.onBuildingsChanged(event.data.snapshot.buildings);
    };
  }

  get snapshot(): SimulationSnapshot | null {
    return this.latestSnapshot;
  }

  send(command: SimulationCommand): void {
    const message: CommandMessage = { kind: 'command', command };
    this.worker.postMessage(message);
  }

  dispose(): void {
    this.worker.terminate();
  }
}
