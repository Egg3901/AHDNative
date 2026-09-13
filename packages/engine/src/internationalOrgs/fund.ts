/**
 * Org dues and tribute — Native port of
 * src/lib/internationalOrganizations/organizationFund.ts (chargeOrganizationDues,
 * memberDueUsd, clampDuesRate) and tribute.ts (chargeOrganizationTribute).
 *
 * CURRENCY. The reference normalizes member GDP and the fund/federal budgets
 * through getGdpAnchorRate (gdpAnchorRate.ts), which returns ₳-per-stored-GDP.
 * For the 1953 economies this is 1.0 (gdpAnchorRate.ts file doc: "IT/JP/CN/NG
 * 1953: authored in USD millions, so their 1953 rate is 1.0"), so dues debit the
 * treasury and credit the fund at PAR here — the same numeric result the
 * reference's 1953 world produces. Native has no usdExchangeRate table on the
 * engine side (exchangeRates are live FX, a different quantity), so the par
 * assumption is stated rather than silently applied.
 *
 * The reference's "a member with no federalBudget row matches nothing and is
 * skipped (dues) / minted (tribute)" rule is preserved against Native's
 * world.budgets: playable countries (US/UK/RU/DD) have budgets; macro members
 * (FR/IT/TR/GR/BR) do not, so their tribute is minted into the fund and their
 * dues assessment is skipped — exactly as the reference handles an
 * unenabled/macro member.
 */
import type { WorldState } from "../types.js";
import type { InternationalOrgState } from "./types.js";
import {
  DEFAULT_ORG_DUES_RATE_ANNUAL,
  GDP_MILLIONS_TO_USD,
  MAX_ORG_DUES_RATE_ANNUAL,
  MIN_ORG_DUES_RATE_ANNUAL,
  ORG_DUES_TURNS_PER_YEAR,
  orgTributeRateAnnual,
} from "./constants.js";
import { fundOf } from "./state.js";

/** Per-turn USD dues a member owes given its USD GDP + the org's annual rate. Source: memberDueUsd. */
export function memberDueUsd(gdpUsd: number, duesRateAnnual: number): number {
  if (!(gdpUsd > 0) || !(duesRateAnnual > 0)) return 0;
  return (gdpUsd * duesRateAnnual) / ORG_DUES_TURNS_PER_YEAR;
}

/** Clamp a proposed annual dues rate to the allowed band. Source: clampDuesRate. */
export function clampDuesRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_ORG_DUES_RATE_ANNUAL;
  return Math.min(MAX_ORG_DUES_RATE_ANNUAL, Math.max(MIN_ORG_DUES_RATE_ANNUAL, rate));
}

/**
 * Charge per-turn dues from each member's treasury into the org fund. Each
 * member is debited its due; the fund is credited the total. Returns the
 * fund-currency total charged (0 when nobody paid). Source: chargeOrganizationDues.
 *
 * A member with no `world.budgets` row matches nothing and is skipped rather
 * than billed from nowhere — the reference's `matchedCount !== 1` guard.
 */
export function chargeOrganizationDues(
  world: WorldState,
  org: InternationalOrgState,
  memberGdpUsd: { countryId: string; gdpUsd: number }[],
): number {
  const fund = fundOf(org);
  if (!(fund.duesRateAnnual > 0) || memberGdpUsd.length === 0) return 0;
  let total = 0;
  for (const m of memberGdpUsd) {
    const dueUsd = memberDueUsd(m.gdpUsd, fund.duesRateAnnual);
    if (dueUsd <= 0) continue;
    const budget = world.budgets[m.countryId];
    if (!budget) continue;
    const dueLocal = Math.round(dueUsd);
    if (dueLocal <= 0) continue;
    budget.treasuryBalance -= dueLocal;
    total += dueUsd;
  }
  const totalRounded = Math.round(total);
  if (totalRounded > 0) fund.balance += totalRounded;
  return totalRounded;
}

export interface TributeResult {
  /** Total credited to the fund, in the fund's own currency. */
  collectedLocal: number;
  /** How many members actually paid. */
  payers: number;
  /** Share of `collectedLocal` that had no treasury behind it. */
  minted: number;
}

const EMPTY_TRIBUTE: TributeResult = { collectedLocal: 0, payers: 0, minted: 0 };

/**
 * Charge fixed tribute from members that cannot vote. Source: chargeOrganizationTribute.
 * Only NATO/WARSAW_PACT levy it, and only in a world that began at the 1953
 * preset — orgTributeRateAnnual is the single gate.
 */
export function chargeOrganizationTribute(
  world: WorldState,
  org: InternationalOrgState,
  tributeMemberIds: readonly string[],
  preset: string,
): TributeResult {
  const rateAnnual = orgTributeRateAnnual(org.id, preset);
  if (rateAnnual <= 0) return { ...EMPTY_TRIBUTE };
  if (tributeMemberIds.length === 0) return { ...EMPTY_TRIBUTE };

  const fund = fundOf(org);
  let collectedLocal = 0;
  let minted = 0;
  let payers = 0;
  for (const payer of tributeMemberIds) {
    const gdpMillions = world.countries[payer]?.economy.gdp;
    if (gdpMillions === undefined || !(gdpMillions > 0)) continue;
    const owedUsd = (gdpMillions * GDP_MILLIONS_TO_USD * rateAnnual) / ORG_DUES_TURNS_PER_YEAR;
    if (!(owedUsd > 0)) continue;
    const fundCredit = Math.round(owedUsd);
    if (fundCredit <= 0) continue;
    const budget = world.budgets[payer];
    if (budget) {
      // Charged whatever the treasury's sign, exactly as dues are — a state
      // meets its obligations by borrowing (reference tribute.ts note).
      budget.treasuryBalance -= Math.round(owedUsd);
    } else {
      minted += fundCredit;
    }
    collectedLocal += fundCredit;
    payers++;
  }
  if (collectedLocal > 0) fund.balance += collectedLocal;
  return { collectedLocal, payers, minted };
}
