import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { deserializeSave, projectSaveToV42, serializeSave } from "../save.js";
import type { WorldState } from "../types.js";

const SAVED_AT = "2026-10-04T00:00:00.000Z";

/**
 * Isolate an old-reader consumer using actual retained pre-control writer
 * bytes. The caller first produces the feature through its real public flow,
 * then transfers those records intact. This is a recorded consumer fixture,
 * not a claim that the older writer could produce the modern feature.
 */
export function projectHistoricalConsumer(produced: WorldState, fields: readonly (keyof WorldState)[]) {
  const historical = deserializeSave(gunzipSync(readFileSync(new URL(
    "../../../../fixtures/native-fresh-pre-ceo-source.save.json.gz", import.meta.url,
  ))).toString("utf8"));
  const baseline = projectSaveToV42(serializeSave(historical, SAVED_AT));
  if (!baseline.ok) throw new Error(`Historical writer must be projectable before adding the consumer: ${baseline.error}`);
  Object.assign(historical, Object.fromEntries(fields.map((field) => [field, structuredClone(produced[field])])));
  return projectSaveToV42(serializeSave(historical, SAVED_AT));
}
