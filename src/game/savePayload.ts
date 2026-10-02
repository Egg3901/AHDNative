/** Browser-local saves are compressed to fit IndexedDB's per-value limit. */
export interface GzipSavePayload {
  encoding: "gzip";
  bytes: Uint8Array;
}

export type SavePayload = GzipSavePayload | string;

export async function encodeSavePayload(contents: string): Promise<GzipSavePayload> {
  const stream = new Blob([contents]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return { encoding: "gzip", bytes };
}

export async function decodeSavePayload(payload: SavePayload): Promise<string> {
  if (typeof payload === "string") return payload;
  if (!payload || payload.encoding !== "gzip" || !(payload.bytes instanceof Uint8Array)) {
    throw new Error("This saved game has an unsupported browser storage format.");
  }
  // Copy into an owned ArrayBuffer: IndexedDB's Uint8Array type is backed by
  // ArrayBufferLike in modern TypeScript, while BlobPart requires ArrayBuffer.
  const bytes = new Uint8Array(payload.bytes.byteLength);
  bytes.set(payload.bytes);
  const stream = new Blob([bytes.buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
