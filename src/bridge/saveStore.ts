import type { SaveData } from '../core/simulation';

const DB_NAME = 'medieval-factory';
const STORE = 'saves';
/** Por enquanto, um jogo salvo só. */
const SLOT = 'slot-1';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponível'));
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha no IndexedDB'));
    });
  } finally {
    db.close();
  }
}

/** JSON comprimido com gzip (CompressionStream), guardado no IndexedDB do navegador. */
export async function writeSave(data: SaveData): Promise<void> {
  const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = await new Response(stream).arrayBuffer();
  await run('readwrite', (store) => store.put(bytes, SLOT));
}

/** O jogo salvo, ou null se não houver (ou se o navegador não deixar ler). */
export async function readSave(): Promise<SaveData | null> {
  try {
    const bytes = await run<ArrayBuffer | undefined>('readonly', (store) => store.get(SLOT) as IDBRequest<ArrayBuffer | undefined>);
    if (!bytes) return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const data = JSON.parse(await new Response(stream).text()) as SaveData;
    return data.version === 1 ? data : null;
  } catch {
    return null;
  }
}
