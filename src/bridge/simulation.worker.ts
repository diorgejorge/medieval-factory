/// <reference lib="webworker" />
import { TICK_MS } from '../core/config';
import { SimulationLoop } from '../core/simulation';
import type { CommandMessage, SnapshotMessage } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

/** Acordamos duas vezes por tick para o atraso entre o tick ideal e o real ficar pequeno. */
const WAKE_INTERVAL_MS = TICK_MS / 2;

const loop = new SimulationLoop();
let lastWakeMs = performance.now();
let receivedCommand = false;

self.onmessage = (event: MessageEvent<CommandMessage>) => {
  loop.enqueue(event.data.command);
  receivedCommand = true;
};

setInterval(() => {
  const now = performance.now();
  const ticks = loop.advance(now - lastWakeMs, now);
  lastWakeMs = now;
  // Só publica quando algo mudou, para não inundar a main thread enquanto pausado.
  if (ticks === 0 && !receivedCommand) return;
  receivedCommand = false;
  const message: SnapshotMessage = { kind: 'snapshot', snapshot: loop.snapshot() };
  self.postMessage(message);
}, WAKE_INTERVAL_MS);
