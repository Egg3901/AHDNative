/**
 * Player referendum campaign spend (the `campaignSpendUnits` writer).
 *
 * Ports AHDGame's referendum campaign-spend command
 * (`src/lib/referendum/campaign.ts` at commit c1283e75a — removed in
 * 8148586c9 when the ground game subsumed the untargeted PS campaign).
 * `cohort.ts:referendumYesShare` already folds `campaignSpendUnits` in as a
 * uniform lean shift (`leanFromUnits`), but nothing wrote that ledger; this is
 * the missing writer.
 *
 * Faithful to the source:
 *  - A party spends Political Strength to nudge `yesShare` toward its side, with
 *    the exact diminishing-returns curve (`CAMPAIGN_SPEND_YESSHARE_PER_UNIT` /
 *    `CAMPAIGN_SPEND_HALF_LIFE_UNITS`, already ported in cohort.ts). The effect
 *    is applied at read time as a uniform per-cohort lean shift, so it flows
 *    into the canonical aggregate the vote resolves on.
 *  - A party may only spend on its mapped side: the region's pro-independence
 *    party campaigns Yes, every other party No (`campaignSideForParty`).
 *  - Cost is `units * CAMPAIGN_PS_COST_PER_UNIT` (= 1) Political Strength.
 *
 * PORT-STUB (deliberately omitted, named per system — do not invent params):
 *  - The source debits a state-party-org PS pool via `spendPoliticalStrength`,
 *    which applies a pressure-ladder effective cost and an audit row. Native has
 *    no per-region state-party PS ledger, so this writes the player party's
 *    national `politicalStrength` at the source's base cost (no pressure
 *    escalation, no separate audit collection — the ledger written here is the
 *    record's own `campaignSpendUnits`).
 *
 * Atomicity: every gate is validated BEFORE any write, so a rejected spend
 * leaves the party's Political Strength and the record exactly as they were.
 */
import type { WorldState } from "../types.js";
import type { ReferendumRecord } from "./types.js";
import { referendumYesShare } from "./cohort.js";

/** Political Strength cost per campaign spend unit, verbatim from AHDGame's
 *  `src/lib/constants/referendum.ts:CAMPAIGN_PS_COST_PER_UNIT`. */
export const CAMPAIGN_PS_COST_PER_UNIT = 1;

/**
 * Region → pro-independence party (Native party ids). Verbatim in intent from
 * AHDGame's `REGION_PRO_INDY_PARTY`, which used the Mongo-hosted
 * `uk_snp`/`uk_plaid`/`uk_sf` slugs; Native's packed content uses the
 * uppercase `UK_SNP`/`UK_PC`/`UK_SF` ids (see packages/content/src/packs).
 */
export const REGION_PRO_INDY_PARTY: Record<"SCO" | "WAL" | "NIR", string> = {
  SCO: "UK_SNP",
  WAL: "UK_PC",
  NIR: "UK_SF",
};

/**
 * Which side of the referendum a party campaigns for: the region's
 * pro-independence party campaigns Yes, every other party campaigns No.
 * A party may only spend on its mapped side.
 */
export function campaignSideForParty(partyId: string, regionId: string): "yes" | "no" {
  const proIndy = REGION_PRO_INDY_PARTY[regionId.toUpperCase() as keyof typeof REGION_PRO_INDY_PARTY];
  return partyId === proIndy ? "yes" : "no";
}

/** The side a party is allowed to spend on, or null when the region is unknown. */
export function campaignSideForPartyInRegion(
  partyId: string | null | undefined,
  regionId: string,
): "yes" | "no" | null {
  if (!partyId) return null;
  const key = regionId.toUpperCase();
  if (!(key in REGION_PRO_INDY_PARTY)) return null;
  return campaignSideForParty(partyId, key);
}

export interface ReferendumCampaignSpendParams {
  referendumId?: string | undefined;
  side?: "yes" | "no" | undefined;
  units?: number | undefined;
}

export type ReferendumCampaignSpendResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function findReferendum(world: WorldState, id: string | undefined): ReferendumRecord | undefined {
  if (!id) return undefined;
  return world.referendums.find((record) => record.id === id);
}

/**
 * Contribute unit spend to a referendum campaign on the player's side. Writes
 * `campaignSpendUnits[side]` and the recomputed canonical `yesShare`.
 */
export function spendReferendumCampaign(
  world: WorldState,
  params: ReferendumCampaignSpendParams,
): ReferendumCampaignSpendResult {
  const { referendumId, side, units } = params;

  if (units === undefined || !Number.isInteger(units) || units <= 0) {
    return { ok: false, error: "Spend at least one unit." };
  }
  if (side !== "yes" && side !== "no") {
    return { ok: false, error: "Choose a valid campaign side." };
  }

  const record = findReferendum(world, referendumId);
  if (!record) return { ok: false, error: "Referendum not found." };
  if (record.status !== "campaigning") {
    return { ok: false, error: "No active campaign for this referendum." };
  }
  // Nation gate (reference route): only a player of the referendum's country may
  // campaign in it.
  if (world.player.countryId !== record.countryId) {
    return { ok: false, error: "Only players of this nation may campaign in this referendum." };
  }

  const partyId = world.player.partyId;
  if (!partyId) return { ok: false, error: "You must belong to a party to campaign." };

  const expectedSide = campaignSideForPartyInRegion(partyId, record.regionId);
  if (expectedSide === null) {
    return { ok: false, error: "This region has no referendum campaign." };
  }
  if (side !== expectedSide) {
    return {
      ok: false,
      error:
        expectedSide === "yes"
          ? "This party campaigns for the Yes side."
          : "This party campaigns for the No side.",
    };
  }

  const party = world.parties[partyId];
  if (!party) return { ok: false, error: "Your party could not be found." };

  const psCost = units * CAMPAIGN_PS_COST_PER_UNIT;
  const available = party.politicalStrength ?? 0;
  if (available < psCost) {
    return {
      ok: false,
      error: `Insufficient Political Strength (need ${psCost}, have ${available}).`,
    };
  }

  // All gates passed — commit atomically.
  party.politicalStrength = available - psCost;
  const prior = record.campaignSpendUnits ?? { yes: 0, no: 0 };
  record.campaignSpendUnits = {
    yes: prior.yes + (side === "yes" ? units : 0),
    no: prior.no + (side === "no" ? units : 0),
  };
  // Fold the spend into the canonical share the vote resolves on.
  record.yesShare = referendumYesShare(record);

  return {
    ok: true,
    message: `Spent ${units} on the ${side === "yes" ? "Yes" : "No"} campaign (now ${record.yesShare.toFixed(1)}% Yes).`,
  };
}
