import type { TurnPhase } from "../phases/types.js";
import { processScotusTurn } from "./scotusTurn.js";
import { processUkJrSurpriseTurn } from "./ukJrSurpriseTurn.js";
import { processEraCheckpointsTurn } from "../demographics/eraCheckpoints.js";

export const scotusTurnPhase: TurnPhase = {
  name: "scotusTurn",
  run(world) {
    processScotusTurn(world);
  },
};

// Game applies historical electorate checkpoints in demographicEffects after
// SCOTUS has written docket decisions and after the current election tally.
// Native's SCOTUS cluster is at the tail; this RNG-free consumer runs after it
// and therefore affects the next election, never a same-turn vote retroactively.
export const eraCheckpointsPhase: TurnPhase = {
  name: "eraCheckpoints",
  run(world) {
    processEraCheckpointsTurn(world);
  },
};

export const ukJrSurpriseTurnPhase: TurnPhase = {
  name: "ukJrSurpriseTurn",
  run(world) {
    processUkJrSurpriseTurn(world);
  },
};
