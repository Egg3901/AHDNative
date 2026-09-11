import type { TurnPhase } from "../phases/types.js";
import { runElectionResolution, runElectionTimers, runVoteAccumulation } from "./orchestration.js";
import { resolvePrimaries } from "./primaryResolution.js";

/**
 * Live election phases (W21c). Relative order mirrors mainline turnPhaseNames:
 * voteAccumulation before electionTimers before electionResolution.
 */

export const voteAccumulationPhase: TurnPhase = {
  name: "voteAccumulation",
  run(world, rng) {
    runVoteAccumulation(world, rng);
  },
};

export const primaryResolutionPhase: TurnPhase = {
  name: "primaryResolution",
  run(world) {
    resolvePrimaries(world);
  },
};

export const electionTimersPhase: TurnPhase = {
  name: "electionTimers",
  run(world, rng) {
    runElectionTimers(world, rng);
  },
};

export const electionResolutionPhase: TurnPhase = {
  name: "electionResolution",
  run(world) {
    runElectionResolution(world);
  },
};
