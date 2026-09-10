/**
 * App-level schema 42 projection surface. Implementation is the engine
 * public projector; this module is a re-export so session, CLI, and tests
 * share one writer.
 */
export { projectSaveToV42 } from "@ahdclient/engine";
export type { ProjectSaveToV42Result } from "@ahdclient/engine";
