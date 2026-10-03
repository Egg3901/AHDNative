import { TURN_PHASES } from "./phases/registry.js";
import type { TurnReport } from "./phases/types.js";
import { rngFromState, type RngState } from "./rng.js";
import type { WorldState } from "./types.js";
import { isTurnPhaseEnabled } from "./featureFlags.js";

/**
 * Advance the world by one turn, in place. Deterministic: rng state is read
 * from and written back to world.meta, so save/load mid-campaign does not
 * change outcomes.
 */
export interface AdvanceTurnOptions {
  /** Adapter-provided monotonic clock for profiling. Omit for deterministic reports. */
  now?: () => number;
  /** Diagnostic observer, outside phase timing. Must not mutate the live world. */
  afterPhase?: (
    name: string,
    world: Readonly<WorldState>,
    rng: Readonly<RngState>,
  ) => void;
  /** Optional ephemeral pure-tally input observer; absent in ordinary play. */
  observeElectionTallyInput?: (snapshot: unknown) => void;
  /** Explicit source wall-clock seam; omitted pure turns do not invent activity time. */
  activityTimestampMs?: number;
}

export function advanceTurn(
  world: WorldState,
  options: AdvanceTurnOptions = {},
): TurnReport {
  const rng = rngFromState(world.meta.rng);
  const context = {
    playerAtTurnStart: structuredClone(world.player),
    ...(options.observeElectionTallyInput
      ? { observeElectionTallyInput: options.observeElectionTallyInput }
      : {}),
    ...(options.activityTimestampMs !== undefined
      ? { activityTimestampMs: options.activityTimestampMs }
      : {}),
  };
  const phaseTimings = [];
  for (const phase of TURN_PHASES) {
    if (!isTurnPhaseEnabled(world.featureFlags, phase.name)) continue;
    const startedAt = options.now?.();
    phase.run(world, rng, context);
    const ms = startedAt === undefined ? 0 : options.now!() - startedAt;
    phaseTimings.push({ name: phase.name, ms });
    options.afterPhase?.(phase.name, world, rng.state());
  }
  world.meta.rng = rng.state();
  return { turn: world.meta.turn, date: world.meta.date, phaseTimings };
}
