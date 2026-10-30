import type { SimulationCommand, SimulationSnapshot } from '../core/simulation';

/** Mensagens main → Worker. */
export interface CommandMessage {
  kind: 'command';
  command: SimulationCommand;
}

/** Mensagens Worker → main. */
export interface SnapshotMessage {
  kind: 'snapshot';
  snapshot: SimulationSnapshot;
}
