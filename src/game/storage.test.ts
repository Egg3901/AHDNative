import { afterEach, describe, expect, it, vi } from "vitest";
import { saveRepository } from "./storage";
import { encodeSavePayload } from "./savePayload";

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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("browser save repository", () => {
  it("prepares compressed browser transfers and exact raw native saves", async () => {
    const contents = '{"format":"ahdsolo-save","schemaVersion":65,"world":{"meta":{"turn":1}}}';
    const metadata = { savedAt: "2026-10-03T16:00:00.000Z", schemaVersion: 65, turn: 1, countryId: "IE", playerName: "Player" };
    const original = { contents, metadata };
    const encoded = { contents: await encodeSavePayload(contents), metadata };
    const client = {
      serializeWithMetadata: vi.fn(async () => original),
      serializeForStorage: vi.fn(async () => encoded),
    };
    expect(await saveRepository.prepare(client, metadata.savedAt, true)).toBe(encoded);
    expect(client.serializeForStorage).toHaveBeenCalledWith(metadata.savedAt, true);
    const invoke = vi.fn(async () => undefined);
    vi.stubGlobal("isTauri", true);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: { invoke } });
    const native = await saveRepository.prepare(client, metadata.savedAt, true);
    expect(native).toBe(original);
    expect(client.serializeWithMetadata).toHaveBeenCalledWith(metadata.savedAt, true);
    await saveRepository.save("native-slot", native);
    expect(invoke).toHaveBeenCalledWith("save_game", { slotId: "native-slot", contents }, undefined);
  });
  it("persists a worker-compressed save and reloads its exact original bytes", async () => {
    const rows = new Map<string, TestStoredSave>();
    vi.stubGlobal("indexedDB", indexedDbWith(rows));
    const contents = JSON.stringify({
      format: "ahdsolo-save", schemaVersion: 65, savedAt: "2026-10-03T16:00:00.000Z",
      world: { meta: { turn: 128 }, player: { countryId: "IE", name: "Player" } },
      history: Array.from({ length: 10_000 }, (_, turn) => ({ turn, text: "Dáil history with quotes \" and newlines\n" })),
    });
    const metadata = { savedAt: "2026-10-03T16:00:00.000Z", schemaVersion: 65, turn: 128, countryId: "IE", playerName: "Player" };
    const payload = await encodeSavePayload(contents);
    await saveRepository.save("worker-compressed", { contents: payload, metadata });
    expect(rows.get("worker-compressed")?.metadata).toEqual({ slotId: "worker-compressed", ...metadata });
    expect(await saveRepository.load("worker-compressed") === contents).toBe(true);
  });
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

  it("stores worker-provided metadata without parsing the unchanged save bytes", async () => {
    const rows = new Map<string, TestStoredSave>();
    vi.stubGlobal("indexedDB", indexedDbWith(rows));
    const contents = JSON.stringify({
      format: "ahdsolo-save", schemaVersion: 70, savedAt: "2026-10-03T12:00:00.000Z",
      world: { meta: { turn: 27 }, player: { countryId: "UK", name: "Morgan" } },
    });
    const metadata = {
      savedAt: "2026-10-03T12:00:00.000Z", schemaVersion: 70, turn: 27,
      countryId: "UK", playerName: "Morgan",
    };
    expect(metadata).toEqual((() => {
      const parsed = JSON.parse(contents);
      return { savedAt: parsed.savedAt, schemaVersion: parsed.schemaVersion, turn: parsed.world.meta.turn,
        countryId: parsed.world.player.countryId, playerName: parsed.world.player.name };
    })());
    const parse = vi.spyOn(JSON, "parse").mockImplementation(() => { throw new Error("unexpected full-save parse"); });

    await saveRepository.save("worker-save", { contents, metadata });

    expect(parse).not.toHaveBeenCalled();
    expect(rows.get("worker-save")?.metadata).toEqual({ slotId: "worker-save", ...metadata });
    await expect(saveRepository.load("worker-save")).resolves.toBe(contents);
  });

  it("still rejects corrupt raw-string saves before writing a record", async () => {
    const rows = new Map<string, TestStoredSave>();
    vi.stubGlobal("indexedDB", indexedDbWith(rows));
    await expect(saveRepository.save("corrupt", "{not json")).rejects.toThrow();
    expect(rows.has("corrupt")).toBe(false);
  });

  it("does not report a browser save when IndexedDB aborts its write", async () => {
    vi.stubGlobal("indexedDB", {
      open() {
        const request: Record<string, unknown> = {};
        queueMicrotask(() => {
          const database = {
            createObjectStore: () => undefined,
            close: () => undefined,
            transaction: () => {
              const transaction: Record<string, unknown> = {};
              transaction["objectStore"] = () => ({ put: () => {
                queueMicrotask(() => {
                  transaction["error"] = new Error("quota exceeded");
                  (transaction["onabort"] as (() => void) | undefined)?.();
                });
                return { result: undefined };
              } });
              return transaction;
            },
          };
          request["result"] = database;
          (request["onsuccess"] as (() => void) | undefined)?.();
        });
        return request;
      },
    } as unknown as IDBFactory);
    const serialized = {
      contents: JSON.stringify({ format: "ahdsolo-save", schemaVersion: 70, savedAt: "2026-10-03T12:00:00.000Z", world: {} }),
      metadata: { savedAt: "2026-10-03T12:00:00.000Z", schemaVersion: 70, turn: 0, countryId: "US", playerName: "Morgan" },
    };
    await expect(saveRepository.save("aborted", serialized)).rejects.toThrow("quota exceeded");
  });
});
