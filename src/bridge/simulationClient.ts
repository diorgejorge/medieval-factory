import type { SaveData, SimulationCommand, SimulationSnapshot } from '../core/simulation';
import type { Building } from '../core/world/buildings';
import type { CommandMessage, InitMessage, SaveMessage, SavedMessage, SnapshotMessage } from './protocol';

/** Lado da main thread: envia comandos ao Worker e guarda o snapshot mais recente. */
export class SimulationClient {
  private readonly worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
    type: 'module',
  });
  private latestSnapshot: SimulationSnapshot | null = null;
  /** Chamado quando a simulação publica uma lista nova de construções. */
  onBuildingsChanged: (buildings: Building[]) => void = () => {};

  private pendingSaves: ((data: SaveData) => void)[] = [];

  /** `save`: jogo salvo para carregar no mundo dessa seed. */
  constructor(seed: number, save?: SaveData) {
    const init: InitMessage = save ? { kind: 'init', seed, save } : { kind: 'init', seed };
    this.worker.postMessage(init);
    this.worker.onmessage = (event: MessageEvent<SnapshotMessage | SavedMessage>) => {
      if (event.data.kind === 'saved') {
        const data = event.data.data;
        for (const resolve of this.pendingSaves.splice(0)) resolve(data);
        return;
      }
      const snapshot = event.data.snapshot;
      // A economia vem só a ~4 Hz: sem ela no snapshot, continua valendo a última recebida.
      const economy = snapshot.economy ?? this.latestSnapshot?.economy;
      this.latestSnapshot = economy ? { ...snapshot, economy } : snapshot;
      if (snapshot.buildings) this.onBuildingsChanged(snapshot.buildings);
    };
  }

  get snapshot(): SimulationSnapshot | null {
    return this.latestSnapshot;
  }

  /** Estado atual do jogo, para salvar. */
  requestSave(): Promise<SaveData> {
    return new Promise((resolve) => {
      this.pendingSaves.push(resolve);
      this.worker.postMessage({ kind: 'save' } satisfies SaveMessage);
    });
  }

  send(command: SimulationCommand): void {
    const message: CommandMessage = { kind: 'command', command };
    this.worker.postMessage(message);
  }

  dispose(): void {
    this.worker.terminate();
  }
}
