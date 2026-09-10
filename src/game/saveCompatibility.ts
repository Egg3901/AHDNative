import { deserializeSave, serializeSave } from "@ahdclient/engine";

const SAVE_FORMAT = "ahdsolo-save";
const V42_SCHEMA = 42;
const V43_SCHEMA = 43;

export type ProjectSaveToV42Result =
  | { ok: true; contents: string }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseEnvelope(contents: string):
  | { ok: true; save: Record<string, unknown>; world: Record<string, unknown>; meta: Record<string, unknown>; player: Record<string, unknown> }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { ok: false, error: "Not a valid save file: unparseable JSON" };
  }
  if (!isRecord(parsed) || parsed["format"] !== SAVE_FORMAT) {
    return { ok: false, error: "Not a valid save file: wrong format marker" };
  }
  if (!isRecord(parsed["world"]) || !isRecord(parsed["world"]["meta"]) || !isRecord(parsed["world"]["player"])) {
    return { ok: false, error: "Not a valid save file: invalid world state" };
  }
  return {
    ok: true,
    save: parsed,
    world: parsed["world"],
    meta: parsed["world"]["meta"],
    player: parsed["world"]["player"],
  };
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Project a public serializeSave envelope to authentic schema 42.
 *
 * Only the reverse of the v42 to v43 migration is supported: drop
 * world.countryPolitics and a null player.homeRegionId, then stamp schema 42,
 * when Native deserializeSave of that document restores the original schema 43
 * bytes. Native-fresh home regions and live countryPolitics gauges fail closed.
 * This is not a schema-number rewrite of an arbitrary v43 save.
 */
export function projectSaveToV42(contents: string): ProjectSaveToV42Result {
  if (typeof contents !== "string" || contents.length === 0) {
    return { ok: false, error: "Not a valid save file: empty document" };
  }
  const parsed = parseEnvelope(contents);
  if (!parsed.ok) return parsed;
  const { save, world, meta, player } = parsed;
  const envelopeSchema = save["schemaVersion"];
  const metaSchema = meta["schemaVersion"];
  if (envelopeSchema === V42_SCHEMA && metaSchema === V42_SCHEMA) {
    if (hasOwn(world, "countryPolitics") || hasOwn(player, "homeRegionId")) {
      return {
        ok: false,
        error:
          "This schema 42 document still carries v43 fields (countryPolitics or homeRegionId); it is not an authentic schema 42 save",
      };
    }
    try { deserializeSave(contents); } catch (error) {
      return { ok: false, error: `Schema 42 save is not loadable: ${errorMessage(error)}` };
    }
    return { ok: true, contents };
  }
  if (envelopeSchema !== V43_SCHEMA || metaSchema !== V43_SCHEMA) {
    return {
      ok: false,
      error: `Save schema ${String(envelopeSchema)} cannot be projected to schema 42 without a Native load of a schema 43 document`,
    };
  }
  const savedAt = save["savedAt"];
  if (typeof savedAt !== "string" || savedAt.length === 0) {
    return { ok: false, error: "Not a valid save file: missing savedAt" };
  }
  const homeRegionId = player["homeRegionId"];
  if (typeof homeRegionId === "string") {
    return {
      ok: false,
      error: `player.homeRegionId is set to ${homeRegionId}. Schema 42 has no home-region identity; exporting would drop it. Keep this save as schema 43`,
    };
  }
  if (homeRegionId !== null && homeRegionId !== undefined) {
    return {
      ok: false,
      error: "player.homeRegionId is not a nullable string. Schema 42 cannot store that identity",
    };
  }
  if (!hasOwn(world, "countryPolitics")) {
    return {
      ok: false,
      error: "Schema 43 save is missing countryPolitics, so a reversible schema 42 projection cannot be proven",
    };
  }

  const candidateSave = structuredClone(save);
  const candidateWorld = candidateSave["world"] as Record<string, unknown>;
  const candidateMeta = candidateWorld["meta"] as Record<string, unknown>;
  const candidatePlayer = candidateWorld["player"] as Record<string, unknown>;
  candidateSave["schemaVersion"] = V42_SCHEMA;
  candidateMeta["schemaVersion"] = V42_SCHEMA;
  delete candidateWorld["countryPolitics"];
  delete candidatePlayer["homeRegionId"];
  const candidate = JSON.stringify(candidateSave);

  let restored: string;
  try {
    restored = serializeSave(deserializeSave(candidate), savedAt);
  } catch (error) {
    return {
      ok: false,
      error: `Schema 42 projection is not loadable: ${errorMessage(error)}`,
    };
  }
  if (restored === contents) {
    return { ok: true, contents: candidate };
  }

  let restoredPolitics: unknown;
  let originalPolitics: unknown;
  try {
    originalPolitics = world["countryPolitics"];
    restoredPolitics = (JSON.parse(restored) as { world?: { countryPolitics?: unknown } }).world?.countryPolitics;
  } catch {
    restoredPolitics = undefined;
  }
  if (JSON.stringify(originalPolitics) !== JSON.stringify(restoredPolitics)) {
    return {
      ok: false,
      error:
        "countryPolitics live gauges are not reconstructable from schema 42. Exporting would drop national approval, legitimacy, unrest, or approval history. Keep this save as schema 43",
    };
  }
  return {
    ok: false,
    error:
      "Schema 42 projection is not reversible: Native reload does not restore the original schema 43 document",
  };
}
