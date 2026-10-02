import { afterEach, describe, expect, it, vi } from "vitest";
import { saveRepository } from "./storage";

interface TestStoredSave {
  slotId: string;
  contents: string | { encoding: "gzip"; bytes: Uint8Array };
  metadata: unknown;
}

function indexedDbWith(rows: Map<string, TestStoredSave>): IDBFactory {
  return {
    open() {
      const request: Record<string, unknown> = {};
      queueMicrotask(() => {
        const database = {
          createObjectStore: () => undefined,
          close: () => undefined,
          transaction: () => {
            const transaction: Record<string, unknown> = {};
            const store = {
              put(value: TestStoredSave) {
                rows.set(value.slotId, value);
                queueMicrotask(() => (transaction["oncomplete"] as (() => void) | undefined)?.());
                return { result: undefined };
              },
              get(slotId: string) {
                const getRequest: Record<string, unknown> = { result: undefined };
                queueMicrotask(() => {
                  getRequest["result"] = rows.get(slotId);
                  (transaction["oncomplete"] as (() => void) | undefined)?.();
                });
                return getRequest;
              },
              getAll() {
                const getRequest: Record<string, unknown> = { result: [] };
                queueMicrotask(() => {
                  getRequest["result"] = [...rows.values()];
                  (transaction["oncomplete"] as (() => void) | undefined)?.();
                });
                return getRequest;
              },
              delete(slotId: string) {
                rows.delete(slotId);
                queueMicrotask(() => (transaction["oncomplete"] as (() => void) | undefined)?.());
                return { result: undefined };
              },
            };
            transaction["objectStore"] = () => store;
            return transaction;
          },
        };
        request["result"] = database;
        (request["onupgradeneeded"] as (() => void) | undefined)?.();
        (request["onsuccess"] as (() => void) | undefined)?.();
      });
      return request;
    },
  } as unknown as IDBFactory;
}

afterEach(() => vi.unstubAllGlobals());

describe("browser save repository", () => {
  it("writes compressed payloads and reads them back through the repository", async () => {
    const rows = new Map<string, TestStoredSave>();
    vi.stubGlobal("indexedDB", indexedDbWith(rows));
    const contents = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 58,
      savedAt: "2026-10-01T00:00:00.000Z",
      world: { meta: { turn: 18 }, player: { countryId: "IE", name: "Player" } },
      history: Array.from({ length: 10_000 }, (_, turn) => ({ turn, text: "repeated snapshot values" })),
    });

    await saveRepository.save("new", contents);
    const stored = rows.get("new")!;
    expect(stored.metadata).toEqual({
      slotId: "new",
      savedAt: "2026-10-01T00:00:00.000Z",
      schemaVersion: 58,
      turn: 18,
      countryId: "IE",
      playerName: "Player",
    });
    expect(typeof stored.contents).toBe("object");
    if (typeof stored.contents === "string") throw new Error("Expected compressed storage");
    expect(stored.contents.bytes.byteLength).toBeLessThan(contents.length / 4);
    await expect(saveRepository.load("new")).resolves.toBe(contents);
    await expect(saveRepository.list()).resolves.toEqual([stored.metadata]);
  });

  it("continues reading existing raw string records", async () => {
    const rows = new Map<string, TestStoredSave>();
    vi.stubGlobal("indexedDB", indexedDbWith(rows));
    const contents = JSON.stringify({
      format: "ahdsolo-save",
      schemaVersion: 58,
      savedAt: "2026-10-01T00:00:00.000Z",
      world: { meta: { turn: 3 }, player: { countryId: "IE", name: "Player" } },
    });
    const metadata = { slotId: "legacy", savedAt: "2026-10-01T00:00:00.000Z", schemaVersion: 58, turn: 3, countryId: "IE", playerName: "Player" };
    rows.set("legacy", {
      slotId: "legacy",
      contents,
      metadata,
    });

    await expect(saveRepository.load("legacy")).resolves.toBe(contents);
    await expect(saveRepository.list()).resolves.toEqual([metadata]);
  });
});
