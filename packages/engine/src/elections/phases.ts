import type { TurnPhase } from "../phases/types.js";
import { runElectionResolution, runElectionTimers, runVoteAccumulation } from "./orchestration.js";
import { detectFoundingComplete } from "./founding.js";
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

/**
 * Founding-completion detector (#223). Ports mainline's
 * `detectPreIterationComplete` placement (after election resolution +
 * government formation each turn): the flag clears the same turn the last
 * founding race resolves, and the canonical succession spawners — already
 * suppressed for the rest of THIS turn by the still-active flag during
 * resolution — resume with the stamped offset next turn. RNG-free and a
 * no-op without an active founding phase, so existing goldens are
 * unaffected.
 */
export const foundingCompletionPhase: TurnPhase = {
  name: "foundingCompletion",
  run(world) {
    detectFoundingComplete(world);
  },
};
