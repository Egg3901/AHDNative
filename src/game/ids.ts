/**
 * Random ids for save slots and fallback world seeds.
 *
 * `crypto.randomUUID` requires a secure context and is missing in some
 * webview configurations (custom URL schemes). New Game and Import must not
 * hard-fail there, so this helper falls back to `getRandomValues`. These IDs do not drive turn randomness.
 */
export function newId(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    try {
      return cryptoRef.randomUUID();
    } catch {
      // Fall through to the manual v4 encoding below.
    }
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
