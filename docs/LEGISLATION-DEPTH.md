# Legislation depth (N05/N06): detached legislature detail/query

Detached read-only legislature detail surface. Select actual catalog
legislation, read legal levels, options, effects and reference descriptions,
and see chamber-specific active and completed bills with selected-bill
details. Server/engine stays authoritative: every sponsor/vote control
resolves to a real supported engine action.

## Implementation

- `src/game/legislationDetails.ts`: pure DTO builder plus sponsor-param helper.
- `src/game/legislationDetails.test.ts`: engine-boundary tests (HoS world,
  genuine t95 fixture read-only).
- `src/ui/LegislationDetailsPanel.tsx`: chamber-grouped bills, bill details,
  catalog proposal details. Props are `query`, `busy`, `onAction`, plus
  optional `onSelectBill(id | null)` for caller-driven lazy detail fetch.
  Sponsor params are built from the proposal DTO plus pure `snapTaxRate`;
  the panel makes no engine catalog calls.
- `src/ui/LegislationDetailsPanel.test.tsx`: control-to-action tests.
- `src/game/taxRate.ts`: presentation-side rate helper, isolated from engine imports.
- `src/ui/LegislationRoute.tsx`: on-demand session/worker query and bill selection.

## Exact interface

```ts
buildLegislationDetails(world: WorldState, selection?: { billId?, catalogId? }): LegislationDetailsQuery
sponsorParamsForLegislation(catalogId: string, opts?: { taxRate?: number }): { catalogId: string; taxRate?: number }
snapTaxRate(taxPolicy, requested?): number
```

`LegislationDetailsQuery` carries `office`, `chambers` (one group per
country chamber config, each with `active` and `completed` bill metadata),
`proposals` (available catalog entries for the player country, tax entries
included), `selectedBill` (full details only for the selected bill, so huge
bill lists stay metadata-only), `selectedProposal`, plus
`sponsorSupportsLevelChoice: false`, `sponsorSupportsTaxRateChoice: true`
and `levelChoiceNote`. No `world` key: the DTO is bounded plain data.

Active means `proposed`, `active`, `active_other`, `active_both` or
`veto_override`. Completed means `enrolled`, `vetoed`, `override_failed`,
`signed`, `failed` or `withdrawn`. Voting-open display follows the session
rule (`active`, `active_other`, `veto_override`); tallies mirror
`session.ts projectLegislature` (live vote-map count while open, frozen
tallies otherwise, other-chamber and override maps where applicable).

Panel `onSelectBill` reports the expanded bill id (null on collapse) for
lazy detail fetch. The panel builds sponsor params from the proposal DTO
via `sponsorParamsForProposal` (pure `snapTaxRate`, no engine catalog call).

Panel `onAction` calls emitted:

- `sponsorBill` with `{ catalogId }` for primary/secondary entries.
- `sponsorBill` with `{ catalogId, taxRate }` for tax entries, rate snapped
  to the catalog ladder and clamped to min/max (same rule as the engine).
- `voteOnBill` with `{ billId, vote }` on open bills in the player chamber.

## Evidence

- `src/game/legislationDetails.test.ts`: 8 passed. Covers chamber
  grouping, catalog levels/effects source values, tax snap/clamp
  (35.7 to 36, 999 to 60, default 35 for `us.tax.incomeTax`), sponsored-bill
  placement in its origin chamber, the genuine t95 Senate tally (52/27/16)
  with serialize roundtrip unchanged, nested effect detachment against
  caller mutation, and DTO boundedness.
- `src/ui/LegislationDetailsPanel.test.tsx`: 10 passed. Covers chamber
  lists, bill details with read-only levels and no level action,
  human-friendly copy with no engine internals, onSelectBill expand/fetch/
  collapse correspondence, stale-selection guard, dropdown choice retention
  until a new external selection, default sponsor params, tax-rate sponsor
  params (`{ catalogId, taxRate: 42 }`), vote dispatch, and busy disabling
  every control.
- Baseline visual comparison is `BillCard.tsx` (headline plus sponsor line
  plus vote buttons with tally) and `BillProposalChip.tsx` (admin-proposed
  pill) in `AHDGame/src/components/bills/`. Comparison only; no UI imported.

## Limits and the level-choice gap

The public `sponsorBill` engine action (`packages/engine/src/actions/
execute.ts`) accepts `catalogId` plus `taxRate` (tax kind only),
`sponsorCountryId`, `originChamber`, `billTitle` and `billCategory`. It
accepts NO legal-level option: provisions always enact at
`effectDirection 1`. The panel therefore presents catalog `levels` as
read-only reference and offers no level control; faking one would invent
mechanics. Verified live: an HoS world sponsors `us.economy.workerSecurity.
primary` into the first elected chamber (`senate`, config order) at status
`proposed` with default provisions.

Cost/availability: sponsor 4 AP with 1-turn cooldown, seat or HoS gate;
vote 1 AP, seat in the bill's current chamber, voting-open status. Display
hints only; `executeAction` decides.

Note: the existing session `LegislatureView` filters tax-kind entries out
of proposals, so tax sponsorship is reachable only through this query, not
through `LegislaturePanel`. Unavailable (PORT-STUB) catalog entries are
excluded from proposals because sponsoring them always fails.

## Integrated player flow

The grouped menu opens Bills and proposals; the quick Legislature page links to it. `GameSession.legislation(selection)` crosses the worker boundary on demand and returns detached data. Choosing a bill fetches its matching details; the selected chamber follows the bill across query remounts. Sponsor/vote dispatch remains the actual engine contract. The separate tax-rate helper prevents importing engine catalog initialization into the React bundle.

`src/game/actionDepth.test.ts` starts with the genuine elected 1953 US save at turn 98, verifies the existing sponsorship cooldown, advances to turn 99, sponsors income tax at 38%, and reads the same bill after save/reload. `smoke/action-depth.spec.ts` exercises the same tax input, action, bill selection and relaunch through the production UI.
