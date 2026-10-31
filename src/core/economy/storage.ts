/** Armazém: um ponto no mapa com itens somados até a capacidade. */
export interface Storage {
  center: { x: number; y: number };
  capacity: number;
  items: Map<string, number>;
  /**
   * Conta as mudanças neste armazém (só cresce). Máquinas paradas guardam a soma das versões dos
   * armazéns ao alcance e só reavaliam quando ela muda: nenhuma mudança perto passa sem acordar.
   */
  version: number;
}

export function createStorage(center: { x: number; y: number }, capacity: number, items = new Map<string, number>()): Storage {
  return { center, capacity, items, version: 0 };
}

/** Soma das versões: muda se qualquer um dos armazéns mudar (a lista em si não pode mudar entre as leituras). */
export function versionOf(storages: readonly Storage[]): number {
  let total = 0;
  for (const storage of storages) total += storage.version;
  return total;
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
  if (amount !== 0) storage.version++;
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
