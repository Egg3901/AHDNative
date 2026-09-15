/**
 * Contract boundary for current AHDClient single-player worlds.
 *
 * AHDClient world.json is launcher metadata. AHDGame stores the durable world
 * in MongoDB under the world home. Neither artifact is a Native save, and host
 * files must never be accepted as an interchange payload. This slice records
 * the boundary only; both directions deliberately fail closed until adapters
 * implement and verify a named inventory slice.
 */
export const CURRENT_SP_INTERCHANGE_CONTRACT = {
  format: "ahd-current-sp-snapshot",
  version: 1,
  clientRevision: "6c9ee98ce1331c24042bb48628839f6b3997dde4",
  gameRevision: "d4baf899fd8bd529099f03d7410807143604e2e5",
  nativeSchemaVersion: 44,
  directions: {
    gameToNative: "contract-only",
    nativeToGame: "contract-only",
  },
} as const;

export type CurrentSpInventoryDisposition =
  | "metadata-only"
  | "mapping-required"
  | "reject"
  | "exclude";

export interface CurrentSpInventoryRow {
  id: string;
  disposition: CurrentSpInventoryDisposition;
  source: string;
  contents: readonly string[];
  reason: string;
}

export const CURRENT_SP_STATE_INVENTORY: readonly CurrentSpInventoryRow[] = [
  { id: "launcher.worldMeta", disposition: "metadata-only", source: "AHDClient apps/desktop/src-tauri/src/desktop.rs WorldMeta", contents: ["slot", "name", "preset", "timestamps", "turn", "character", "setup"], reason: "Launcher discovery metadata is not simulated world state." },
  { id: "game.mongo.gameplay", disposition: "mapping-required", source: "AHDGame Mongo collections and GameState", contents: ["world clock", "countries", "economy", "politics", "elections", "legislation", "events"], reason: "Durable gameplay state needs collection-specific mapping and continuation evidence." },
  { id: "game.mongo.identity", disposition: "mapping-required", source: "AHDGame characters, parties, electedOfficials, and office collections", contents: ["characters", "parties", "offices", "relationships"], reason: "Database identifiers and references require a portable identity map." },
  { id: "game.mongo.history", disposition: "mapping-required", source: "AHDGame history and ledger collections", contents: ["turn history", "news", "ledgers", "resolved records"], reason: "Continuation may depend on history and cannot silently discard it." },
  { id: "game.mongo.unknownCollections", disposition: "reject", source: "AHDGame world Mongo database", contents: ["collection names absent from the snapshot manifest"], reason: "Schema evolution must be reviewed instead of silently omitted." },
  { id: "host.mongoRuntime", disposition: "exclude", source: "AHDGame single-player world home", contents: ["dbpath files", "locks", "journals", "WiredTiger files"], reason: "Host-specific database runtime files are not a portable snapshot." },
  { id: "host.authentication", disposition: "exclude", source: "AHDGame and AHDClient host state", contents: ["users", "sessions", "linked accounts"], reason: "Authentication state is outside the game snapshot." },
  { id: "host.secrets", disposition: "exclude", source: "AHDGame and AHDClient host state", contents: ["environment", "tokens", "keys", "cookies"], reason: "Secrets must never enter an exported game snapshot." },
] as const;

export function parseCurrentSpSnapshot(input: unknown): never {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (input as { format?: unknown }).format !== CURRENT_SP_INTERCHANGE_CONTRACT.format) {
    throw new Error("Unsupported current SP snapshot format");
  }
  throw new Error("Current SP save interchange is contract-only; no transfer direction is implemented");
}
