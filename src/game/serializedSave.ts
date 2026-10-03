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
