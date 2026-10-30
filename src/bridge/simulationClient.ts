import type { SimulationCommand, SimulationSnapshot } from '../core/simulation';
import type { CommandMessage, SnapshotMessage } from './protocol';

/** Lado da main thread: envia comandos ao Worker e guarda o snapshot mais recente. */
export class SimulationClient {
  private readonly worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
    type: 'module',
  });
  private latestSnapshot: SimulationSnapshot | null = null;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<SnapshotMessage>) => {
      this.latestSnapshot = event.data.snapshot;
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
