/**
 * Central bank turn phases — W3 + issue #119.
 *
 * Four phases, mirroring mainline's relative order (turnPhaseNames.ts:
 * centralBankChairTurn (116) → fomcMeetings → fomcNominations →
 * centralBankChairSelection (121); nppMonetaryOperations and
 * centralBankChairExecutiveRemoval in between remain unported):
 *
 *  1. centralBankChairTurnPhase — scrutiny/credibility update, then the
 *     autonomous Taylor-rule rate move (src/lib/turn/centralBankChairTurn.ts +
 *     src/lib/nppAutonomy/nppChairAutoRate.ts processNppChairAutoRate). Every
 *     solo bank runs the "npp" branch: there is no character chair to run the
 *     NPI-bonus/action-debit side of centralBankChairTurn.ts against (no
 *     character/politician-influence system backs central bank chairs in
 *     solo), so that half of the mainline phase has no solo counterpart —
 *     not stubbed, just structurally inapplicable while chairMode is always
 *     "npp" (mainline's own code skips it identically for npp chairs).
 *     Issue #119: when a bank carries a FUNCTIONAL FOMC board, the committee
 *     owns the rate and this phase skips the single-chair auto-setter — the
 *     same gate mainline applies (boardCanCarryMotions).
 *
 *  2. fomcMeetingsPhase — the FOMC committee meeting/term/vacancy lifecycle
 *     (src/lib/turn/fomcMeetingTurn.ts processFomcMeetings +
 *     src/lib/monetaryGovernance/rules/machine.ts). See
 *     centralBank/fomcMeeting.ts.
 *
 *  3. fomcNominationsPhase — FOMC seat confirmations, a Senate-confirmation
 *     lifecycle (src/lib/fomcNominationLifecycle.ts). See
 *     centralBank/fomcNominationLifecycle.ts.
 *
 *  4. centralBankChairSelectionPhase — term-expiry rotation for SINGLE-CHAIR
 *     banks (skipped for committee banks, whose chair seat the FOMC machinery
 *     owns). Mirrors the mainline `appointNppChair` fallback branch
 *     (src/lib/turn/centralBankChairSelection.ts), taken whenever a term
 *     expires and no candidate is nominated. Solo has no character-chair-
 *     candidate pool, so this always takes that branch. Alignment flips
 *     hawk<->dove each rotation (oppositeAlignment), scrutiny partially carries
 *     over (CHAIR_CHANGE_SCRUTINY_RETAINED) — same as a mainline chair
 *     replacement. W24 adds attribution: `chairAppointedBy` records the
 *     sitting president (if any) at the rotation.
 *
 * The FOMC phases are strict no-ops for a bank without an `fomcBoard`, so every
 * existing world/golden is unaffected. Registered at the END of the phase list
 * (registry.ts), just before newsMaintenancePhase, per the same
 * rng-stream-stability rule the elections and demographics blocks already
 * follow there.
 */

import type { TurnPhase } from "../phases/types.js";
import {
  CENTRAL_BANK_COUNTRY_ANCHORS,
  CHAIR_CHANGE_SCRUTINY_RETAINED,
  CHAIR_TERM_TURNS,
  INFAMY_DECAY,
  RATE_CHANGE_COOLDOWN_TURNS,
  capScrutinyGain,
  computeNppChairRateStep,
  computeNppChairRateTarget,
  computeScrutinyDelta,
  oppositeAlignment,
  resolveRecoveryDelta,
  snapToPrimeRateGrid,
  stanceIsCorrect,
} from "./constants.js";
import { boardCanCarryMotions } from "./fomc.js";
import { processFomcMeetings } from "./fomcMeeting.js";
import { processFomcNominationLifecycle } from "./fomcNominationLifecycle.js";

const INTEREST_RATE_HISTORY_MAX = 48; // Source: db/types/centralBank.ts interestRateHistory cap comment.

function clamp01to100(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export const centralBankChairTurnPhase: TurnPhase = {
  name: "centralBankChairTurn",
  run(world) {
    for (const bank of Object.values(world.centralBanks)) {
      const country = world.countries[bank.countryId];
      if (!country) continue;
      const anchor = CENTRAL_BANK_COUNTRY_ANCHORS[bank.countryId];
      const targetInflation = anchor?.targetInflation ?? 2.0; // Source: centralBankChairTurn.ts TARGET_INFLATION fallback.
      const inflationRatePct = country.economy.inflationRate * 100;
      const gdpGrowthPct = country.economy.growthRate * 100;
      const currentInfamy = clamp01to100(bank.chairInfamy);

      // ── Scrutiny/credibility ──────────────────────────────────────
      const rawDelta = computeScrutinyDelta(inflationRatePct, gdpGrowthPct, currentInfamy, targetInflation);
      const totalDelta = capScrutinyGain(rawDelta);

      const correctStance = stanceIsCorrect(bank.primeRate, inflationRatePct, targetInflation);
      const resolve = resolveRecoveryDelta({ correctStance, previousStreak: bank.resolveStreak });

      const decayedInfamy = currentInfamy * INFAMY_DECAY;
      bank.chairInfamy = clamp01to100(decayedInfamy + totalDelta - resolve.relief);
      bank.resolveStreak = resolve.resolveStreak;

      // ── Autonomous rate setting (chairMode is always "npp" in solo) ─
      // Issue #119: a functional FOMC committee owns the rate. Skip the
      // single-chair autonomous setter to avoid two systems moving primeRate on
      // the same turn — the exact gate mainline's centralBankChairTurn.ts applies
      // when `boardCanCarryMotions(bank.fomcBoard)`. When the board has decayed
      // below the carry-a-motion threshold no motion can ever pass, so the
      // autonomous chair holds the rate directly until nominations restore it.
      const committeeOwnsRate =
        bank.fomcBoard != null && bank.fomcBoard.length > 0 && boardCanCarryMotions(bank.fomcBoard);
      const cooldownActive =
        bank.lastRateChangeTurn !== null && world.meta.turn - bank.lastRateChangeTurn < RATE_CHANGE_COOLDOWN_TURNS;
      if (!committeeOwnsRate && !cooldownActive && anchor) {
        const targetRate = computeNppChairRateTarget({
          neutralRate: anchor.neutralPrimeRate,
          inflationRate: inflationRatePct,
          targetInflation,
          gdpGrowth: gdpGrowthPct,
          alignment: bank.chairAlignment,
        });
        const step = computeNppChairRateStep({
          currentRate: bank.primeRate,
          targetRate,
          alignment: bank.chairAlignment,
        });
        if (Math.abs(step) > 1e-9) {
          const newRate = snapToPrimeRateGrid(bank.primeRate + step);
          if (newRate !== bank.primeRate) {
            bank.primeRate = newRate;
            bank.lastRateChangeTurn = world.meta.turn;
          }
        }
      }

      bank.interestRateHistory.push({ turn: world.meta.turn, rate: bank.primeRate });
      if (bank.interestRateHistory.length > INTEREST_RATE_HISTORY_MAX) bank.interestRateHistory.shift();
    }
  },
};

export const centralBankChairSelectionPhase: TurnPhase = {
  name: "centralBankChairSelection",
  run(world) {
    for (const bank of Object.values(world.centralBanks)) {
      // Issue #119: a bank carrying an FOMC board has its chair seat owned by the
      // committee machinery (centralBank/fomcMeeting.ts + fomcNominationLifecycle.ts),
      // so the single-chair rotation must not run over it — otherwise a vacated
      // committee chair seat would be silently restocked here, exactly the
      // "endless appointment" mainline's installConfirmedSeat guards against.
      if (bank.fomcBoard != null && bank.fomcBoard.length > 0) continue;
      const term = bank.chairTermExpiresAtTurn;
      if (term !== null && world.meta.turn < term) continue;
      // Term expired. No character-chair-candidate pool exists in solo, so
      // this always takes appointNppChair's fallback branch: rotate the
      // technocrat, flip temperament, carry over most of the institution's
      // scrutiny. W24: attribute the rotation to the sitting president (if
      // any) — see centralBank/types.ts file doc for why this is attribution
      // only and does not change chair selection.
      bank.chairAlignment = bank.chairAlignment ? oppositeAlignment(bank.chairAlignment) : "hawk";
      bank.chairInfamy = clamp01to100(bank.chairInfamy * CHAIR_CHANGE_SCRUTINY_RETAINED);
      bank.resolveStreak = 0;
      bank.chairTermExpiresAtTurn = world.meta.turn + CHAIR_TERM_TURNS;
      bank.chairAppointedBy = world.executives[bank.countryId]?.presidentId ?? null;
    }
  },
};

/**
 * Issue #119: FOMC committee rate-setting/meeting lifecycle (mainline
 * src/lib/turn/fomcMeetingTurn.ts processFomcMeetings). Registered between
 * centralBankChairTurn and centralBankChairSelection, mirroring mainline
 * turnPhaseNames.ts (116 centralBankChairTurn → fomcMeetings → fomcNominations
 * → … → 121 centralBankChairSelection). Strict no-op for every bank without an
 * `fomcBoard` (legacy single-chair banks are untouched).
 */
export const fomcMeetingsPhase: TurnPhase = {
  name: "fomcMeetings",
  run(world) {
    processFomcMeetings(world);
  },
};

/**
 * Issue #119: FOMC seat confirmations — a like-shaped Senate-confirmation
 * lifecycle, run in the same relative slot as mainline's `fomcNominations`
 * phase (turnPhaseNames.ts index 122). NPP senators vote on active nominations
 * and expired ones resolve into confirmed/rejected seats. Strict no-op when
 * there are no active/expired nominations.
 */
export const fomcNominationsPhase: TurnPhase = {
  name: "fomcNominations",
  run(world) {
    processFomcNominationLifecycle(world);
  },
};
