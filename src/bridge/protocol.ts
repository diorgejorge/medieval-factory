import type { SimulationCommand, SimulationSnapshot } from '../core/simulation';

/** Primeira mensagem main → Worker: o Worker gera o mesmo mundo a partir da seed. */
export interface InitMessage {
  kind: 'init';
  seed: number;
}

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
