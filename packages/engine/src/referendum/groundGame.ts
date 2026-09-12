/**
 * Referendum ground-game spend (the `cohortModifiers` writer).
 *
 * Verbatim port of AHDGame's `src/lib/referendum/groundGame.ts`
 * (`spendGroundGame` volunteer path), the preset catalog from
 * `src/lib/constants/groundGamePresets.ts`, and `applyPresetToModifiers.ts`.
 * `cohort.ts:aggregateYesShare` already reads `cohortModifiers` (raw accumulated
 * units, soft-capped via tanh at read time), but nothing wrote them; this is the
 * missing writer.
 *
 * Faithful to the source:
 *  - Preset card fixed costs (Campaign Funds + Actions) and per-cohort effects
 *    (`leanSwing` / `turnoutPush`, concentration factors) are exactly the
 *    source's numbers — no invented balance.
 *  - Whole-electorate persuade spreads a uniform per-cohort lean; targeting
 *    concentrates onto one cohort; mobilize raises a cohort's turnout scaled by
 *    how aligned it is to the spender's side plus a same-side lean nudge.
 *  - Cost is debited before any effect is applied; a failed debit writes nothing.
 *
 * PORT-STUB (deliberately omitted, named per system — do not invent params):
 *  - The source's official (party-officer) mode debits a state-party-org
 *    Political Strength pool through `spendPoliticalStrength`. Native supports
 *    the volunteer path (player Actions + Campaign Funds) per the source route's
 *    default; the officer PS path is not modeled (no per-region PS ledger).
 *  - The source emits a best-effort campaign-wire event; Native's engine has no
 *    wire (matching how lifecycle.ts skips the source's wire writes).
 */
import type { WorldState } from "../types.js";
import type { ReferendumRecord } from "./types.js";
import {
  referendumYesShare,
  type CohortModifier,
  type ReferendumCohort,
} from "./cohort.js";

/** Verbatim from AHDGame `src/lib/constants/referendum.ts` (ground-game tunables). */
export const GG_PERSUADE_TARGET_CONC = 6;
/** Targeting a single cohort concentrates a mobilize card's turnout by this factor. */
export const GG_MOBILIZE_TARGET_CONC = 3;
/** Mobilize also nudges the spender's side's lean by this fraction of its push. */
export const GG_MOBILIZE_LEAN_FRACTION = 0.2;

export type PresetEffect = "mobilize" | "persuade";

export interface GroundGamePreset {
  id: string;
  label: string;
  effect: PresetEffect;
  /** persuade: whole-electorate aggregate pp swing (== the displayed label). */
  leanSwing?: number;
  /** mobilize: turnout units pushed onto a fully-aligned cohort at whole scale. */
  turnoutPush?: number;
  /** Representative whole-electorate pp for the card UI (mobilize varies by base). */
  nominalSwing: number;
  funds: number; // home-currency Campaign Funds (volunteer)
  actions: number; // character.actions (volunteer)
  ps: number; // Political Strength (official)
}

/** Verbatim from AHDGame `src/lib/constants/groundGamePresets.ts`. */
export const GROUND_GAME_PRESETS: GroundGamePreset[] = [
  { id: "press_conference", label: "Press conference", effect: "persuade", leanSwing: 0.5, nominalSwing: 0.5, funds: 40_000, actions: 1, ps: 2 },
  { id: "doorstep_canvass", label: "Doorstep canvass", effect: "mobilize", turnoutPush: 5, nominalSwing: 1.2, funds: 90_000, actions: 1, ps: 3 },
  { id: "gotv_drive", label: "Get-out-the-vote drive", effect: "mobilize", turnoutPush: 8, nominalSwing: 1.9, funds: 220_000, actions: 2, ps: 5 },
  { id: "broadcast_ads", label: "Broadcast & digital ads", effect: "persuade", leanSwing: 1.5, nominalSwing: 1.5, funds: 380_000, actions: 2, ps: 8 },
  { id: "mass_rally", label: "Mass rally", effect: "mobilize", turnoutPush: 13, nominalSwing: 3.1, funds: 620_000, actions: 3, ps: 12 },
];

export function findGroundGamePreset(id: string): GroundGamePreset | undefined {
  return GROUND_GAME_PRESETS.find((preset) => preset.id === id);
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Accumulate a preset's effect onto the cohort modifiers as RAW signed units
 * (the soft cap is applied at read time in `aggregateYesShare`). Whole-electorate
 * persuade adds a uniform per-cohort lean == `leanSwing`, so the aggregate moves
 * by exactly `leanSwing`; targeting concentrates onto one cohort (its aggregate
 * effect is naturally bounded by the cohort's share). Mobilize raises a cohort's
 * turnout scaled by how aligned it is to the spender's side, plus a small
 * same-side lean nudge — so GOTV turns out *your* base and `side` matters.
 * 0-share cohorts are skipped. Pure — returns a new modifier array.
 */
export function applyPresetToModifiers(
  baseline: ReferendumCohort[],
  mods: CohortModifier[],
  preset: GroundGamePreset,
  side: "yes" | "no",
  target: "whole" | { groupId: string },
): CohortModifier[] {
  const next = mods.map((m) => ({ ...m }));
  const dir = side === "yes" ? 1 : -1;
  const bump = (c: ReferendumCohort, conc: number) => {
    let m = next.find((x) => x.groupId === c.groupId);
    if (!m) {
      m = { groupId: c.groupId, turnoutMod: 0, leanMod: 0 };
      next.push(m);
    }
    if (preset.effect === "persuade") {
      m.leanMod += dir * (preset.leanSwing ?? 0) * conc;
    } else {
      const align = clamp(((side === "yes" ? c.yesLean : 100 - c.yesLean) - 50) / 50, 0, 1);
      const push = preset.turnoutPush ?? 0;
      m.turnoutMod += push * conc * align;
      m.leanMod += dir * push * conc * GG_MOBILIZE_LEAN_FRACTION;
    }
  };
  if (target === "whole") {
    for (const c of baseline) if (c.share > 0) bump(c, 1);
  } else {
    const c = baseline.find((x) => x.groupId === target.groupId);
    if (c) bump(c, preset.effect === "persuade" ? GG_PERSUADE_TARGET_CONC : GG_MOBILIZE_TARGET_CONC);
  }
  return next;
}

export interface ReferendumGroundGameParams {
  referendumId?: string | undefined;
  side?: "yes" | "no" | undefined;
  presetId?: string | undefined;
  /** Cohort groupId to concentrate on; undefined/empty = the whole electorate. */
  cohortGroupId?: string | undefined;
}

export type ReferendumGroundGameResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Run one preset ground-game action on a referendum campaign. Debits the
 * player's Actions + Campaign Funds (the source's volunteer cost), accumulates
 * the preset's effect onto `cohortModifiers`, and refreshes the canonical
 * (cohort-aggregate) `yesShare`.
 */
export function spendReferendumGroundGame(
  world: WorldState,
  params: ReferendumGroundGameParams,
): ReferendumGroundGameResult {
  const { referendumId, side, presetId, cohortGroupId } = params;

  if (side !== "yes" && side !== "no") {
    return { ok: false, error: "Choose a valid campaign side." };
  }
  const preset = presetId ? findGroundGamePreset(presetId) : undefined;
  if (!preset) return { ok: false, error: "Unknown campaign action." };

  const record = world.referendums.find((r) => r.id === referendumId);
  if (!record) return { ok: false, error: "Referendum not found." };
  if (record.status !== "campaigning") {
    return { ok: false, error: "No active campaign for this referendum." };
  }
  if (world.player.countryId !== record.countryId) {
    return { ok: false, error: "Only players of this nation may campaign in this referendum." };
  }

  const baseline = record.cohortBaseline ?? [];
  const target: "whole" | { groupId: string } = cohortGroupId
    ? { groupId: cohortGroupId }
    : "whole";
  if (target !== "whole" && !baseline.some((c) => c.groupId === target.groupId)) {
    return { ok: false, error: "Unknown target cohort." };
  }

  // Debit FIRST (the preset's fixed cost) — a failed debit must write no effect.
  if (world.player.actions < preset.actions) {
    return { ok: false, error: "Not enough Actions or Campaign Funds." };
  }
  if (world.player.funds < preset.funds) {
    return { ok: false, error: "Not enough Actions or Campaign Funds." };
  }

  world.player.actions -= preset.actions;
  world.player.funds -= preset.funds;

  const mods = applyPresetToModifiers(baseline, record.cohortModifiers ?? [], preset, side, target);

  // Audit ledger (mirrors the source's groundGameUnits): attribute a
  // whole-electorate push to the synthetic `_whole` row.
  const ledgerGroupId = target === "whole" ? "_whole" : target.groupId;
  const ledger = record.groundGameUnits ?? [];
  const existing = ledger.find((g) => g.groupId === ledgerGroupId);
  const nextRow = existing ?? { groupId: ledgerGroupId, mobilizeUnits: 0, persuadeYes: 0, persuadeNo: 0 };
  const updatedRow =
    preset.effect === "mobilize"
      ? { ...nextRow, mobilizeUnits: nextRow.mobilizeUnits + (preset.turnoutPush ?? 0) }
      : side === "yes"
        ? { ...nextRow, persuadeYes: nextRow.persuadeYes + (preset.leanSwing ?? 0) }
        : { ...nextRow, persuadeNo: nextRow.persuadeNo + (preset.leanSwing ?? 0) };
  record.groundGameUnits = existing
    ? ledger.map((g) => (g.groupId === ledgerGroupId ? updatedRow : g))
    : [...ledger, updatedRow];

  record.cohortModifiers = mods;
  record.yesShare = referendumYesShare(record);

  return {
    ok: true,
    message: `Ran ${preset.label} across ${
      target === "whole" ? "the whole electorate" : target.groupId.replace(/_/g, " ")
    } (now ${record.yesShare.toFixed(1)}% Yes).`,
  };
}
