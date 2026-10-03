import { afterEach, expect, it, vi } from "vitest";
import { GameClient, type WorkerPort } from "./client";
import type { GameRequest, GameResponse } from "./protocol";
import { decodeSavePayload } from "./savePayload";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("transfers a real worker save as compressed bytes with exact raw-save identity", async () => {
  let receive: ((event: MessageEvent<GameRequest>) => Promise<void>) | undefined;
  const listeners: Array<(event: { data?: unknown }) => void> = [];
  const transferredBytes: number[] = [];
  vi.stubGlobal("self", {
    addEventListener(_type: string, listener: (event: MessageEvent<GameRequest>) => Promise<void>) {
      receive = listener;
    },
    postMessage(response: GameResponse, options?: StructuredSerializeOptions) {
      for (const item of options?.transfer ?? []) {
        if (item instanceof ArrayBuffer) transferredBytes.push(item.byteLength);
      }
      const data = structuredClone(response, options);
      for (const listener of listeners) listener({ data });
    },
  });
  await import("./worker");
  const port: WorkerPort = {
    postMessage(message) {
      if (!receive) throw new Error("The actual worker did not install its request handler");
      void receive(new MessageEvent<GameRequest>("message", { data: message as GameRequest }));
    },
    addEventListener(type, listener) { if (type === "message") listeners.push(listener); },
    terminate() {},
  };
  const client = new GameClient(port);
  try {
    await client.create({ seed: "worker-save-transport", era: "1953", countryId: "US", playerName: "Alex" });
    const next = await client.advance();
    const stamp = "2026-10-03T16:00:00.000Z";
    const original = await client.serializeWithMetadata(stamp, true);
    const encoded = await client.serializeForStorage(stamp, true);
    expect(encoded.metadata).toEqual(original.metadata);
    expect(encoded.metadata.turn).toBe(next.turn);
    expect(encoded.contents.encoding).toBe("gzip");
    expect(encoded.contents.bytes.byteLength).toBeLessThan(original.contents.length / 2);
    expect(transferredBytes).toEqual([encoded.contents.bytes.byteLength]);
    expect(await decodeSavePayload(encoded.contents) === original.contents).toBe(true);
  } finally {
    client.dispose();
  }
}, 60_000);
