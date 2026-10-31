/**
 * Conta toda mudança em qualquer armazém. Máquinas paradas guardam o valor e só reavaliam
 * quando ele muda: acordar a mais nunca erra, e nenhuma mudança passa sem acordar.
 */
let changes = 0;

export function storageChanges(): number {
  return changes;
}

/** Avise quando armazéns forem criados ou removidos. */
export function markStoragesChanged(): void {
  changes++;
}

/** Armazém: um ponto no mapa com itens somados até a capacidade. */
export interface Storage {
  center: { x: number; y: number };
  capacity: number;
  items: Map<string, number>;
}

export function used(storage: Storage): number {
  let total = 0;
  for (const amount of storage.items.values()) total += amount;
  return total;
}

export function freeSpace(storage: Storage): number {
  return storage.capacity - used(storage);
}

/** Soma ou tira (amount negativo) itens; zero some do mapa para o snapshot ficar limpo. */
export function add(storage: Storage, item: string, amount: number): void {
  if (amount !== 0) changes++;
  const next = (storage.items.get(item) ?? 0) + amount;
  if (next > 0) storage.items.set(item, next);
  else storage.items.delete(item);
}

/** Quanto de um item há somando os armazéns. */
export function available(storages: readonly Storage[], item: string): number {
  return storages.reduce((sum, storage) => sum + (storage.items.get(item) ?? 0), 0);
}

/** Tira `amount` do item, do primeiro armazém da lista (o mais perto) para o último. Chame só após `available`. */
export function take(storages: readonly Storage[], item: string, amount: number): void {
  let missing = amount;
  for (const storage of storages) {
    const taken = Math.min(missing, storage.items.get(item) ?? 0);
    add(storage, item, -taken);
    missing -= taken;
    if (missing === 0) return;
  }
}
