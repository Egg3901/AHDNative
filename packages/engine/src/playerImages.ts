/**
 * Shared offline portrait/header raster guard (#242).
 *
 * The single source of truth for "a creatable/loadable player image": a local
 * raster data URL (PNG, JPEG, or WebP), never a remote fetch, with a byte cap
 * from the reference upload contract (AHDGame `useImagePick`: portrait 2 MB,
 * header 4 MB). Both `createWorld` and the save loader check through here so
 * creation and reload agree exactly: anything accepted at creation reloads.
 * (The save loader enforces the same envelope as its backstop.)
 */
export const MAX_PLAYER_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_PLAYER_HEADER_BYTES = 4 * 1024 * 1024;

export function isPlayerImageUrl(value: unknown, maxBytes: number): boolean {
  if (typeof value !== "string" || value.length > Math.ceil(maxBytes / 3) * 4 + 32) return false;
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
