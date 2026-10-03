import { invoke, isTauri } from '@tauri-apps/api/core';
import { decodeSavePayload, encodeSavePayload, type SavePayload } from './savePayload';
import type { SerializedSave } from './serializedSave';

export interface SaveMetadata {
  slotId: string; savedAt: string; schemaVersion: number;
  turn: number; countryId: string; playerName: string;
}
interface StoredSave { slotId: string; contents?: SavePayload; metadata: SaveMetadata; }

// Browser storage supports local QA. Distributed native builds use the Rust store.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ahdnative-local-saves', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves', { keyPath: 'slotId' });
    request.onerror = () => reject(request.error ?? new Error('Could not open saved games.'));
    request.onblocked = () => reject(new Error('Close other app windows and try again.'));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', mode);
    const request = operation(tx.objectStore('saves'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = () => { db.close(); reject(tx.error ?? request.error ?? new Error('Saved game storage failed.')); };
    tx.onerror = () => { /* onabort reports the transaction failure. */ };
  });
}
export const saveRepository = {
  async save(slotId: string, input: string | SerializedSave): Promise<void> {
    const serialized = typeof input === 'string' ? undefined : input;
    const contents = typeof input === 'string' ? input : input.contents;
    if (isTauri()) return invoke('save_game', { slotId, contents });
    // The envelope is produced by the in-process worker serializer. Keep the
    // raw-string API's parse/validation behavior for fixture and import saves.
    const metadata: SaveMetadata = serialized
      ? { slotId, ...serialized.metadata }
      : (() => {
        const save = JSON.parse(contents);
        return { slotId, savedAt: save.savedAt, schemaVersion: save.schemaVersion,
          turn: save.world.meta.turn, countryId: save.world.player.countryId, playerName: save.world.player.name };
      })();
    const payload = await encodeSavePayload(contents);
    await transaction('readwrite', store => store.put({ slotId, contents: payload, metadata } satisfies StoredSave));
  },
  async load(slotId: string): Promise<string> {
    if (isTauri()) return invoke('load_game', { slotId });
    const saved: StoredSave | undefined = await transaction('readonly', store => store.get(slotId));
    if (!saved) throw new Error('This saved game could not be found.');
    if (saved.contents === undefined) throw new Error('This saved game has no browser payload.');
    return decodeSavePayload(saved.contents);
  },
  async list(): Promise<SaveMetadata[]> {
    if (isTauri()) return invoke('list_saves');
    const saves: StoredSave[] = await transaction('readonly', store => store.getAll());
    return saves.map(save => save.metadata).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  async delete(slotId: string): Promise<void> {
    if (isTauri()) return invoke('delete_save', { slotId });
    await transaction('readwrite', store => store.delete(slotId));
  },
};
