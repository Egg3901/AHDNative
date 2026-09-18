/**
 * Issue #41 phase map: AHDGame `intelligenceTurn` / `navairOperations`.
 *
 * Reference (AHDGame e364c0495): `turnPhaseNames.ts:104-105` registers
 * `intelligenceTurn` then `navairOperations` immediately before
 * `ministerialOrders`, with the comment that sea control, air superiority,
 * supply, and intelligence upkeep must be current before a battle reads
 * them. `stateEffectsPhase.ts` runs `processIntelligenceTurn` from
 * `src/lib/turn/intelligenceTurn.ts`; naval/air state lives in
 * `src/lib/navair` plus the `navairEngagements`/`navairChannels`
 * collections.
 *
 * Native verdict: MISSING, not combined. No registered `TURN_PHASES` entry
 * carries either name, and no entry under another name performs that work:
 * nothing reads `src/lib/navair`-equivalent state (Native persists none),
 * nothing runs intelligence upkeep/sabotage over dispositions, and the only
 * Native mentions of `navairOperations` are ordering comments citing the
 * reference serialization. Defense ministerial orders (e.g.
 * `defense_modernization`) are readiness/public-safety orders, not naval/air
 * support or intel ops. Per the issue, no `battle.ts` port starts here.
 */
import { describe, expect, it } from "vitest";
import { TURN_PHASES } from "../phases/registry.js";

describe("war phase map (#41)", () => {
  it("registers warsTurn but neither intelligenceTurn nor navairOperations", () => {
    const names = TURN_PHASES.map((phase) => phase.name);
    expect(names).toContain("warsTurn");
    expect(names).not.toContain("intelligenceTurn");
    expect(names).not.toContain("navairOperations");
  });

  it("combines neither phase under another name", () => {
    const combined = TURN_PHASES.filter((phase) =>
      /intell|navair|naval/i.test(phase.name),
    );
    expect(combined).toEqual([]);
  });
});
