# Campaign strength and the vote projection

Issue [#68](https://github.com/Egg3901/AHDNative/issues/68). Campaign strength
was a PORT-STUB: the engine stored no value and no tally read one. This slice
ports the reference mechanic and surfaces it, without changing any existing
save or fixture.

## What was ported

`packages/engine/src/campaigns/campaignStrength.ts` is a faithful port of
AHDGame `src/lib/campaigns/campaignStrength.ts` at the pinned revision:

- constants (`CAMPAIGN_STRENGTH_MAX_BONUS`, `…_TAU`, `…_CONTRIBUTION_NPI_MULTIPLIER`,
  `…_LEADER_PULLBACK_MAX_PER_TURN`, `…_PRICE_PER_POINT`, `…_POINTS_PER_ACTION`,
  `…_MAX_BATCH_CLICKS`, `…_BATCH_STEPS`);
- `campaignStrengthContributionCost` (the exact integral of the quadratic
  marginal price, not a per-click approximation) and
  `campaignStrengthContributionActions`;
- `campaignStrengthVoteMultiplier` (the saturation curve, exactly 1 at zero
  strength) and `campaignStrengthBoostPercent`;
- `calculateCampaignStrengthLeaderPullbacks`, `campaignStrengthBatchQuote` and
  `maxAffordableCampaignStrengthClicks`.

`Campaign.campaignStrength` is a real optional field: `ensureCampaign` seeds 0,
`deserializeSave` backfills 0 for older saves, and the save validator keeps the
additive shape. No schema bump.

## Where the multiplier applies

A grep of the whole reference finds exactly one engine consumer:
`presidentialElectionEngine.ts` (~line 976) multiplies each unit's current-turn
votes. Native routes both presidential per-state tallies and down-ballot races
through one `accumulateVoteTurn`, so the gate lives in the adapter
(`elections/tallyAdapter.ts`): only a presidential general builds the
per-candidate multiplier map. Down-ballot races and primary-phase presidential
tallies pass nothing.

Because the multiplier is exactly 1 at strength 0 and new/old saves both default
to 0, the application is a strict no-op for every existing save, fixture and
golden. The engine test suite asserts this explicitly (identical tallies at
strength 0).

## Leader pullback (turn phase)

`campaignStrengthPullbackPhase` (`campaigns/phases.ts`, registered in
`phases/registry.ts`) is the reference's per-turn leader pullback from
`src/lib/turn/campaignTurn.ts`: `calculateCampaignStrengthLeaderPullbacks` is
computed once over the active campaigns and applied as a strength decrement
(`campaignTurn.ts` ~lines 228 / 577). Each turn the single strongest campaign in
a multi-campaign election is pulled back toward that election's average strength,
capped at `CAMPAIGN_STRENGTH_LEADER_PULLBACK_MAX_PER_TURN` (175).

It runs immediately after `campaignTurn` (which never writes `campaignStrength`)
and before `voteAccumulation`, matching the reference's same-turn edge so the
tally reads the pulled-back value this turn. It is RNG-free, so it consumes no
shared RNG draws; and it is a **strict no-op when every campaign sits at 0
strength** (the pullback map is empty, and the phase short-circuits first), so no
existing save, fixture or golden moves.

## Player contribution

`campaignContribute` (`actions/campaignContribute.ts`) is the reference-shaped
port of AHDGame `src/lib/campaigns/commands/campaignCommands.ts`
`contributeCampaignStrength` (~lines 719-948):

- `strengthPerClick = nationalInfluence * 0.75`
  (`CAMPAIGN_STRENGTH_CONTRIBUTION_NPI_MULTIPLIER`); a player with no national
  influence is refused ("You have no national influence to contribute");
- batched clicks: a numeric count is floored and clamped to
  `CAMPAIGN_STRENGTH_MAX_BATCH_CLICKS`, and `"max"` is resolved server-side with
  `maxAffordableCampaignStrengthClicks` against the campaign's live strength and
  the player's current balances, so a Max request degrades to a smaller batch
  rather than hard-failing;
- funds/actions come from `campaignStrengthBatchQuote` — the exact integral of
  the marginal price for funds and `clicks * singleClickActions` for actions
  (ceilings do not add) — with the anchor funds cost converted to the player's
  local balance at the frozen `campaignLocalRate`;
- the reference eligibility gates: campaign-eligible race, presidential only
  (the multiplier is the only place strength changes votes), not resolved, and
  same country;
- **cross-campaign**: `targetCandidateId` aims the contribution at another
  candidate's campaign in the same election (the reference takes an arbitrary
  `campaignId`; the `suspendEndorse` transfer likewise moves strength within one
  election). Strength is credited to the target while funds/actions are debited
  from the player.

Every gate — including affordability against the resolved batch — is validated
before any write, and `execute.ts` snapshots/restores accounting on any failure,
so a rejected or unaffordable contribution leaves the player's balances and the
target campaign's strength exactly as they were. `strengthAdded` remains as an
internal raw-amount helper override (a single contribution of exactly that many
points, bypassing the NPI derivation) for callers that already hold an amount.

## Display

- The campaign panel shows current strength and the reference `+X% vote boost`,
  the per-click yield (`nationalInfluence × 0.75`), and **x1 / x5 / Max**
  contribution buttons that quote the exact reference funds/actions cost.
- A **target selector** appears when more than one campaign is live in the
  election, so strength can be sent to the player's own or a rival's campaign.
- The race projection block shows a clearly separated **projected** leader and
  margin when strength is recorded in a presidential general, with a note that
  it is an estimate from saved state. Without strength, or before any votes are
  counted, it shows why instead of numbers. Counted tallies and the seat
  estimate are untouched, and a resolved race never shows a projection.

## Remaining

- The reference's `activityLog` audit row for a contribution has no Native
  analogue (solo has no activity ledger).
- Applying strength to down-ballot races would require the reference's
  down-ballot behaviour, which does not exist upstream.
