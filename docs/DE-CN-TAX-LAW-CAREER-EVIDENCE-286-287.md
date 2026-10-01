# Germany and China tax-law career evidence (#286, #287)

This records the bounded tax-law engine acceptance exercised by the public
Native action and save APIs. It does not claim whole-country legislation
parity, Game-equivalent autonomous NPC agenda and ballot behavior, mobile UI
acceptance, or issue closure before the final hosted gate.

Source pin: AHDGame `cb66acdf0129616b8a09902727e9b58715c8bacb`. Its law rows
are in `src/lib/countries/{de,cn}/data/*LegislationTypes.ts`; budget presets
and effective rates are in `src/lib/seeds/reference/budgets.ts` and
`src/lib/seeds/reference/basePolicies{1991,2019}.ts`. Source presets enable DE
Bundestag and CN NPC career routes. Native creates the source-authored local
election, accepts the player's candidacy, and uses the normal election
resolver to grant the seat. The test shortens only the generated election
calendar. It does not inject a legislative seat or enactment vote. The elected
player then uses `sponsorBill`, `voteOnBill`, and ordinary `advanceTurn` calls.
The immutable voting-contract files `npp/crossPressure.ts`, `npp/billVoting.ts`,
`nppAutonomy/oppositionBehavior.ts`, and `singleplayerDifficulty/rules/behavior.ts`
have identical blobs at this pin and current Game `698a2e8`. The current
`parliamentaryGovernment.ts` gained unrelated office-analytics writes; its
`tallySeatsByParty` implementation used here is unchanged.

| Acceptance | Evidence | Remaining |
| --- | --- | --- |
| #287: exact bounded DE tax identities, options, defaults, directions | `deExecutableSlice.test.ts` checks all seven available national tax rows and authored ladders/directions. The 2019 `solidaritySurcharge` baseline is now 5.5%; 1991 is 2%, per source option index 5 and 3. | Other DE laws retain their source subsystem blockers. |
| #287: proposal, vote, enactment and effect for released rows | The career test earns a real Bundestag seat, publicly sponsors all seven selected rows, records the player's vote, advances to signing and verifies the changed rate or its active phase-in. It verifies AP/NPI debits. Federal NPC votes now use the shared source cross-pressure resolver in `npp/voteDecision.ts` from both normal NPP behavior and the bill-lifecycle activation catch-up. | This does not port the Game agenda producer/sponsor selector, national-address party/category effect, source home-state identity, or caucus whip path. |
| #287: supported replacement/repeal and save/reload | Existing DE VAT lifecycle test replaces and repeals the active law, observes each phase-in step, and compares continued state after save/reload. The career test round-trips the final seat, bills and enacted laws. | No broader DE law coverage is claimed. |
| #286: exact bounded CN tax identities, options and source defaults | `cnExecutableSlice.test.ts` checks VAT, enterprise income, individual income, social insurance and tariff rows against their source ladders and political directions. | The other 57 CN catalog rows remain explicitly blocked by their named missing subsystem/effect. Planned-economy reform remains outside this slice. |
| #286: proposal, vote, enactment and effect for all five released rows | The career test earns a real NPC-delegate seat through the generated election and resolver, then submits, votes and advances each tax row through signing and budget rate/phase-in effect. It selects source-authored negative-economic alternatives and asserts an independently Game-executed CN VAT voter vector in the normal turn. | This does not port the Game agenda producer/sponsor selector, national-address party/category effect, source home-state identity, or caucus whip path. |
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

## Explicit remaining source behavior for #286/#287

The elected-player journeys establish that the selected tax rows are reachable
through Native's real election, proposal, voting, enactment, effect, and save
contracts. Federal NPP ballots now use Game's deterministic cross-pressure
formula in both the ordinary NPP phase and the bill-lifecycle catch-up pass.
Both routes apply the source active-NPP/retirement and one-party banned-party
eligibility guards, respect the source federal voting deadline, and turn a
veto-override abstention into AGAINST. Native's explicit `abstain` whip remains
its direct instruction extension.
Native keeps its established autonomy-tier gate on the ordinary NPP agency
phase; the lifecycle catch-up remains active for already-open bills, matching
Game's unconditional `processBillVoting` phase. A regression covers that
catch-up with autonomy off and a party-affiliated 1953 HoS test character.
The DE/CN selected tax options have no source district-approval tables, so the
district term is source-zero for these rows. Native uses its persisted
politician ideology/personality/donor level, bill provision option vector,
recorded applicable national party whip, and the formed government's lower
chamber seat tally; opposition coordination uses the source difficulty values
(easy 0.6, normal 1, hard 1.35). An
independently executed Game CN 11% VAT vector gives forces `(60, 0, 0, 36)`
and FOR for a CN_CDL voter with economic ideology -3, donor level 3, loyalty
80, and stubbornness 20. The lifecycle regression chooses an RNG draw for
which the removed randomized voter would have voted AGAINST, then asserts the
source FOR result.

Remaining differences are real: Native does not persist Game's NPP `homeState`
identity or national-address party/category agenda effect, has no caucus-whip
resolver, and stores only national party whips; Game resolves a matching
home-state party whip first and only uses a national whip when there is no
state-party leadership. Native also has not ported Game's governing-agenda
producer, urgency, or agenda-driven sponsor selection. This evidence therefore
supports the selected tax-law player journeys and the described
cross-pressure inputs, not complete NPC agenda/voter parity or issue closure.

The root `npm run build` passed through `tsc --noEmit` and the Vite production
build on the current voter implementation (scheduled job
`20261001T224137Z-84e32bbb`). The content package
typecheck passed after adding an explicit source law shape at the dynamic
Game catalog boundary (scheduled job `20261001T211340Z-8e544ea9`); the
content roster test passed 36/36 after merging the current #717 roster fix.
The focused autonomy/IE/subsidy/cross-pressure batch passed 24/24 tests
(`20261001T224859Z-79c5fbb7`); the final cross-pressure and lifecycle boundary
batch, including veto-override and closed-deadline cases, passed 5/5
(`20261001T231634Z-943757e2`). The current public DE/CN law slices passed 16/16
(`20261001T231216Z-4da3d01e`). The earlier full engine `test:ci` run
(`20261001T221840Z-405b3176`) predates the final autonomy split and party
fixture correction; it had five failures in the subsidy, IE career, and new
opposition test cases. The affected focused cases now pass, but this evidence
does not replace a hosted full gate on the final combined head.
The engine package typecheck still reports test-only diagnostics,
including one-argument `characterParity.test.ts` calls, `fundCost.test.ts`
optional-property/duplicate-field diagnostics, and stale `WorldRng` /
partial-world fixtures. Those package-wide diagnostics were not
baseline-compared and are not represented as passing typechecks.
