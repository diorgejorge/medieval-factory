/// <reference lib="webworker" />
import villageTexts from '../../data/texto/pt-BR/vilarejos.json';
import { MAP_SIZE_TILES, TICK_MS } from '../core/config';
import { Simulation, SimulationLoop } from '../core/simulation';
import { GAME_DATA } from '../core/data/data';
import { Economy } from '../core/economy/economy';
import { createWorld } from '../core/world/world';
import type { CommandMessage, InitMessage, SaveMessage, SavedMessage, SnapshotMessage } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

/** Acordamos duas vezes por tick para o atraso entre o tick ideal e o real ficar pequeno. */
const WAKE_INTERVAL_MS = TICK_MS / 2;

let loop: SimulationLoop | null = null;
let lastWakeMs = performance.now();
let receivedCommand = false;
let seed = 0;

self.onmessage = (event: MessageEvent<InitMessage | CommandMessage | SaveMessage>) => {
  const message = event.data;
  if (message.kind === 'save') {
    if (loop) self.postMessage({ kind: 'saved', data: loop.simulation.save(seed) } satisfies SavedMessage);
    return;
  }
  if (message.kind === 'init') {
    seed = message.seed;
    const world = createWorld(message.seed, MAP_SIZE_TILES, villageTexts.names);
    const { start, villages } = world.settlements;
    const economy = new Economy(world.grid, start?.center ?? null, GAME_DATA.start, villages, start?.area ?? null);
    const simulation = new Simulation(world.site, economy);
    if (message.save) simulation.load(message.save);
    loop = new SimulationLoop(simulation);
  } else {
    loop?.enqueue(message.command);
  }
  receivedCommand = true;
};

setInterval(() => {
  const now = performance.now();
  if (!loop) {
    lastWakeMs = now;
    return;
  }
  const ticks = loop.advance(now - lastWakeMs, now);
  lastWakeMs = now;
  // Só publica quando algo mudou, para não inundar a main thread enquanto pausado.
  if (ticks === 0 && !receivedCommand) return;
  receivedCommand = false;
  const message: SnapshotMessage = { kind: 'snapshot', snapshot: loop.snapshot() };
  self.postMessage(message);
}, WAKE_INTERVAL_MS);
