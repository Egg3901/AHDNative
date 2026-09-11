/**
 * Per-party spend aggregator for the swing-flow engine's money driver.
 *
 * Ported from `src/lib/electionEngine/fundsByParty.ts`.
 * Mainline mapping: DB-dependent `getFundsByPartyForElection(electionId, db)`
 * read `campaigns` collection rows (`Campaign.spendStock` +
 * `Campaign.spendThisTurn`). In this pure layer callers supply plain
 * campaign rows (`FundsByPartyInput`) directly. Aggregation logic is
 * verbatim.
 */

export interface FundsByPartyInput {
  party: string;
  spendStock?: number;
  spendThisTurn?: number;
}

export function aggregateFundsByParty(
  campaigns: FundsByPartyInput[]
): Map<string, number> {
  const fundsByParty = new Map<string, number>();
  for (const c of campaigns) {
    // #92: decaying stock of recent spend plus the live accumulator.
    // This turn's spend counts at full weight at tally time; the reset
    // sweep folds it into the stock afterwards. Missing values degrade
    // to 0 (backward-compat with old rows / saves).
    const stock = typeof c.spendStock === "number" ? c.spendStock : 0;
    const fresh = typeof c.spendThisTurn === "number" ? c.spendThisTurn : 0;
    const spend = stock + fresh;
    if (spend <= 0) continue;
    fundsByParty.set(c.party, (fundsByParty.get(c.party) ?? 0) + spend);
  }
  return fundsByParty;
}

/**
 * Alias preserving mainline name for call sites that will wire DB rows as plain inputs.
 * Mainline mapping: `electionId` is not needed in pure layer — the caller has
 * already filtered to the election's campaigns.
 */
export function getFundsByPartyForElectionInput(
  campaigns: FundsByPartyInput[]
): Map<string, number> {
  return aggregateFundsByParty(campaigns);
}
