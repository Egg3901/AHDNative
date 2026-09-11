# Referendum lifecycle

Issue #42 is implemented against the AHDGame source snapshot
`e364c04954ed628beef73a993a8e9e156650a31e`. The Native implementation lives
under `packages/engine/src/referendum/` and is persisted as part of the normal
WorldState save.

## Complete Native lifecycle

`executeAction(world, "player", "requestReferendum", { regionId })` applies the
source eligibility order for UK devolved regions: active-record exclusion,
terminal cooldown, and desire >= 60. Native has no separate devolved First
Minister office ledger, so the action catalog charges the source's three action
points and combines request with grant. Fresh worlds remain free of invented
referenda until the player invokes the action.

The turn path is:

1. `granted -> campaigning` on the next turn, with an opening poll point and a
   cohort baseline.
2. `campaigning -> polling` at `campaignCloseTurn`, recomputing the canonical
   Yes share and recording each poll point.
3. `polling -> actuating` or `settled`, using the canonical cohort aggregate
   plus the deterministic FNV `id + turn` variance.
4. A passed vote creates the source-shaped consent bill gate. Independence
   creates one Westminster bill; reunification creates Westminster and Dáil
   bills. Both use the ordinary Native bill phase and must reach `signed`.
5. Signed consent applies the in-memory consequence idempotently: Scotland or
   Wales becomes a playable sovereign country, or Northern Ireland transfers
   to Ireland as Ulster. Region-scoped electorate, turnout, budget,
   demographics, party-pressure, and candidate-support records are rescoped;
   a resident player is moved to the new country and must re-enter its politics.
6. Failed popular votes settle with the source 480-turn cooldown and desire
   reset to 25. A failed consent bill cancels conversion without inventing a
   transfer or adding a cooldown; an active consent bill remains under the
   ordinary bill lifecycle, matching the source processor's resolved-status
   gate.

The request helper recreates missing consent records for legacy `actuating`
saves, and actuation is idempotent so a save/load retry cannot duplicate a new
country or transfer a region twice.

## Source-backed cohorts

`cohort.ts` ports the source cohort builder, re-centering, turnout-weighted
aggregation, campaign spend curve, and poll history rules. `cohortProfiles.ts`
contains the exact `{ sharePct, turnout }` Layer-1 profile snapshot for
SCO/WAL/NIR across the four shipped eras (`1953`, `1979`, `1991`, `2019`) plus
the source affinity table. The snapshot was mechanically compared with
`getBucketProfileForRegion` and has zero value mismatches. Unsupported future
content uses the source's explicit `_all` fallback rather than claiming a
granular electorate it does not have.

Native intentionally omits AHDGame-only wire/webhook events and Mongo-specific
subregion expansion. They do not affect the saved referendum state, consent
gate, ownership consequence, or deterministic replay covered by this issue.

## Verification

- Reference profile comparison: all 12 era/region profiles match.
- `lifecycle.test.ts`: cohort snapshot, consent creation, signed independence,
  dual-consent reunification, cooldown, deterministic variance, and idempotence.
- `request.test.ts`: public request, save/load, 48-turn campaign, consent, and
  completed actuation through `advanceTurn`.
- The public replay test passes after serializing while `actuating`, signing the
  persisted bill, and advancing to `completed`.
