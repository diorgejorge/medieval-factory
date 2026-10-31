import { TICKS_PER_SECOND } from '../config';
import { add, freeSpace, type Storage } from './storage';

/** Tiles por segundo de um servo andando. */
export const SERVANT_SPEED = 4;
/** Quantos itens um servo carrega por viagem. */
export const SERVANT_CARRY = 5;

/** Pedido: o armazém `storageId` precisa de `amount` do item (para uma máquina ou extrator perto dele). */
export interface Demand {
  storageId: number;
  item: string;
  amount: number;
  /** Quem pediu e até onde ele já alcança sozinho: armazéns nesse raio não servem de origem. */
  requester: { x: number; y: number };
  reach: number;
}

export interface ServantView {
  x: number;
  y: number;
  busy: boolean;
  carrying: string | null;
}

interface Job {
  from: number;
  to: number;
  item: string;
  amount: number;
  phase: 'pickup' | 'drop';
}

/** Servo: anda até um armazém, pega itens e leva para outro. Sem trabalho, fica onde está. */
export class Servant {
  job: Job | null = null;
  carrying = 0;

  constructor(
    public x: number,
    public y: number,
  ) {}

  view(): ServantView {
    return { x: this.x, y: this.y, busy: this.job !== null, carrying: this.carrying > 0 && this.job ? this.job.item : null };
  }
}

/**
 * Distribui pedidos aos servos livres e avança quem está trabalhando.
 * Cada pedido desconta o que já está a caminho, para dois servos não atenderem a mesma falta.
 */
export function stepServants(servants: readonly Servant[], storages: ReadonlyMap<number, Storage>, demands: readonly Demand[]): void {
  assignJobs(servants, storages, demands);
  for (const servant of servants) moveServant(servant, storages);
}

function assignJobs(servants: readonly Servant[], storages: ReadonlyMap<number, Storage>, demands: readonly Demand[]): void {
  const idle = servants.filter((s) => !s.job);
  if (idle.length === 0) return;
  for (const demand of demands) {
    const missing = demand.amount - inFlight(servants, demand.storageId, demand.item);
    if (missing <= 0) continue;
    const source = nearestSource(storages, servants, demand);
    if (!source) continue;
    const servant = nearestServant(idle, source.storage);
    if (!servant) return;
    idle.splice(idle.indexOf(servant), 1);
    servant.job = {
      from: source.id,
      to: demand.storageId,
      item: demand.item,
      amount: Math.min(missing, SERVANT_CARRY, source.free),
      phase: 'pickup',
    };
    if (idle.length === 0) return;
  }
}

function moveServant(servant: Servant, storages: ReadonlyMap<number, Storage>): void {
  const job = servant.job;
  if (!job) return;
  const target = storages.get(job.phase === 'pickup' ? job.from : job.to);
  if (!target) {
    // O armazém sumiu: devolve o que carrega ao mais próximo e larga o trabalho.
    if (servant.carrying > 0) {
      const fallback = nearest([...storages.values()], (storage) => storage.center, servant);
      if (fallback) add(fallback, job.item, servant.carrying);
    }
    servant.job = null;
    servant.carrying = 0;
    return;
  }
  if (!walkTowards(servant, target.center)) return;
  if (job.phase === 'pickup') {
    servant.carrying = Math.min(job.amount, target.items.get(job.item) ?? 0);
    add(target, job.item, -servant.carrying);
    if (servant.carrying === 0) servant.job = null;
    else job.phase = 'drop';
  } else {
    // Só larga o que cabe; o resto vai para outro armazém com espaço (ou espera, se não houver).
    const dropped = Math.min(servant.carrying, freeSpace(target));
    add(target, job.item, dropped);
    servant.carrying -= dropped;
    if (servant.carrying === 0) {
      servant.job = null;
      return;
    }
    const other = nearestWithSpace(storages, job.to, servant);
    if (other !== null) job.to = other;
  }
}

/** Anda um tick em linha reta; devolve true ao chegar. */
function walkTowards(servant: Servant, point: { x: number; y: number }): boolean {
  const step = SERVANT_SPEED / TICKS_PER_SECOND;
  const dx = point.x - servant.x;
  const dy = point.y - servant.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= step) {
    servant.x = point.x;
    servant.y = point.y;
    return true;
  }
  servant.x += (dx / distance) * step;
  servant.y += (dy / distance) * step;
  return false;
}

/** Armazém com espaço mais perto do servo, sem ser `except`. */
function nearestWithSpace(storages: ReadonlyMap<number, Storage>, except: number, servant: Servant): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const [id, storage] of storages) {
    if (id === except || freeSpace(storage) <= 0) continue;
    const distance = Math.hypot(storage.center.x - servant.x, storage.center.y - servant.y);
    if (distance < bestDistance) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}

/** Quanto do item já está indo para o armazém (pego ou por pegar). */
function inFlight(servants: readonly Servant[], storageId: number, item: string): number {
  return servants.reduce((sum, s) => (s.job?.to === storageId && s.job.item === item ? sum + s.job.amount : sum), 0);
}

/** Armazém (que não seja o destino) mais perto do destino com o item ainda não reservado por outro servo. */
function nearestSource(
  storages: ReadonlyMap<number, Storage>,
  servants: readonly Servant[],
  demand: Demand,
): { id: number; storage: Storage; free: number } | null {
  const destination = storages.get(demand.storageId);
  if (!destination) return null;
  let best: { id: number; storage: Storage; free: number; distance: number } | null = null;
  for (const [id, storage] of storages) {
    if (id === demand.storageId) continue;
    if (Math.hypot(storage.center.x - demand.requester.x, storage.center.y - demand.requester.y) <= demand.reach) continue;
    const reserved = servants.reduce(
      (sum, s) => (s.job?.from === id && s.job.phase === 'pickup' && s.job.item === demand.item ? sum + s.job.amount : sum),
      0,
    );
    const free = (storage.items.get(demand.item) ?? 0) - reserved;
    if (free <= 0) continue;
    const distance = Math.hypot(storage.center.x - destination.center.x, storage.center.y - destination.center.y);
    if (!best || distance < best.distance) best = { id, storage, free, distance };
  }
  return best;
}

function nearestServant(servants: readonly Servant[], storage: Storage): Servant | null {
  return nearest(servants, (servant) => servant, storage.center);
}

function nearest<T>(
  candidates: readonly T[],
  positionOf: (candidate: T) => { x: number; y: number },
  point: { x: number; y: number },
): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const at = positionOf(candidate);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
