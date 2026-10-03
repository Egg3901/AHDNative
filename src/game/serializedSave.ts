import { encodeSavePayload, type GzipSavePayload } from "./savePayload";

/** Metadata derived from the same in-memory world used to serialize the save. */
export interface SerializedSaveMetadata {
  savedAt: string;
  schemaVersion: number;
  turn: number;
  countryId: string;
  playerName: string;
}

/** The raw v2 save bytes stay unchanged; metadata avoids parsing them in the UI. */
export interface SerializedSave {
  contents: string;
  metadata: SerializedSaveMetadata;
}

/** Browser saves cross the worker boundary as the compressed storage payload. */
export interface EncodedSerializedSave {
  contents: GzipSavePayload;
  metadata: SerializedSaveMetadata;
}

export async function encodeSerializedSave(save: SerializedSave): Promise<EncodedSerializedSave> {
  return { contents: await encodeSavePayload(save.contents), metadata: save.metadata };
}
