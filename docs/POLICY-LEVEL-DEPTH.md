# Policy level depth

Status: Draft. The fiscal boundary and source graded metric mapping remain
held for a later integrated slice.

This slice adds source-backed level selection to the public `sponsorBill`
action for available catalog laws that carry an authored five-level program
ladder. It does not change the catalog values or tax-slider behavior.

## Reference contract

The pinned AHDGame source is commit `e364c0495`. In
`src/lib/politicalLegislation/project.ts`, each program-law level is assigned
an id `l0` through `l4` and the direction ladder is:

```text
[-1, -1, 0, 1, 1]
```

The Native action accepts the same option id:

```ts
executeAction(world, "player", "sponsorBill", {
  catalogId: "us.economy.workerSecurity.primary",
  policyOptionId: "l3",
});
```

The selected id is stored on the policy provision. At enactment the engine
resolves that exact id, writes its numeric index to `Bill.enactedLevel` and
`EnactedLaw.level`, and keeps the existing numeric string representation in
`policyLedger.policyOptionId` for save and DTO compatibility. The provision's
`policyOptionId` remains the canonical saved selection.

## Validation and effects

Only an available catalog entry with an authored `levels` array accepts a
program option id. The catalog law must also belong to the requested sponsor
country. Unknown ids, tax entries, cross-country entries, and available
entries without authored levels fail before a bill is added. The public action
wrapper restores action points, funds, cooldowns, and action counts on that
failure, so the world is unchanged.

An omitted option id keeps the existing Native sponsorship shape and default
`effectDirection: 1`. This preserves existing saves and replay vectors until a
caller explicitly chooses a level. Tax entries continue to use `taxRate` and
their existing phase-in path.

At enactment, an explicitly selected program level does not reuse the Native
coarse catalog effect descriptor. The pinned source projection says
new-generation program options carry cost models and policy targets, never the
legacy instantaneous effect fields. The omitted option path keeps the existing
catalog descriptor. The selected direction still reaches the existing
policy-ledger metric pull, so a center option produces no policy pull while a
directed option does. The Native metric pull remains sign-only for now, so this
is a recorded source direction rather than a claim of source graded-axis parity.

The source also carries per-level GDP, income, and revenue cost fractions.
Source baseline seeding writes a `statePolicies` row for every program law and
an active `enactedLaws` row for each nonzero baseline level before rebuilding
spending from that law book. Native seeds aggregate authored budget categories
and starts with no baseline program-law records. Its `CountryBudget` has no
per-law baseline or income-band input, so workerSecurity's source mapping to
the `other` category cannot be added or replaced safely: adding a selected cost
could double count the seeded aggregate, while replacement and repeal have no
attributable prior line to remove. Native budget amounts are absolute local
currency, while country economy GDP is an in-game millions-USD display value;
the budget GDP field is a separate absolute local-currency value. This slice
therefore does not apply fiscal fractions or invent a conversion. A complete
fiscal slice needs an explicit baseline law ledger, the source fiscal-base and
income-band inputs, recurring rebuild wiring, and save/migration coverage.

The mismatch is observable in a fresh 1953 Native world. Native seeds the US
budget at $387.0B GDP, $16.1B in `other` spending, and zero enacted program
laws. The pinned source fiscal calibration uses a $397.1B regional-rollup base
and its baseline program-law sum is $83.576B, including $11.064B under
`other`. Native seeds the UK budget at £14.4B GDP and £0.8B in `other`, while
the source uses a £19.8B rollup base and £1.445B of baseline `other` program
cost. These are different baselines, so a selected level cannot be converted
to an attributable replacement delta from the current Native fields.

Repeal actions and unavailable or unported catalog systems remain on their
existing paths. This work does not add UI, session routing, worker fields, or
new mechanics for those systems.

## Focused evidence

`packages/engine/src/legislation/policyLevel.test.ts` covers:

- exact option ids and all five source directions;
- atomic rejection of unknown and tax-slider option ids;
- the legacy omitted-option path;
- proposal through unicameral enactment and save reload;
- selected-level separation from legacy instant effects and policy metric behavior.

Run the focused engine file with:

```text
npm run test --workspace @ahdclient/engine -- src/legislation/policyLevel.test.ts
```
