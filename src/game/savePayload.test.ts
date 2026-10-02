import { describe, expect, it } from "vitest";
import { decodeSavePayload, encodeSavePayload } from "./savePayload";

describe("browser save payload", () => {
  it("compresses large JSON and restores its exact bytes", async () => {
    const contents = JSON.stringify({ rows: Array.from({ length: 25_000 }, (_, turn) => ({ turn, trend: [0.2, 0.4, 0.6] })) });
    const encoded = await encodeSavePayload(contents);

    expect(encoded.encoding).toBe("gzip");
    if (encoded.encoding !== "gzip") throw new Error("Expected a gzip payload");
    expect(encoded.bytes.byteLength).toBeLessThan(contents.length / 4);
    await expect(decodeSavePayload(encoded)).resolves.toBe(contents);
  });

  it("reads existing uncompressed IndexedDB saves", async () => {
    const contents = '{"format":"ahdsolo-save","schemaVersion":58}';
    await expect(decodeSavePayload(contents)).resolves.toBe(contents);
  });
});
