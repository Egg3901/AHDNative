# Campaign order depth (M04)

Date: 2026-09-10

Source-backed same-turn correction against AHDGame at pinned commit
`e364c0495`. Native `campaigns/phases.ts` documented an intentional
one-turn lag (campaign cluster at the tail, reset first). That lag is now
removed for the source-backed causal edges only. Formulas, clusters, and
the disclosed non-port NPC mechanics are untouched.

## Source order at `e364c0495`

`src/simulation/phases/turnPhaseNames.ts`: `campaignTurn` (56) precedes
`voteAccumulation` (64); `campaignSpendReset` (65) follows it, same turn,
before `electionTimers` and `electionResolution`. The registry confirms
the edges: the tally's money driver reads `spendStock + spendThisTurn`
(`fundsByParty.ts`), the reset sweep folds the accumulator afterwards, and
Group 7 runs strictly sequentially so final-turn votes are kept.

## Native move (minimum causal edges)

`packages/engine/src/phases/registry.ts` now runs, between
`contractSettlement` and `voteAccumulationPhase`:

```text
campaignTurnPhase -> campaignPartySubsidyPhase -> campaignNpcInvestmentPhase
-> voteAccumulationPhase -> campaignSpendResetPhase -> electionTimersPhase
-> electionResolutionPhase
```

Why all three writers move, not just `campaignTurn`: the tally reads
`spendThisTurn`, which `campaignTurn` (maintenance), `campaignNpcInvestment`
(upgrade purchases) and between-turn player upgrades all write; the party
subsidy must stay directly before investment because it funds this turn's
purchases. Relative order inside the moved block is unchanged. All four
moved phases are RNG-free, and the RNG consumers (`voteAccumulation`,
`electionTimers`) keep their relative order, so the move itself shifts no
shared RNG stream.

Effects: this turn's spend and media-favorability support are visible to
the tally the same turn; a race resolving this turn gets its final campaign
tick before resolution archives the row; the reset clears the interval
after the tally read, so post-turn `spendThisTurn` is 0.

## Investigated and deliberately NOT changed

- Formulas: income, maintenance, auto-downgrade, ops effects, currency,
  upgrade costs - byte-identical behavior, only the slot moved.
- `campaignPartySubsidy` / `npcInvestment` remain disclosed non-port
  mechanics (see their file docs); not rebalanced, only repositioned with
  the cluster they feed.
- `spendStock` NOT ported: mainline's money driver reads a decaying stock
  plus the live accumulator and its reset folds one into the other (ticket
  #1261). Solo has no `spendStock` field; `electionEngine/fundsByParty.ts`
  reads `spendThisTurn` only and the reset stays a pure wipe. Idle turns
  therefore read zero instead of a fading stock. Flagged for a future
  spendStock wave; no guessed decay math was folded into this move.
- Tally, timers, resolution, support, endorsement sweep: comment-only
  context already accurate; no changes needed. The endorsement sweep
  already ran before `campaignTurn` in both orders (matches mainline).
- New-race first tick now lands the turn after timers spawn the race
  (campaigns are created at timers, after the tick), same as mainline.

## Tests

`packages/engine/src/campaigns/campaignOrder.test.ts` (public contract
only: `createWorld`, `advanceTurn` with the `afterPhase` observer,
save/resume). RED before the move (2 failed: tally-time spend was 0,
final tick missing with `totalFundsGenerated` stuck at 6000; save/resume
equivalence passed throughout), GREEN after (3 passed). The explicit
phase-order list in `engine.sim.test.ts` was updated for the intended
move and only its one-turn test was run. Engine `tsc` clean. Full-world
hash goldens were NOT regenerated; downstream integration goldens that
encode the old lag vector will shift and are owned by the later full-engine
batch.

## Limits

- No differential whole-turn oracle against mainline; evidence is the
  red-to-green ordering contract. The moved phases draw no RNG; changed
  election results can still affect downstream conditional RNG use.
- Absolute pipeline positions still differ (tail-append strategy kept for
  every other cluster); only the campaign/tally edges are source-aligned.
- Campaign operations stay a partial port (see `campaigns/phases.ts`
  PORT-STUB list).

Existing saves can carry spending recorded by the former tail phases. That
pending spending is retained and combined with the first new tick before the
tally; loading a save never clears paid-for campaign activity. Subsequent
completed turns reset the interval after its tally. This transition is an
intentional consequence of correcting the timing, not historical replay parity.
