# Germany and China tax-law career evidence (#286, #287)

This records the bounded tax-law engine acceptance exercised by the public
Native action and save APIs. It does not claim whole-country legislation
parity, mobile UI acceptance, or closure before the final hosted gate.

Source pin: AHDGame `cb66acdf0129616b8a09902727e9b58715c8bacb`. Its law rows
are in `src/lib/countries/{de,cn}/data/*LegislationTypes.ts`; budget presets
and effective rates are in `src/lib/seeds/reference/budgets.ts` and
`src/lib/seeds/reference/basePolicies{1991,2019}.ts`. Source presets enable DE
Bundestag and CN NPC career routes. Native creates the source-authored local
election, accepts the player's candidacy, and uses the normal election
resolver to grant the seat. The test shortens only the generated election
calendar. It does not inject a legislative seat or enactment vote. The elected
player then uses `sponsorBill`, `voteOnBill`, and ordinary `advanceTurn` calls.

| Acceptance | Evidence | Remaining |
| --- | --- | --- |
| #287: exact bounded DE tax identities, options, defaults, directions | `deExecutableSlice.test.ts` checks all seven available national tax rows and authored ladders/directions. The 2019 `solidaritySurcharge` baseline is now 5.5%; 1991 is 2%, per source option index 5 and 3. | Other DE laws retain their source subsystem blockers. |
| #287: proposal, vote, enactment and effect for released rows | The career test earns a real Bundestag seat, publicly sponsors all seven selected rows, records the player's vote, advances to signing and verifies the changed rate or its active phase-in. It verifies AP/NPI debits. | Hosted full gate remains the merge requirement. |
| #287: supported replacement/repeal and save/reload | Existing DE VAT lifecycle test replaces and repeals the active law, observes each phase-in step, and compares continued state after save/reload. The career test round-trips the final seat, bills and enacted laws. | No broader DE law coverage is claimed. |
| #286: exact bounded CN tax identities, options and source defaults | `cnExecutableSlice.test.ts` checks VAT, enterprise income, individual income, social insurance and tariff rows against their source ladders and political directions. | The other 57 CN catalog rows remain explicitly blocked by their named missing subsystem/effect. Planned-economy reform remains outside this slice. |
| #286: proposal, vote, enactment and effect for all five released rows | The career test earns a real NPC-delegate seat through the generated election and resolver, then submits, votes and advances each tax row through signing and budget rate/phase-in effect. | None in the selected engine rows. |
| #286: source AP/NPI cost, tariff exemption, refusal/refund and replacement | Existing CN executable-slice coverage checks cost quotes/debits, unaffordable atomic refusal, once-only capped refunds, tariff influence exemption, replacement, and save/reload of the ramp. The corrected `smoke/china-national-tax-laws.spec.ts` direct-decree journey passed on PR #717 source-authority head `14a375b8`. It uses Legislature, observes the budget receipt/rate, replaces the law, saves/reloads at 320px and 390px, and asserts zero recorded votes for source HoS decrees. This follow-on changes only CN test coverage, not that production path. | Root is rerunning the full smoke on the latest PR #717 head; hosted gate and merge remain pending. |

## Germany solidarity-surcharge budget line

Native previously marked `de_solidarity_surcharge` available but omitted its
budget consumer. Game `src/lib/utils/budgetCalculations.ts` defines the tax as
a percentage of already calculated income-tax receipts. The Native budget
seed now carries the source 1991 and 2019 rates, and the revenue phase applies
that same basis. Other countries omit the optional key, preserving their
previous serialized shape.

The independent Game source execution used the DE 2019 preset vector: GDP
€4.5T, taxable-income base €2.07T, income-tax rate 42%, and surcharge 5.5%.
It returned income-tax receipts €869.4B, surcharge receipts €47.817B, and
total receipts €1,904.967B. The Native source-vector test asserts these exact
values and current-schema save/reload. A pinned historical schema-42 reader
probe confirmed it retains an unknown rate field but drops the surcharge
receipt on its next turn; `projectSaveToV42` therefore refuses DE saves while
the rate is nonzero or a surcharge phase-in is active.

Focused commands and results on the follow-on worktree:

- `npm test --workspace @ahdclient/engine -- --run src/budget/germanSolidaritySurcharge.test.ts`: 2 passed.
- `npm test --workspace @ahdclient/engine -- --run src/legislation/deExecutableSlice.test.ts -t "earns a Bundestag seat through the public career election path"`: 1 passed, 5 skipped.
- `npm test --workspace @ahdclient/engine -- --run src/legislation/cnExecutableSlice.test.ts -t "earns an NPC delegate seat through the public career election path"`: 1 passed, 9 skipped.
- `git diff --check`: passed.

The root `npm run build` passed through `tsc --noEmit` and the Vite production
build (scheduled job `20261001T210716Z-3e21b9f2`). The first package-level
content typecheck exposed implicit-any source-catalog diagnostics; the
generator now has an explicit source law shape and that package typecheck is
queued. The engine package typecheck still reports test-only diagnostics,
including one-argument `characterParity.test.ts` calls, `fundCost.test.ts`
optional-property/duplicate-field diagnostics, and stale `WorldRng` /
partial-world fixtures. Those package-wide diagnostics were not
baseline-compared and are not represented as passing typechecks.
