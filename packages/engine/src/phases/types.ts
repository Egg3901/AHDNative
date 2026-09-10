import type { WorldRng } from "../rng.js";
import type { WorldState } from "../types.js";

/** Mainline Character inputs are a bootstrap snapshot, separate from live writes. */
export interface TurnContext {
  playerAtTurnStart: Readonly<WorldState["player"]>;
}

/**
 * A turn phase is a pure-ish function: it may mutate the passed world (the
 * engine owns the only reference during a turn) and draw from the turn rng,
 * and nothing else. No IO, no clocks, no Math.random. This is the porting
 * contract for bringing systems over from mainline's turnPhaseRegistry.
 */
export interface TurnPhase {
  name: string;
  run(world: WorldState, rng: WorldRng, context?: TurnContext): void;
}

export interface PhaseTiming {
  name: string;
  ms: number;
}

export interface TurnReport {
  turn: number;
  date: string;
  phaseTimings: PhaseTiming[];
}
