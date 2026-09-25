import { PINNED_GAME_COLLECTION_POLICY } from "./currentSpCollections.generated.js";
import { SCHEMA_VERSION } from "../world.js";

export type CurrentSpJson = null | boolean | number | string | CurrentSpJson[] | { [key: string]: CurrentSpJson };

export const CURRENT_SP_PROVENANCE = {
  client: { product: "AHDClient", revision: "6c9ee98ce1331c24042bb48628839f6b3997dde4", sourcePath: "apps/desktop/src-tauri/src/desktop.rs" },
  game: { product: "AHDGame", revision: "d4baf899fd8bd529099f03d7410807143604e2e5", sourcePath: "src/lib/admin/seed/seedManifest.ts" },
  native: { product: "AHDNative", schemaVersion: SCHEMA_VERSION, sourcePath: "packages/engine/src/world.ts" },
} as const;
export const CURRENT_SP_LAUNCHER_METADATA_CONTRACT = { provenance: CURRENT_SP_PROVENANCE.client, classification: "metadata-only", fields: ["slot", "name", "preset", "createdAt", "lastPlayedAt", "turn", "character", "setup"] } as const;
export const CURRENT_SP_INTERCHANGE_CONTRACT = { format: "ahd-current-sp-snapshot", version: 1, clientRevision: CURRENT_SP_PROVENANCE.client.revision, gameRevision: CURRENT_SP_PROVENANCE.game.revision, nativeSchemaVersion: CURRENT_SP_PROVENANCE.native.schemaVersion, directions: { gameToNative: "contract-only", nativeToGame: "contract-only" } } as const;
export type CurrentSpMappingStatus = "mapping-required" | "exclude" | "missing";
export interface CurrentSpCollectionPolicy { name: string; status: CurrentSpMappingStatus; sourcePath: string; target: string | null; reason: string }
const GAME_SOURCE = `${CURRENT_SP_PROVENANCE.game.sourcePath}@${CURRENT_SP_PROVENANCE.game.revision}`;
export type CurrentSpKnownCollectionName = typeof PINNED_GAME_COLLECTION_POLICY[number]["name"];
export type CurrentSpMappedCollectionName = Extract<typeof PINNED_GAME_COLLECTION_POLICY[number], { status: "mapping-required" }>["name"];
export type CurrentSpExcludedCollectionName = Extract<typeof PINNED_GAME_COLLECTION_POLICY[number], { status: "exclude" }>["name"];
/** Exhaustive classification of every collection in the pinned seed manifest. */
export const CURRENT_SP_COLLECTION_POLICY: readonly CurrentSpCollectionPolicy[] = PINNED_GAME_COLLECTION_POLICY.map((row) => ({ ...row, sourcePath: GAME_SOURCE, reason: row.status === "mapping-required" ? "Requires an explicit field adapter and continuation proof." : row.status === "exclude" ? "Host state is outside the snapshot." : "Known Game collection has no Native mapping and must be rejected." }));
const POLICY = new Map(CURRENT_SP_COLLECTION_POLICY.map((row) => [row.name,row]));
const SHA = /^[a-f0-9]{64}$/;
export interface CurrentSpCollectionManifestEntry { name: CurrentSpMappedCollectionName; documentCount: number; declaredSha256: string }
export interface CurrentSpSnapshot { format: "ahd-current-sp-snapshot"; version: 1; source: { product: "AHDGame"; revision: typeof CURRENT_SP_PROVENANCE.game.revision; sourcePath: typeof CURRENT_SP_PROVENANCE.game.sourcePath }; declaredRulesetSha256: string; declaredContentSha256: string; manifest: CurrentSpCollectionManifestEntry[]; collections: Partial<Record<CurrentSpMappedCollectionName, CurrentSpJson[]>> }
export interface ParsedCurrentSpSnapshot { snapshot: CurrentSpSnapshot; transferStatus: "contract-only" }
function obj(value: unknown,path:string): Record<string,unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`); return value as Record<string,unknown>; }
function exact(value:Record<string,unknown>,fields:readonly string[],path:string) { const extra=Object.keys(value).filter(k=>!fields.includes(k)); const missing=fields.filter(k=>!(k in value)); if(extra.length||missing.length) throw new Error(`${path}: exact fields required; unknown=${extra.join(",")} missing=${missing.join(",")}`); }
function hash(value:unknown,path:string):string { if(typeof value!=="string"||!SHA.test(value)) throw new Error(`${path}: expected lowercase 64-hex SHA-256`); return value; }
function json(value:unknown,path:string):asserts value is CurrentSpJson { if(value===null||typeof value==="string"||typeof value==="boolean"||(typeof value==="number"&&Number.isFinite(value))) return; if(Array.isArray(value)){value.forEach((v,i)=>json(v,`${path}.${i}`));return;} if(value&&typeof value==="object"){Object.entries(value).forEach(([k,v])=>json(v,`${path}.${k}`));return;} throw new Error(`${path}: expected finite JSON`); }
export function parseCurrentSpSnapshot(input:unknown):ParsedCurrentSpSnapshot {
  const root=obj(input,"$snapshot"); exact(root,["format","version","source","declaredRulesetSha256","declaredContentSha256","manifest","collections"],"$snapshot");
  if(root.format!==CURRENT_SP_INTERCHANGE_CONTRACT.format||root.version!==1) throw new Error("Unsupported current SP snapshot format or version");
  const source=obj(root.source,"source"); exact(source,["product","revision","sourcePath"],"source");
  if(source.product!=="AHDGame"||source.revision!==CURRENT_SP_PROVENANCE.game.revision||source.sourcePath!==CURRENT_SP_PROVENANCE.game.sourcePath) throw new Error("Unsupported current SP source provenance");
  if(!Array.isArray(root.manifest)) throw new Error("manifest: expected array"); const collections=obj(root.collections,"collections"); const seen=new Set<string>(); const manifest:CurrentSpCollectionManifestEntry[]=[];
  for(const [i,raw] of root.manifest.entries()){const row=obj(raw,`manifest.${i}`);exact(row,["name","documentCount","declaredSha256"],`manifest.${i}`);if(typeof row.name!=="string"||!Number.isSafeInteger(row.documentCount)||(row.documentCount as number)<0)throw new Error(`manifest.${i}: invalid entry`);if(seen.has(row.name))throw new Error(`manifest.${i}: duplicate collection ${row.name}`);seen.add(row.name);const policy=POLICY.get(row.name);if(!policy)throw new Error(`manifest.${i}: unknown collection ${row.name}`);if(policy.status!=="mapping-required")throw new Error(`manifest.${i}: ${policy.status} collection ${row.name}`);const docs=collections[row.name];if(!Array.isArray(docs)||docs.length!==row.documentCount)throw new Error(`collections.${row.name}: manifest count mismatch`);docs.forEach((d,n)=>json(d,`collections.${row.name}.${n}`));manifest.push({name:row.name as CurrentSpMappedCollectionName,documentCount:row.documentCount as number,declaredSha256:hash(row.declaredSha256,`manifest.${i}.declaredSha256`)});}
  const undeclared=Object.keys(collections).filter(name=>!seen.has(name));if(undeclared.length)throw new Error(`collections: payload absent from manifest: ${undeclared.join(",")}`);
  const snapshot:CurrentSpSnapshot={format:"ahd-current-sp-snapshot",version:1,source:{product:"AHDGame",revision:CURRENT_SP_PROVENANCE.game.revision,sourcePath:CURRENT_SP_PROVENANCE.game.sourcePath},declaredRulesetSha256:hash(root.declaredRulesetSha256,"declaredRulesetSha256"),declaredContentSha256:hash(root.declaredContentSha256,"declaredContentSha256"),manifest,collections:Object.fromEntries(manifest.map(row=>[row.name,collections[row.name] as CurrentSpJson[]]))};return {snapshot,transferStatus:"contract-only"};
}

/** Verify the document bytes represented by each declared collection digest.
 * The source exporter must hash JSON.stringify(docs) before emitting the
 * snapshot; array and object-key order are part of that exact contract.
 */
export function verifyCurrentSpCollectionHashes(
  snapshot: CurrentSpSnapshot,
  sha256: (contents: string) => string,
): true {
  for (const row of snapshot.manifest) {
    const docs = snapshot.collections[row.name];
    if (!docs || sha256(JSON.stringify(docs)) !== row.declaredSha256) {
      throw new Error(`Collection ${row.name} digest mismatch`);
    }
  }
  return true;
}
