import type { TurnPhase } from "../phases/types.js";
import { advanceNorthernIrelandLivingConflict } from "./northernIreland.js";

/** Source living-conflict time driver for the supported Northern Ireland process. */
export const northernIrelandLivingConflictPhase: TurnPhase = {
  name: "northernIrelandLivingConflict",
  run(world) {
    advanceNorthernIrelandLivingConflict(world);
  },
};
