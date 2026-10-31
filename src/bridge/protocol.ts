import type { SaveData, SimulationCommand, SimulationSnapshot } from '../core/simulation';

/** Primeira mensagem main → Worker: o Worker gera o mesmo mundo a partir da seed (e carrega o jogo salvo, se vier). */
export interface InitMessage {
  kind: 'init';
  seed: number;
  save?: SaveData;
}

/** Mensagens main → Worker. */
export interface CommandMessage {
  kind: 'command';
  command: SimulationCommand;
}

/** Pede o estado do jogo para salvar; o Worker responde com SavedMessage. */
export interface SaveMessage {
  kind: 'save';
}

/** Mensagens Worker → main. */
export interface SnapshotMessage {
  kind: 'snapshot';
  snapshot: SimulationSnapshot;
}

export interface SavedMessage {
  kind: 'saved';
  data: SaveData;
}
