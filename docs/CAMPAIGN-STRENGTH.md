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

`Campaign.campaignStrength` is now a real optional field: `ensureCampaign`
seeds 0, `deserializeSave` backfills 0 for older saves, and the save validator
keeps the additive shape. No schema bump.

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

## Player contribution

`campaignContribute` adds strength to the player's own campaign, charging the
reference's funds and action cost (converted with the frozen campaign-local
rate) and validating every gate before any debit, so a rejected contribution
leaves both balances and strength untouched. It is **presidential-general only**
on purpose: that is the only place the multiplier changes votes, so accepting a
contribution elsewhere would charge the player for a stat with no effect.

PORT-STUB, named and not invented: the reference derives `strengthAdded` from
the contributor's national influence (`nationalInfluence * 0.75` per click) and
can transfer strength to a rival campaign; Native takes an explicit
`strengthAdded` and targets the player's own campaign only. The NPI constant is
ported for the display layer.

## Display

- The campaign panel shows current strength and the reference `+X% vote boost`,
  plus a contribution control quoting the exact reference cost.
- The race projection block shows a clearly separated **projected** leader and
  margin when strength is recorded in a presidential general, with a note that
  it is an estimate from saved state. Without strength, or before any votes are
  counted, it shows why instead of numbers. Counted tallies and the seat
  estimate are untouched, and a resolved race never shows a projection.

## Remaining

- Leader pullbacks are ported but not yet wired to a turn phase, so strength
  currently only grows. Wiring them is additive but needs a phase-order
  decision and a save/replay check.
- The national-influence coupling and cross-campaign transfers from the
  reference contribution command remain omitted.
- Applying strength to down-ballot races would require the reference's
  down-ballot behaviour, which does not exist upstream.
