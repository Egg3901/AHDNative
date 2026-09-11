# Mechanics parity audit - AHDNative vs AHDGame

Date: 2026-09-10. Bounded read-only source audit, 20 minute cap. No engine edits, no full test run.

## Corrections since this baseline audit

The source audit below is preserved at its recorded revisions. Current work
and validation live in [ROADMAP.md](ROADMAP.md) and
[ENGINE-ADAPTATIONS.md](ENGINE-ADAPTATIONS.md). The corrections below have
landed and describe current behavior (verified 2026-09-11 against current
main). Each names the live evidence doc and the child issue carrying the
remainder; do not cite the baseline rows for these areas as current.

- Referendum variance: `polling` votes resolve with `seededVariance(id, turn)`
  (FNV-1a hash over `id:turn`, no shared RNG draw), not `rng.next()*2-1`. See
  [referendum parity](REFERENDUM-PARITY.md). The request action and campaign
  window are now live; cohort substrate, actuation, and consent remain under
  issues #42 and #70.
- TFP: `macroCountryTurnPhase` reads `tfpBasket` over prev-turn national
  metrics at the exact AHDGame paths, with reference-input fallback for
  missing keys. See [growth parity](GROWTH-PARITY.md). Unseeded-input
  remainder: issues #40 and #106.
- Corporation/macro order: `corporationTurnPhase` runs immediately before
  `macroCountryTurnPhase`, same turn. See [phase
  order](PHASE-ORDER-DEPTH.md). Remaining tail-placement deviations:
  issue #34.
- Campaign/vote/reset order: the campaign cluster precedes
  `voteAccumulation` with `campaignSpendReset` after, same turn (M04). See
  [campaign order](CAMPAIGN-ORDER-DEPTH.md). Campaign-operations remainder:
  issues #67 and #88.
- Party/caucus charging: party founding and caucus creation single-charge
  through the public action boundary (no double deduct). See [party
  management](PARTY-MANAGEMENT.md) and [caucus
  management](CAUCUS-MANAGEMENT.md). Charter/lifecycle remainder: issues
  #59, #60, #61, and #95.
- Occupation mobilization: `occupationShift` applies the 50-turn ramp
  (`mobilizationFloor` 0.4). See [war depth](WAR-PARITY-DEPTH.md). War-verb
  remainder (declare/peace/intel/navair): issue #41.
- Save interchange: current `SCHEMA_VERSION` is 44; authentic v42 saves load
  (migrated) and `projectSaveToV42` projects a narrow fail-closed subset.
  See [save compatibility](SAVE-COMPATIBILITY.md). Progressed-export
  remainder: issue #116; current-SP interchange: issue #122.
- Explicit opt-in UK historical initialization, with the founding default kept.
- Decaying campaign spend stock ported by #92 (closed); the imported NPC
  financing model stays a disclosed non-port.

These corrections do not establish whole-engine parity or physical-device
performance. In particular, war abstraction, remaining phase/content/electoral
gaps, fiscal policy-level consequences and cross-platform numeric/collation
behavior still need work. The old acceptance statements below are historical
findings, not a claim that later corrections have not happened.

## Sources pinned

- Reference engine (import candidate, unchanged): `AHDClient` worktree `packages/engine/src` at `568c0c039efc` (`568c0c0 test(engine): pin scripted phase replay and reject incomplete traces`). Historical coverage docs at that revision: `docs/historical-engine-coverage.md` and `docs/historical-engine-validation.md` (audit `378126dcb6c5b3366d182b442c6395d548b5edf5` baseline, current `568c0c0` retains same gaps).
- Upstream authority: `AHDGame` at `e364c0495` (current HEAD inspected; `src/lib/metricEngine/potentialGrowth.ts`, `src/lib/constants/referendum.ts`, `src/lib/military/battle.ts`, `src/simulation/phases/turnPhaseRegistry.ts:978-1421`, `src/lib/presidentialElectionEngine.ts:930-980`, `src/lib/referendum/processReferendumLifecycle.ts`, `src/lib/constants/countries.ts`, `src/lib/world/worldEntityManifest.ts`).
- This worktree: `AHDNative` branch `docs/mechanics-parity-audit` at `5dc9421` base.

Method: read source files only, compare named symbols and file docs at those commits. No assumed fixed. Each gap classified as proven aligned, proven divergent, or unverified. Paths are repo-relative at pinned revisions. Do not treat this doc as a parity certificate.

## Integration posture

AHDNative integrates the TS worker first, validates with replay evidence, then makes a profile-gated Rust decision. Mechanics are not rewritten blindly in Rust. Preserving historical engine goldens preserves historical deviations. A Rust port that reproduces the TS engine exactly would ship those deviations as if they were parity.

## Determinism vs parity - separate claims

Engine replay determinism: same seed + same action sequence + same `advanceTurn` implementation produces bit-identical JSON save on that engine. Verified in the historical audit for 21 no-action worlds (5 turns, seeded twins, save/load at turn 3, JSON envelope byte comparison). See `docs/historical-engine-validation.md` and `audit-results/historical-engine.json`. This does not prove AHDGame parity.

AHDGame mechanics parity: same seed + same world + same `advanceTurn` on AHDNative produces the same state that AHDGame would have produced. Requires a differential harness against AHDGame as oracle, per-system. No such harness exists yet. Treat every proven divergent or unverified gap below as blocking a parity claim even where determinism is green.

## Named gap audit

| Gap | Classification | Evidence (reference engine) | Evidence (AHDGame) | Effect |
|---|---|---|---|---|
| Referendum lifecycle | proven divergent (partial port) | `packages/engine/src/referendum/request.ts` exposes the request action and `packages/engine/src/referendum/lifecycle.ts` uses `seededVariance(id, turn)` for polling resolution. Layer-1 cohort inputs, consent, and final actuation remain absent; issues #42 and #70 track them. | `src/lib/constants/referendum.ts:152-165` `resolveReferendumVote` pure math is ported. `src/lib/referendum/processReferendumLifecycle.ts:1-80` drives the full state sequence with DB I/O, cohort history, and the same seeded FNV variance. | Request and campaign-window reachability now align at the bounded Native seam. End-to-end referendum consequences remain incomplete under #42 and #70. |
| War abstraction | proven divergent (replacement mechanic) | `packages/engine/src/wars/types.ts:1-6` header: full unit combat absent, GDP-based margin is new. `packages/engine/src/wars/settlement.ts:1-30` documents margin as `100*(B-A)/(A+B)` from coalition GDP. `OCCUPATION` values match (`decisiveMargin 45`, `maxShift 5`, `retreatYield 0.7`). Constants `DICTATE_WINDOW_TURNS 24`, `TRUCE_TURNS 240`, `POLE_HOLD_TURNS 3` verbatim. | `src/lib/military/battle.ts:1` seeded per-unit combat with casualties, logistics (`supplyState`), doctrine, generals, `FrontSupport` (`navair/frontSupport.ts`), `occupation.ts:166` `occupationShift` (same formula but fed by battle margin, not GDP). Coalition/logistics matter. `src/lib/world/transitions/rules.ts` (8 rules) shows no dissolution transition even for RU/DD. | `occupationShift` and the three window constants are aligned. War outcome is not: GDP ratio is a new abstraction, not a port. Cannot satisfy no-mechanics-redesign unchanged. Any war/occupation balance claim is blocked until `src/lib/military/battle.ts` core is assessed directly. |
| TFP / potential growth | proven divergent (stubbed basket) | `packages/engine/src/phases/macroCountryTurn.ts:190-232` computes `computeLaborForce` + `annualizedGrowthRate` + `potentialGrowth` (Solow) live, but `const tfp = TFP_BASELINE` (`:232`) with comment: basket needs `rdIntensity/workforceSkill/transportEfficiency/broadbandAccess/powerGridReliability/urbanizationRate`. `TFP_BASELINE` pinned at `1.2` (from `src/lib/metricEngine/potentialGrowth.ts`). | `src/lib/metricEngine/potentialGrowth.ts:95-150` implements `tfpBasket(inputs)` with `TFP_BOUNDS [0.2,2.6]`, `TFP_REFERENCE_INPUTS`, `agglomeration()` saturating, and deviation-from-reference form where reference inputs yield exactly `TFP_BASELINE`. Called from `metricEngine` with prev-turn `stateMetrics` lag. | Labor and capital growth are real; TFP is flat. Research/skills/infrastructure/urbanization have no effect on growth in the imported engine. Porting `tfpBasket` verbatim is parity-preserving at reference inputs, diverging elsewhere by design (and desired). |
| Phase order | proven divergent (intentional tail lag) | `packages/engine/src/phases/registry.ts:164-400` documents append-only tail placement to avoid shifting RNG streams under existing goldens. Every cluster after `billLifecyclePhase` is deferred: `voteAccumulation`/`electionTimers`/`electionResolution` (`:168`), `demographicEffects/Flows/census`, `tradeGrowth/fiscalBaseGrowth/subsidy/fiscalYear/regionalBudget` (`:190`), `centralBankChairTurn/Selection`, `corporationTurnPhase` (`:204` one-turn lag noted in `corporation/corporationTurn.ts`), `campaignSpendReset/Turn/Subsidy/NpcInvestment` (`:212` one-turn lag: spend visible next turn), `governmentFormation/VacancyWatcher`, `impeachmentLifecycle/presidentialSuccession`, `cabinet*`, `recomputeSharePrices` (`:286` after `corporationTurnPhase`), plus 14 more tail clusters. Opening comment still says ~60 phases while indices exceed 119. | `src/simulation/phases/turnPhaseNames.ts:1-147` `BASE_TURN_PHASE_NAMES` (136 entries) + `COUNTRY_ELECTION_PHASES` + `src/simulation/phases/turnPhaseRegistry.ts:1-1421` authoritative order: e.g. `corporationTurn` at index 5 (before macro), `campaignTurn` index 51 (before `voteAccumulation` 60), `campaignSpendReset` index 61 (after), `fiscalBaseGrowth`/`economicModel` before `tradeGrowthMirror`, `centralBankChairTurn` `116-121` mid-pipeline, `recomputeSharePrices` right after `bondTurn`, `intelligenceTurn`/`navairOperations` before `ministerialOrders`. | Same-turn causality differs: corporation earnings visible next turn not this turn; campaign spend visible next turn; metric/fiscal/budget interlocks are tail-shifted. Reordering to mainline order changes RNG stream and invalidates every existing golden hash. The registry has 105 entries vs 136 base names - count alone does not measure coverage. |
| Electoral omissions | proven divergent (partial) | `packages/engine/src/elections/presidentialElectoralCollege.ts:22` `electoralVotesByState` uses `houseSeats+2` per region, no DC/ME/NE district special cases (documented, byte-identical for 48-state 1953: 435+96=531, majority 266). `:63-70` resolves exact per-state ties alphabetically. `packages/engine/src/elections/tallyAdapter.ts` does per-state accumulation (W24b), replacing older nationwide path. `docs/ROADMAP-1.0.md:50` nationwide-only claim superseded by W24b (`:51`). | `src/lib/elections/apportionment.ts` `electoralVotesFromSeats` (EV = house+2+DC/ ME-NE districts from 1961/1972/1992), `src/lib/presidentialElectionEngine.ts:945-980` per-candidate per-state vote pipeline: `groundGame` bonuses, VP home-state `*1.03`, governor endorsement `*GOVERNOR_ENDORSEMENT_STATE_BONUS`, coalition credibility, `campaignStrengthVoteMultiplier`, `presidentialRuleset.ts` `CONVENTION`/`suspendTransferMode`/`primaryCalendar stretched` etc. Mainline exact-tie resolves via `sha256` hash of unit+ids, not alphabetical. `seatGeography.ts` has `assignUsSeatGeography` but no district entities. | EC math is correctly scoped for 1953 (DC absent, districts absent). At 2019 it is structurally incomplete. VP home-state and governor endorsement effects are unported. Alphabetical tie-break diverges on exact ties (rare but deterministic difference). Roadmap W24 nationwide claim must not be cited as current. |
| Era/country coverage | proven divergent (scope-limited, not invented) | `packages/content/src/packs/index.ts:20-32` `PACKS` = `1953/1979/1991/2019` only. No `1960` pack (deleted, calendar retains legacy date anchor). `packages/engine/src/world.ts:209-230` `listEras` from `PACKS_BY_DATE`. Each pack header documents conversion method and gaps. Playable list is code truth, not doc intent: see mapping below. Current saves use schema 44. | `src/lib/constants/countries.ts:5406` `ERA_COUNTRY_CONFIG_OVERRIDES`, `src/lib/world/worldEntityManifest.ts` preset manifests, and 28 `CountryId` values define the broader authority. | Imported engine supports exactly 4 eras, with documented per-era playable subsets. It does not support `1999/2007/2023` or the full 28-country roster. Claiming otherwise is false. |

### Supporting detail for the two aligned edge claims

- `packages/engine/src/budget/taxRatePhaseIn.ts:9` and `src/lib/budget/taxRatePhaseIn.ts:25` - same `TAX_RATE_PHASE_IN_MAX_STEP_PP=1`, finite normalization, rounding, pending-target cleanup, `phaseInTurns` math. Verbatim reuse, proven aligned.
- `packages/engine/src/government/formation.ts` vs `src/lib/turn/parliamentaryGovernment*` - flagged unverified here; government formation/vacancy ordering is intentionally preserved in tail but not byte-compared in this bounded pass.

## Supported imported era/country matrix vs AHDGame presets

Do not claim an era the import does not ship. `X` = imported playable (can `newWorld({era,countryId})`). `(np)` = in pack but `playable:false` (AI/economy-preview only). Unlisted = not in pack at all.

Imported engine (at `568c0c0`):

| Era | Start | Playable (`playable:true`) | Present but not playable | Not in pack |
|---|---|---|---|---|
| 1953 | 1953-01-06 | US, UK, RU, DD (4) | FR, IT, ES, SE, TR, GR, AT, FI (8) | JP/DE/IE/CN/BR/NG and 16 other `CountryId` |
| 1979 | 1979-01-01 | US, UK, RU, DD (4) | FR, DE, JP, IE, CN, BR, NG, IT, ES, SE, TR, GR, AT, FI (14) | Many (HU excluded: no `INITIAL_RATES_1979` entry, documented gap) |
| 1991 | 1991-01-01 | US, UK, JP, DE, IE, BR, CN (7) | NG, FR, IT, ES, SE, TR (6) | RU, DD (dissolved, no `worldEntityManifest` entry - not `playable:false`, absent entirely) |
| 2019 | 2019-01-01 | US, UK, JP, DE, IE, CN (6) | BR, NG (2) | RU, DD, FR, IT, ES, SE, TR, GR, AT, FI + others |

Total imported playable combos: 21 (4+4+7+6), matching `docs/historical-engine-validation.md` roster replay.

AHDGame presets (selected): `1953-default` (same 4 cold-war playables plus 8 preview economies), `1979-default` (same 4, 19 budgets, hidden tier for PL/RO/YU/HU/CS/BG/UKR/BLR/BAL via `COLD_WAR_HIDDEN_1979`), `1991-default` (`POST_COLD_WAR_PLAYER` US/UK only in manifest, but budgets for JP/DE/IE/BR/CN/NG/FR/IT/ES/SE/TR exist - same 13-row set), `2019-default` (manifest US/UK, budgets for 8: US/UK/JP/DE/IE/BR/CN/NG), plus `1999-default/2007-default/2023-default` (present in `worldEntityManifest.ts` and `turnPhaseRegistry.ts` but not in imported `PACKS` at all). Also 28 `CountryId` values in `countries.ts` including PL/RO/YU/BG/BLR/UKR/CS/BAL/SCO/WAL/FR/IT/ES/SE/TR/GR/AT/FI/NG/HU.

Interpretation: 1953 and 1979 imported playable coverage matches the corresponding AHDGame preset playable set (US/UK/RU/DD). 1991 and 2019 imported engine marks JP/DE/IE/BR/CN playable where current `worldEntityManifest.ts` for those presets restricts `POST_COLD_WAR_PLAYER` to US/UK - a scope difference to disclose, not a parity bug. No imported era covers `1999/2007/2023`.

Per-era notes retained from pack headers: conversions are `budget.gdp / INITIAL_RATES_<era>[country] / 1e6 = millions USD` (`currencies.ts`), `growthRate/inflationRate` are percent `/100`; unemployment for non-US/UK/RU/DD in 1979/1991/2019 is largely external historical references, not mainline-authored (explicitly documented); `states/regions/demographics` tables ship only for 1953 real states, others use opaque-region fallback; `1960` save load migrates but no new world can be created.

## Three highest-value bounded corrections for tonight (TS worker, not blind Rust)

Each is a single-phase, RNG-contained change with a pre-agreed seam test. Expected result is derived from AHDGame source, not from the historical engine golden.

1) Referendum variance source - deterministic hash
- Change: in `packages/engine/src/referendum/lifecycle.ts` replace `rng.next()*2-1` with `seededVariance(id, turn)` mirroring `src/lib/referendum/processReferendumLifecycle.ts:seededVariance` (FNV `id+turn` -> `[-1,1]`) and `src/lib/constants/referendum.ts:resolveReferendumVote`. Keep `resolveReferendumVote` pure.
- Seam: `createWorld({seed:"audit-seededVariance",playerName:"t",countryId:"UK",era:"1953"})` then insert two `ReferendumRecord` fixtures both `status:"polling"` with same `yesShare` but distinct `id` values, `world.meta.turn` fixed, call `runReferendumLifecycle` (or `advanceTurn` once with mocked turn) twice from same seed. Also call `resolveReferendumVote` directly.
- Expected independent result: `resolveReferendumVote({yesShare:50,varianceRoll:0})` yields `finalYesShare 50`, `turnout 55`, `passed false`; `varianceRoll:1` yields `54`, `57.4`, `true`; `varianceRoll:-1` yields `46`, `57.4`, `false` (from `src/lib/constants/referendum.ts:152`). Hash values: `seededVariance("SCO-1953-0", 10)` must equal AHDGame's hash output for that pair (read from `processReferendumLifecycle.ts` at `e364c0495`), not `rng.next()`. Two fixtures with same `yesShare` must diverge deterministically by `id`, and re-running `advanceTurn` on the same JSON world must produce byte-identical `finalYesShare`.

2) TFP basket - deviation-from-reference port
- Change: add `tfpBasket` to `src/lib/metricEngine/potentialGrowth.ts` verbatim (`TFP_BASELINE 1.2`, `TFP_BOUNDS [0.2,2.6]`, `TFP_REFERENCE_INPUTS`, `agglomeration()`) and wire `macroCountryTurnPhase` to read prev-turn `stateMetrics` inputs (`rdIntensity/workforceSkill/transportEfficiency/broadbandAccess/powerGridReliability/urbanizationRate`) with `orRef` fallback, keeping `TFP_BASELINE` flat when metrics absent.
- Seam: unit test `tfpBasket` directly; world test `advanceTurn` on a 1953 US seeded world where `stateMetrics` are absent or at reference.
- Expected independent result: `tfpBasket(TFP_REFERENCE_INPUTS)` equals `1.2` exactly (parity-preserving at average). `tfpBasket({rdIntensity:4.5})` > `tfpBasket({rdIntensity:0.5})` and both within `[0.2,2.6]`; `agglomeration(92)` concave vs `agglomeration(25)` (from `potentialGrowth.ts` at `e364c0495`). A 1953 US no-action world with no education/infrastructure metrics must produce identical `gdpGrowth` before and after the change (flat TFP preserved); a world with `rdIntensity` 4.5 vs 0.5 injected must show higher `potentialGrowth` for the former, never negative from TFP alone.

3) Electoral tie-break and scope honesty - VP/governor effects marked, district gap disclosed
- Change: keep `presidentialElectoralCollege.ts` winner-take-all but (a) add a test harness proving alphabetical vs `sha256` hash tie divergence on an exact per-state tie, and (b) either wire `vpHomeState *1.03` and `GOVERNOR_ENDORSEMENT_STATE_BONUS *1.03` from `src/lib/presidentialElectionEngine.ts:945-980` into the per-state tally, or if deferred, add explicit `// PORT-STUB: VP home-state + governor endorsement not applied` so the omission is not mistaken for parity. Document ME/NE district gap (no `states` district entities; `tallyAdapter.ts` `state: r.id` single contest).
- Seam: `createWorld({seed:"audit-ec",countryId:"US",era:"1953"})`, run `runVoteAccumulation` to populate `ElectionRecord.stateTallyStates`, then craft a single state entry where two candidates have identical `totalVotes` (e.g. `CA: {DEM:1000, REP:1000}`), call `allocateElectoralVotes`.
- Expected independent result: current code gives `stateWinners[CA]` = alphabetically first id (e.g. `US_DEM` over `US_REP`). AHDGame at `e364c0495` gives the `sha256(unitId + tiedIds)` winner (from `presidentialElectionEngine.ts` tie path), opposite for at least one id pair. `electoralVotesByState` at 1953 still totals 531 / majority 266 (matching `apportionment.ts` `HOUSE_SEATS_1953`). If VP/governor wiring lands, a tally where `vpHomeStateByCandidate.get(cid)=="CA"` or `governorEndorsedCandidatesByState.get("CA").has(cid)` must show `votes` multiplied by `1.03` vs without, matching `presidentialElectionEngine.ts:945-955`.

Out of scope tonight: full phase-order re-golden (requires reordering ~20 tail clusters to `turnPhaseRegistry.ts` order and regenerating every golden hash), full `battle.ts` combat port (thousands of lines: units/generals/doctrine/logistics), `requestReferendum` + cohort + poll + actuation, `1960/1999/2007/2023` era synthesis.

## Release blockers recorded by the baseline audit

- Any claim of AHDGame parity while proven divergent gaps remain unaddressed or undisclosed. Historical determinism passing does not clear this gate.
- Any claim of all-era coverage: only `1953/1979/1991/2019` are imported; `1999/2007/2023` and most `CountryId` values are not.
- Any claim of war/combat parity while GDP-margin abstraction remains.
- Any claim of referendum E2E playability (no request/cohort/consent/actuation).
- Phase-order same-turn causality: corporation/campaign/metric lags must be disclosed until re-golden lands with profile data.
- Save interchange: current `SCHEMA_VERSION` is 44. Authentic v42 saves load (migrated) and `projectSaveToV42` projects a narrow fail-closed subset (see [save compatibility](SAVE-COMPATIBILITY.md)). Progressed political state still blocks full interchange (issue #116); bidirectional lossless compat is not established.
- Device gate: no representative late-game workload, no named Android hardware `advanceTurn` p95, no save/serialize cost vs 131 MB historical sample re-measured on target.

## Acceptance evidence needed (before paid build)

- Determinism: seeded twin `advanceTurn` + JSON save/load replay per supported era/country (existing 5-turn no-action + 2 turns after reload) re-run on this `568c0c0` engine, with hashes recorded (as in `historical-engine-validation.md` method).
- Differential parity: for each bounded correction above, the seam test passes against AHDGame expected values at `e364c0495` (not against historical goldens). Historical goldens remain the determinism gate, not the parity gate.
- Phase mapping artifact: `BASE_TURN_PHASE_NAMES` index -> imported `TURN_PHASES` name or `combined/missing/inapplicable` with data-dependency notes (not just name sets).
- Era/country matrix above re-validated from `PACKS` code, not pack docs.
- Save compat: genuine v42 fixture load is proven (see [save compatibility](SAVE-COMPATIBILITY.md)). Still needed: progressed-world round-trip without loss (issue #116) and documented rejection of current-schema saves by the old reader.
- Device profile: named iOS + Android hardware, justified late-game world (not server smoke `turn 401-500 p95 744 ms`), with `advanceTurn` p95, save size/time, and per-phase clocks.

## Source limitations

- Static source read only; no test or benchmark re-run in this 20 minute window. Historical timing `p95 744 ms` is from the prior worktree run on a shared production host (`docs/historical-engine-validation.md`) - not a device measurement, not a claim about this worktree, and above the 500 ms proposal.
- AST math inventory (`pow 19` etc) from the historical audit is a text scan, not a determinism certificate (aliases/computed access not resolved).
- Pack country budgets for 1979/1991/2019 are a mix of mainline `NATIONAL_BUDGET_SEED_CONFIGS_*` and external historical unemployment where mainline has no table - cited in pack headers, not verified row-by-row here.
- Commit refs are `HEAD` at read time; a newer AHDGame commit may move lines without changing the gap classification.

## First correction identified by the baseline audit

Implement bounded correction 1 (seededVariance) in the TS worker. Add `src/referendum/seededVariance.ts` mirroring `AHDGame/src/lib/referendum/processReferendumLifecycle.ts:seededVariance`, replace the `rng.next()` call in `lifecycle.ts:46`, add a `.test.ts` that pins `resolveReferendumVote` at `varianceRoll -1/0/1` and `seededVariance("SCO-1953-0",10)` against the AHDGame hash at `e364c0495`, plus a deterministic re-run check (`advanceTurn` on same JSON world yields identical `finalYesShare`). Keep historical goldens green; worlds without a polling referendum are unaffected, but removing the old draw intentionally shifts downstream shared RNG draws for referendum-bearing worlds. See [the implemented correction](REFERENDUM-PARITY.md). Commit as `fix(engine): use seededVariance for referendum vote`.



## Implemented corrections after the audit

The inventory above describes the imported baseline. [Referendum variance](REFERENDUM-PARITY.md) now follows the AHDGame per-record FNV hash and consumes no shared RNG. This closes only the variance-source difference, not the lifecycle. [TFP](GROWTH-PARITY.md) now uses the reference basket with exact prior-turn national metric keys when present; missing inputs retain reference defaults. Default worlds still lack the full state-metric inputs and phase-order parity remains open. Neither M02 nor M04 is complete. The `debatePrep` character action (#37) is ported at coded values (1 AP, 15% roll, Debate +1 capped at 10) through the catalog, `executeAction`, saveable `player.stats.debate`, and the Intelligence hub; see [engine adaptations](ENGINE-ADAPTATIONS.md). Debate decay and participation practice rolls remain unported.
