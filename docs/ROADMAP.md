# AHDNative roadmap

The owner delegates uncertain feature decisions to the implementation team. The lodestar is native iOS and Android UI for SP first, then MP, with performance central to every decision. The target is a unified mobile/desktop app with local offline SP and server-authoritative MP. iOS SP comes first. This roadmap records real completion evidence; card counts are not a progress percentage.

## Required throughout: existing game behavior and hierarchy

This is a game port. Every screen must preserve reference entry behavior, section
order, conditional controls and action flows. Responsive layout does not authorize
a new game hierarchy. The national Overview landing is superseded by Profile.
[Behavioral parity](BEHAVIORAL-PARITY.md) records source evidence and remaining gaps.

## Priority one: navigation and persistent footer feature parity

Owner direction: mobile-first layout can differ, but navigation and footer functionality must match the MP/SP feature surface. The [source inventory](NAVIGATION-PARITY.md) records destinations, submenus, conditional entries and status-bar interactions against AHDGame. A label or empty page is not completion.

| ID | Status | Slice | Acceptance |
|---|---|---|---|
| N01 | Done | Inventory AHDGame nav and persistent status bar | Named source revision, conditions, destination behavior and honest missing-feature matrix |
| N02 | Done | Grouped mobile menu and basic resource footer | Real destination routes, resource details/links, keyboard and touch access, safe-area clearance |
| N03 | Done | Portfolio and banking | Real balances/holdings; deposit and withdrawal through engine; save/reload smoke |
| N04 | In progress | Party and election detail | Full list-to-detail flow, candidacy controls, active-race links and reference-backed election information |
| N05 | In progress | State and legislature navigation depth | Regional overview, chambers, schedule, office-dependent entries and working details |
| N06 | In progress | Nation executive, policy, budget and economy | Actual local queries/actions, country-specific conditions and meaningful panels |
| N07 | In progress | World navigation | Nations, map, corporations, sectors, markets, exchange, trade, unions, organizations and crises mapped to SP capabilities |
| N08 | In progress | Full footer resource breakdowns | Action/income components, election projections/history and conditional corporation controls supported by actual engine evidence |
| N09 | In progress | Help, settings, search and notifications | Offline guidance and preferences, real search and notifications, native-safe network resources, and account or feedback routes delegated to the authenticated AHDGame surface; help-destination reachability verified centrally, 8/8, in the current batch |
| N10 | Queued | Complete functional parity review | Each inventory row demonstrated through the integrated UI, including relevant country/role conditions; named remaining gaps block parity claims |

This priority guides UI work within the complete roadmap. The owner has explicitly reaffirmed that gameplay, mechanics, save compatibility, lifecycle and performance work continue alongside it. Existing mechanics, save compatibility and physical-device release gates remain binding. N07 and N09 are not blanket multiplayer deferrals.

## Overnight execution plan

- Cutoff: 2026-09-10 06:00 Eastern local time (10:00 UTC). Work autonomously without depending on an overnight reply.
- Batch A: pin/audit reusable TS engine, implement tested session boundary, native storage, and actual MP/SP-derived UI in parallel.
- Batch B: integrate worker,save bridge and screens; run focused tests at each changed boundary, then one integrated gameplay smoke checkpoint.
- Batch C: address observed failures and mechanics/save compatibility gaps; expand supported actions/content only after the core loop works.
- Before cutoff: assess readiness using evidence. Keep paid builds held unless candidate gates pass; reserve the last build window rather than running repeated cloud smoke builds.
- A deadline does not waive mechanics,save,UI,device or release criteria. If blocked, keep the candidate unreleased and report exact gaps. If a batch finishes early, take the next dependency-ready slice.

## Validation boundaries and cadence

Use the agreed engine contract (`createWorld`, actions, `advanceTurn`, `serializeSave`, `deserializeSave`), native save API, and actual player flows. New behavior uses a demonstrated red-to-green test. UI component fixtures verify display behavior only; they cannot establish integrated gameplay. Run focused tests while implementing and broad checks once per integrated batch or a justified failure fix. No repeated unchanged full-suite runs.

## Work inventory

| ID | Track | Status | Depends on | Work | Acceptance evidence |
|---|---|---|---|---|---|
| G01 | Evidence | Done | - | Record unified SP/MP architecture and iOS-first delivery | Standing rules committed |
| G02 | Evidence | Done | G01 | Bootstrap React/Tauri shell and private signing setup | Local compile; encrypted signing; no device claim |
| G03 | Evidence | Done | G01 | Pin historical engine and identify reuse limits | Provenance and known mechanics differences recorded |
| G04 | Evidence | Done | G03 | Audit production RNG and imported source publication | [Determinism audit](DETERMINISM-AUDIT.md) at `f61c28f`; no unseeded runtime randomness or secret/ops material in non-test engine/content. Rust/device float parity is not established |
| G05 | Evidence | Blocked | G03,I01 | Measure named physical iOS device late-turn performance | Eligible build 0.1.0 (1.6) exists; named-device p95,worst-turn,memory and thermal measurements remain #43 |
| G06 | Evidence | Queued | G05 | Record TS optimization versus Rust go/no-go | Device evidence determines rewrite; no speculative bulk port |
| E01 | Engine | Done | G04 | Import pinned reusable engine/content without UI/history | Unchanged formulas; source manifest; proprietary notice |
| E02 | Engine | Done | E01 | Implement world session through public engine contract | Create,actions,turn,serialize,load behavior tests |
| E03 | Engine | Done | E02 | Move simulation into dedicated worker | UI responsive; ordered commands; no duplicate turns |
| E04 | Engine | Done | E03 | Handle worker errors, interruption and disposal | Failure preserves last good state; promises settle |
| E05 | Engine | Done | E02 | Produce stable display queries from real world | Economy/player/party/election/news views use engine state |
| E06 | Engine | Done | E02 | Validate supported era/country matrix | All shipped imported combinations create,act,turn,save/reload |
| E07 | Engine | Done | E02 | Run independent seeded replay and save-boundary comparison | Exact checkpoint hash; record reference commit |
| E08 | Engine | In progress | E07 | Audit long-world election memory and turn spikes | Profile once per changed performance concern; no pruning without compatibility proof |
| S01 | Saves | Done | G02 | Build native atomic save-slot storage with TDD | Fresh instance reads saved data; failed replacement preserves prior data |
| S02 | Saves | In progress | S01,E02 | Connect native save and reload commands | Raw engine envelope retained; completion and errors visible |
| S03 | Saves | Done | S02 | Implement slot list,delete and replacement confirmation | No traversal; deliberate overwrite/delete; deterministic metadata |
| S04 | Saves | In progress | S02 | Provide save export interchange | Real fixture both directions; no silent version downgrade |
| S05 | Saves | In progress | S04 | Resolve v42/v43 compatibility explicitly | Fixture-backed policy; no promise of roundtrip until verified |
| S06 | Saves | In progress | S02 | Recover after close,crash and partial write | Last completed save survives; no false saved status |
| U01 | Interface | In progress | G01 | Extract actual MP/SP visual and navigation baseline | Reference source/screens; no historical client redesign |
| U02 | Interface | Done | U01 | Build new-game era/country/player flow | Accessible form; real content choices; validation |
| U03 | Interface | In progress | U01,E05 | Port shared game chrome and character-first entry | Actual MP/SP hierarchy; compact mobile navigation |
| U04 | Interface | Done | U03,E05 | Expose real character and action flow | Costs,target input,result/errors; no fake actions |
| U05 | Interface | Done | U03,E05 | Expose party membership and party views | Basic join/leave/detail flow is wired and tested in PRs #7/#15; full platform/charter/coalition work remains #59 |
| U06 | Interface | Done | U03,E05 | Expose election and news views | Real records and clear empty states |
| U07 | Interface | Done | U03,S03 | Connect save browser and in-game lifecycle | New/resume/save/reload/exit and confirmed deletion pass browser smoke; native-device lifecycle remains I02/I03 and #44 |
| U08 | Interface | In progress | U02,U07 | Verify mobile layout and accessibility | Small-screen overflow,touch,keyboard,focus and errors |
| U11 | Interface | Partial | U03,U08 | Dual-pane and hinge-aware layout (#438) | Hinge primitives, docked nav/content and seven list/detail pairings (parties, elections, regions, legislation, nominations, markets, news article/event) tested with shared selection state; single-pane phone flow intact; only foldable hardware posture acceptance remains |
| U09 | UI | Done | E02,U07 | Expose party membership and candidacy through real engine actions | Filing,withdrawal,save/reload and accessible race pagination |
| U10 | UI | Done | U09,Q01 | Complete a seeded election-to-office loop and expose legislature actions | Genuine t95 fixture, election win,sponsor,vote,relaunch through production UI |
| M01 | Mechanics | Done | G03 | Inventory phase/order and feature drift from AHDGame | Named differences,source refs,release blockers |
| M02 | Mechanics | In progress | M01 | Close referendum lifecycle omissions | Behavioral parity scenarios through public actions/turns |
| M03 | Mechanics | In progress | M01 | Resolve war abstraction mismatch | Actual authoritative rules; no rebalancing or blanket waiver |
| M04 | Mechanics | In progress | M01 | Close phase order and TFP differences | Reference-driven tests; impacts traced |
| M05 | Mechanics | In progress | M01 | Close electoral and content omissions | National/subnational lifecycle and all supported content |
| M06 | Mechanics | Queued | M02,M03,M04,M05,M07,M08 | Sign off reference mechanics coverage | No unacknowledged mechanics gaps in 1.0 candidate |
| M07 | Mechanics | In progress | M01 | Consume authoritative Game-owned rules one action/system at a time | Fundraise shared cost/yield/eligibility first; [per-action character audit](CHARACTER-ACTION-PARITY.md) covers the 11 ActionsHub entries at `cd99794` (#91, partial, no runtime claim); gdpScalar still 1.0 and campaign/advertise/fundraise-yield conversion still unwired (buildDonorBase frozen conversion wired 2026-09-18 with quote/charge/save tests); preserve complete stat/currency context before parity signoff; [Game #1724](https://github.com/Egg3901/AHDGame/issues/1724) |
| M08 | Mechanics | In progress | M01,M07 | Detect upstream drift and gate consumer updates | Immutable source checks first; complete source coverage, update PRs and ruleset/save policy in [#120](https://github.com/Egg3901/AHDNative/issues/120) |
| Q01 | Validation | Done | E03,S02,U07 | Integrated gameplay smoke through actual UI | Create,country,action,turn,save,close,reload,continue |
| Q02 | Validation | Done | Q01 | Exercise error and concurrency smoke | Corrupt-save recovery,double-click turn,save failure/recovery and worker startup failure pass integrated smoke at fc87a991 |
| Q03 | Validation | In progress | Q01,U08 | Capture representative UI evidence | Desktop and mobile screenshots from real running world |
| Q04 | Validation | Done | E06,E07,Q02,Q03 | Run batched regression gate | Focused changes first; full suite only integration checkpoint |
| Q05 | Validation | Queued | Q04,M06,S05 | Assess 1.0.0 candidate readiness | Exact commit/results/remaining limitations; no placeholder success |
| I01 | iOS | Done | Q04,owner preview approval | Build first private signed feedback preview | 0.1.0 (1.6) exported, Apple VALID/INTERNAL_ONLY, attached to Owner review; #124. Full 1.0 gate remains Q05/I04 |
| I02 | iOS | Queued | I01 | Install and smoke on iPhone | Real install,launch,world,turn,save/relaunch |
| I03 | iOS | Queued | I02 | Validate lifecycle and memory/performance | Background,lock,interruption,low memory,named-device measurements |
| I04 | Release | Queued | I03,G06 | Cut private 1.0.0 when release gates pass | Version consistency,private artifact,release notes,known risks |
| P01 | Multiplayer | In progress | I04 | Adapt shared screens to authoritative MP transport | Slice 1 in [#359](https://github.com/Egg3901/AHDNative/issues/359): session bridge, 9 single-run actions, inbox triage, native player mail; batch/mobile/device acceptance split out |
| P02 | Multiplayer | In progress | P01 | Validate reconnect, mode separation and mutation safety | SP remains offline; MP mutations run server-side only, unsupported actions absent; device gate still open |
| A01 | Platforms | In progress | owner preview approval | Bring up Android shell and lifecycle | Local ARM64 APK built; signature and 16 KB binary/package checks pass. Device smoke/performance remain #44/#43/#126 |
| A02 | Platforms | In progress | owner preview approval | Adapt desktop navigation and packaging | Local Windows x64 portable EXE built with shared UI. Windows launch,keyboard/window state and save checks remain unverified |
| R01 | Conditional Rust | Conditional | G06 | Port exact RNG and save model | Only if rewrite activated; TS vectors and fixture parity |
| R02 | Conditional Rust | Conditional | R01,E07 | Port integer-clean systems in phase order | One bounded slice with phase hash gate |
| R03 | Conditional Rust | Conditional | R02 | Port transcendental-heavy systems | Exact first; documented proven tolerance only |
| R04 | Conditional Rust | Conditional | R03 | Integrate native contract after replay gate | Complete reference replay before shell engine switch |
| W01 | Deferred | Deferred | I04 | Web/WASM | Separate approval; not initial release. Mechanics drift is M08 and does not wait for web. |

## Current release blockers

- Physical iOS gameplay/lifecycle/performance evidence does not exist yet.
- Historical engine mechanics differ from current AHDGame in known systems. Reuse is an integration starting point, not parity certification.
- Authentic v42 import now passes for the pinned 1953 US fixture. Current v43 output is rejected by the old v42 reader. The engine projector and local export CLI write authentic fixtures byte-identical and Native-fresh pre-turn worlds as a keep-home schema 42 extension (not the authentic mint). Progressed `countryPolitics` still cannot round-trip without loss and is refused.
- The private iOS preview has passed signing, upload and Apple processing. Full phone playthrough, lifecycle and measured performance remain unverified; 1.0.0 is still gated.

Status changes must cite an actual commit, test result, artifact or explicit blocker. Completed shell/RNG/replay groundwork does not imply a playable release.

## Executive tax phase-in checkpoint, 2026-09-18 (#65 / #93)

- HoS `adjustTaxRate` now takes the same persisted phase-in path as enacted federal tax law: `fiscalDirectivesPhase` steps the rate by at most 1pp at the turn boundary and queues the remainder on `budget.taxRatePhaseIn` for `fiscalBaseGrowthPhase` to walk each turn (`packages/engine/src/budget/fiscalDirectives.ts`, mirroring `legislation/billLifecycle.ts`). A fresh directive replaces a running ramp; unknown tax fields are ignored; spending directives still enact in full at the boundary.
- Reachability: the HoS session projects both executive actions into ActionsHub (`src/game/session.ts` `HOS_ACTIONS`); the Executive tab shows 2/2 available with costed Take-action cards, and profile deep-links now accept the `executive` category (`src/ui/GameScreen.tsx`). Career projections show an honest empty tab. Phone layout stays single-column at 390px on the shared card surface.
- Evidence: `packages/engine/src/budget/fiscalDirectives.test.ts` (8 tests: step/queue, convergence, ramp replacement, small-move landing, unknown-field guard, spending, rejection refunds, save/reload), `packages/engine/src/hos.test.ts` tax test updated to the phase-in trajectory, `src/game/executiveControls.test.ts` (availability, queueing, rollback, save/close/reload), `src/ui/ExecutiveControls.test.tsx` (live-projection tab, card execution, empty career tab, phone CSS). Focused runs: 36 engine, 4 session, 4 UI tests pass. No full verify/typecheck/build run here; owed to the shared scheduler.
- Limits: full policy proposal/sponsorship/debate/enactment/rejection/expiry lifecycle, ministerial order issue flow (#105 children), and budget/approval/election consequence surfacing remain open under #65. No physical-device claims; Linux tests only.

## Native trace-capture checkpoint, 2026-09-25 (#281 partial / #117)

- `captureNativeTurnTrace` records Native phases, observed shared-stream RNG
  states with replay-verified draws and country-scoped domain mutations through
  the public `advanceTurn` observer. It does not change the turn outcome.
- Against the pinned AHDGame fixtures, comparison fails closed at
  `input.canonicalInputSha256`. There is no normalized input, field map or
  phase alignment yet. No cross-engine parity is claimed. Remaining acceptance
  is listed in [AHDGame differential traces](AHDGAME-DIFFERENTIAL-TRACES.md).

## Differential trace-contract checkpoint, 2026-09-15 (#279 / #117)

- The engine-neutral trace contract records pinned engine identity, normalized
  input provenance, ordered phase snapshots, RNG observations, resource
  mutations, elections, budgets, policies, player consequences, and declared
  Native adaptations in deterministic JSON.
- Validation fails closed on malformed values and unordered or duplicate phase
  indexes. Comparison is exact by default and reports the first divergent phase
  and field. Numeric tolerance requires a measured, justified per-field rule;
  missing branches, RNG, status, and identity fields cannot be tolerated.
- This contract is infrastructure only. It does not compare Native with itself
  or claim AHDGame parity. #280 adds source-owned AHDGame exporter PR #1901
  and pins real 1953 US and 1979 UK Mongo phase traces. Their RNG state remains
  explicitly unobservable and fail-closed. #281 must capture Native and run
  representative cross-engine gates after the upstream exporter lands.

## Integration checkpoint, 2026-09-10 06:18 UTC

- Engine import/session: `0c8e7ae`; UI components: `8314d8d`; native storage: `16e4c9a`; mechanics audit: `b964028`.
- Local integration: production frontend build, 7 session/worker tests and 17 component tests pass. Native storage: 10 tests pass after replacement-path review.
- Real Chromium smoke at 390 x 844: create 1953 US world, donate personal cash, advance, save, reload the app, resume and advance again. Passed with no browser errors or horizontal overflow. This uses the actual worker and browser QA persistence, not a mock world. Native invoke and iOS lifecycle are still unverified.
- Screenshot inspection found rate formatting wrong because the display expects percentages while the engine supplies fractions. UI correction is in progress.
- Supported-world replay, mobile UI corrections and iOS worker feasibility are active independent slices. No paid build was started.

## Follow-up checkpoint, 2026-09-10 11:50 UTC

- Production bundle: 5 integrated browser smoke tests pass. They cover meaningful action/turn/save/relaunch, corrupt-save recovery, duplicate-click turn protection, autosave and injected storage failure preserving the preceding save, and a visible recovery screen when worker startup is denied.
- Regression batch: 740 engine tests, 41 content tests, 7 session/worker tests, 28 UI tests and 10 native storage tests pass. Rust clippy and formatting pass. Long simulation suites were not repeated.
- All 21 imported era/country combinations pass scripted action and save/reload replay. 126 checkpoint hashes match the pinned AHDClient oracle. See [world validation](WORLD-VALIDATION.md); this does not establish AHDGame parity.
- Rate formatting and keyboard/form/focus behavior are corrected. A 390 x 844 running-world screenshot has no horizontal overflow. Native visual comparison remains open.
- A source AST scan over 354 non-test engine/content files found no direct `Math.random` references. Direct math references: pow 19, sqrt 12, log 7, exp 3, hypot 5. This count is not proof against arbitrary computed aliases or float drift.
- The cutoff has passed with 1.0.0 withheld. No iOS build or paid minutes were used. The candidate remains version 0.1.0 pending mechanics, interchange and device gates. See [iOS runtime gate](IOS-RUNTIME-VALIDATION.md).
- Hub board clearing and population remain pending supported card archive/clear operations. The project-scoping and archive issues are filed in the separate private Hub repository. This document is the current detailed execution record; it is not a claim that the Hub board has been updated.

## Save hardening checkpoint

- Main integration CI completed successfully before this batch.
- Player-image save validation now uses the same reference upload limits as
  world creation: 2 MB for a portrait and 4 MB for a profile header. A saved
  portrait that creation would reject also fails closed on import (#242/#44).
  The public save-load test was red before the fix and green after; the
  historical v42 projection suite remains 15/15 green with this workspace's
  content package. This is local contract evidence, not device durability.
- Native validation now extracts metadata without allocating a second world tree. A bounded local synthetic listing fell from 180 to 115 ms and peak process memory from 46,336 to 19,220 KiB. See [storage evidence](SAVE-STORAGE.md); no phone performance claim.
- Removed the full save-list rescan from each autosaved action/turn.
- Added explicit delete/cancel controls, failure handling and disposal of a deleted active session. Eight production-browser smoke tests and 11 Rust correctness tests pass; the manual memory profile is separate and ignored by CI.

## Authentic save interchange checkpoint

## Current Client/Game SP interchange contract checkpoint, 2026-09-15 (#300 / #122)

- Current AHDClient `6c9ee98ce1331c24042bb48628839f6b3997dde4`
  `world.json` is launcher metadata, while AHDGame
  `d4baf899fd8bd529099f03d7410807143604e2e5` owns durable gameplay state in
  the world-home Mongo database. Neither is relabeled as a Native save.
- The machine-readable contract inventories launcher metadata, gameplay,
  identity and history mapping work, fail-closed unknown collections, and the
  mandatory exclusion of Mongo runtime files, authentication and secrets.
  Hash fields are explicitly declared metadata until exporter slices verify
  them against canonical bytes; parsing does not claim cryptographic trust.
- Both transfer directions remain `contract-only`. #301 through #304 own real
  exporters, adapters, continuation evidence and exact player-facing claims.
  Historical schema-v42 compatibility remains separately tracked in #116.
- Collection integrity prerequisite (#302, partial): the public
  `verifyCurrentSpCollectionHashes` check now rejects a declared digest that
  differs from `JSON.stringify` of its collection documents. A red public
  contract test became green and the five focused snapshot tests pass. The
  parser still reports `contract-only`; source export, ruleset/content identity,
  field mapping and turn continuation are not implemented by this check.
- Metadata drift fix (#122, partial): `CURRENT_SP_PROVENANCE.native` had a
  pinned `schemaVersion: 44` while the engine was at `SCHEMA_VERSION` 48. The
  contract now reads `SCHEMA_VERSION` from `world.ts` and a contract test
  asserts equality, so the advertised schema cannot drift again. Transfer
  directions stay `contract-only`; no save semantics changed.

- Save hardening PR #5 passed CI and merged.
- Minted a real schema-v42 fixture using clean AHDClient source at `c5017542c860f5f94b7d4b4d5cfea2939b28995d`. Compressed fixture and SHA-256 provenance are committed; no version relabeling was used to create it.
- Twenty-three contract checks pass for authentic load, deterministic continuation and the old reader's rejection of new schema-v43 saves. The actual import/turn/autosave/reload UI smoke also passes.
- This closes the missing-authentic-fixture evidence gap, not bidirectional save portability. No compatibility writer or silent downgrade was added. See [save compatibility](SAVE-COMPATIBILITY.md).


## Candidacy checkpoint

- Added party join/leave controls and real engine candidacy actions, with filing dates, action costs, availability reasons, candidate/winner names and 20-race pagination. Removed the old 40-race projection cap so open races remain reachable. The active player race appears first.
- TDD: two new session scenarios and six new UI scenarios failed against the previous implementation, then passed. Production build, 9 session/worker tests, 34 component tests and 10 integrated browser smoke tests pass.
- The new production smoke creates a real 1953 US world, joins the Democratic Party, advances to scheduled races, files, saves, relaunches, checks candidacy and withdraws. Existing save/deletion/error/concurrency smoke remains green.
- No engine formulas changed. Existing engine/content/Rust suites were not repeated locally for this adapter/UI-only batch; CI retains the full verify gate. No Codemagic build or paid minutes used.
- Next: complete an election-to-office scenario, expose necessary campaign/officeholder actions, and compare the resulting mobile screens against actual MP/SP references. Mechanics parity, bidirectional v42 output, and physical device validation remain release blockers. See [career evidence](CAREER-VALIDATION.md).


## Election-to-office checkpoint

- Two Muse agents implemented the legislature screen and genuine campaign replay/fixtures. The 1953 US campaign wins an Alabama House seat at turn 96. Exact final world hash matches a replay and the pinned historical AHDClient oracle; this is not current AHDGame parity.
- Legislature now displays held office, available policy proposals, bill sponsorship, chamber-specific vote totals and player votes. Sponsorship/voting availability follows existing office, chamber, phase, action-point and cooldown rules. Tax proposal controls remain outside this slice.
- The production browser imports the authentic turn-95 world, advances into office, sponsors a bill, advances to voting, votes, closes/reloads the app and retains the vote. No election result or seat was injected. A second smoke confirms an unelected player cannot sponsor. The pre-election fixture is about 46 MB uncompressed, useful for the eventual device performance workload.
- Validation batch: production build, 12 session/worker tests, 42 UI tests, fixture integrity and 12 browser smoke tests passed. After screenshot-driven tally/formatting refinements, the affected session/UI tests and both legislature smoke scenarios were rechecked. Routine fixture validation does not rerun the full campaign.
- Screenshot inspection corrected long floating-point display, duplicate availability text, live tally delay and completed Senate cards showing House totals. Closed bills omit voting controls. Layout follows AHDGame BillCard/BillVoteIndicator hierarchy; complete MP/SP visual parity remains unverified.
- No engine formulas, native storage or signing configuration changed. No paid build ran. Next gaps: campaign management depth, legislative effect/end-of-term scenarios, current mechanics drift and bidirectional save compatibility. See [playthrough evidence](CAREER-PLAYTHROUGH.md).


## Navigation, resource footer and repository presentation checkpoint

- Muse adapted the README structure and GitHub issue/PR templates to AHDGame conventions. Current capabilities, proprietary license and candidate/device gates remain explicit. Repository description/topics and private vulnerability reporting are configured.
- A source-backed inventory records the actual AHDGame destinations, conditional entries and footer resource controls. Navigation/footer functional parity is priority one in the standing rules. Market, corporation, union and other SP display gaps are not blanket deferred to MP.
- Nine destinations are reachable through a grouped mobile menu: basic Profile, Actions, Portfolio, Overview, Parties, Legislature, Elections, Banking and News. The existing quick tabs remain. Menu keyboard navigation, focus on selected pages and Escape handling work.
- News now filters local session records by country, date and category and opens an offline article. One source-cited session projection normalizes every engine producer with a stable ID, body and category while leaving absent relationship data explicitly unlinked. Country, party and election links open real destinations; event context remains non-interactive because Native has no event-detail route. Read and selected state is keyed by save slot, so characters with the same name in different saves do not collide. #78 remains partial until a real event destination and centralized player-flow verification exist.
- The persistent footer shows actual turn/date, processing/player-paced state and five resource controls with real data and links. Full income/action breakdowns, election projections/history and corporation strips remain open.
- Banking uses the existing deposit/withdraw actions. Portfolio shows real balances and stock holdings in their own currencies. Six finance contract scenarios cover US and UK savings, rejection atomicity, holdings and save/reload. No formulas changed.
- #313 wires the central-bank-held player savings projection into the turn:
  real-rate interest accrues each turn and credits every 12 turns. Optional
  pending and lifetime totals survive JSON reload. Private-bank-held savings
  remain exclusively owned by `bankingTurn`, preventing double payment.
  Credit, pensions, cross-border wires and integrated ordering remain #314-#317.
- Validation: production build, 18 session/worker tests, 63 initial UI tests and fixture integrity passed; a keyboard-focus regression was then added and fixed, bringing UI coverage to 64. All 12 pre-existing browser scenarios passed. The new banking/menu/footer flow passed after correcting its expected action-result message; the five core SP smokes also passed after the focus changes. Screenshot review at 390 and 320 pixels caught and corrected header label wrapping. Focused verification follows changes; full engine/content/Rust simulations were not repeated locally for this adapter/UI batch.
- No Codemagic build or paid minutes used. Current mechanics drift, bidirectional v42 output and physical-device validation remain release blockers. N04-N10 track the remaining navigation/footer features; this batch does not claim complete feature parity.


## Full feature depth checkpoint, 2026-09-10

- Politics: list-to-party and list-to-race detail, platform/leadership/roster, actual candidate tally shares, filters, politician directory and active-race links. Eligibility uses real party-switch/purge checks plus action costs. The UK 1953 starting Commons has vacant seats and no NPC roster; the UI preserves that empty state instead of inventing politicians. Campaign projections, election system completeness and full national/subnational career coverage remain open.
- Nation and world: real macro history, local-currency budget/revenue/spending/debt, enacted policy records, searchable nation directory with government/chamber metadata, and home region demographics/support/elections/office. Browsing another nation does not change the player country. US congressional labels are limited to US regions. Executive actions, detailed regional chambers and other world systems remain in progress.

## Ministerial order catalog checkpoint, 2026-09-15

- The exact pinned AHDGame order definitions are available for every authored position in Native's US, UK, DE, IE, JP and CN cabinet rosters. The inventory preserves source ids, names, descriptions, durations, metric paths, modifiers and scopes.
- Catalog classification resolves only the four national metric paths currently backed by Native. Unknown paths are blocked as `unsupportedMetric`, untargeted regional definitions as `regionalTargetRequired`, and unavailable defense orders as `defenseUnavailable:<orderId>` with named consumers; no missing metric is created from a default.
- Focused public-boundary coverage checks the six country totals, a literal source vector, every classification blocker and actual phase execution for every advertised supported order. The issue command and action pool remain in #261 and #260.

## Regional ministerial-order checkpoint, 2026-09-15 (#275 / #263)

- Active regional effects now accumulate by target region and exact existing
  metric, then use the same strength, per-metric cap, and scale as national
  orders. The phase never creates a region or metric from a fallback value.
- Missing targets, cross-country regions, and unsupported metric paths return
  stable blocker reasons. Expired orders remain inactive at the exclusive
  lifecycle boundary. Successful results expose the changed region ids.
- The existing region query projects a detached copy of recorded regional
  metric values. Focused coverage verifies application, cap, target rejection,
  phase order, expiry, save/reload, and projection. Defense consequences remain
  isolated in #276.

## Defense ministerial-order checkpoint, 2026-09-15 (#276 / #263)

- All 12 authored defense-position orders across US, UK, DE, IE, JP, and CN
  now have an evidence-backed consumer disposition in
  `docs/DEFENSE-MINISTERIAL-ORDERS.md`.
- The UK and German regional veterans orders use the authoritative regional
  unemployment metric path delivered by #275, including target validation,
  turn ordering, lifecycle expiry, and save/reload persistence.
- The ten national effects remain stable `defenseUnavailable:<orderId>` entries
  with their absent consumer named. The turn phase rejects them without
  creating metric state or recording an application. No generic public-safety
  value substitutes for a missing military, readiness, or appropriation store.
- Parent #263 is complete when #275 and #276 merge. The broader unit military
  pipeline remains outside this ministerial-order tracker.
- Resources: existing engine constants drive refresh/hoarding/cap and current-influence fund generation/tax details; disabled income phases are respected. Recent recorded balances are available. Office bonuses are shown as the imported engine actually implements them, not invented from MP rules. Full footer mechanics parity remains open.
- Performance: optional politics/world queries run only while visible. On the existing turn-95 fixture, embedding politics in routine responses had increased JSON payload from 174,384 to 2,797,081 bytes. On-demand queries reduce the final routine response to 194,264 bytes, including new national history and resource data. In a 15-sample Linux characterization, routine view median was 1.15 ms versus 1.01 ms at the baseline. This is view construction only, not worker transport, turn p95 or phone performance.
- Mechanics: reference-exact referendum variance and TFP basket/input wiring are integrated with independent vectors and public turn/save replay tests. Full referendum lifecycle, state-metric inputs and phase-order drift remain open. [Engine adaptations](ENGINE-ADAPTATIONS.md) records changes from the pinned import without rewriting its baseline manifest.
- Saves: engine `projectSaveToV42` (re-exported at `src/game/saveCompatibility.ts`) plus an exclusive-create local export CLI prove the authentic fixture, the Native-fresh keep-home extension, and pre-turn cash conversion. Corrupt input, overwrites, relabeled v43, and progressed national-politics loss are refused. The keep-home document is not the authentic mint. Full bidirectional in-app interchange remains a release blocker.
- Verification: production build; 41 session/query/save/CLI tests after focused eligibility-copy correction; 84 UI tests after country-label correction; 765 engine tests including the short referendum suite; career fixture integrity. The 13 existing browser flows passed, then both the extended US directory/banking flow and new UK detail/economy/policy/world/resource/reload flow passed after correcting the empty-UK-roster expectation. Screenshot inspection drove the country-specific label fix. No long career generator, native rebuild or paid build was repeated.
- Next batch is already active: real market trading, deeper legislative proposals/bills, and offline help/presentation settings. Hub project-filter/archive issues remain open; supported board clearing is still unavailable, so no Hub status-update claim is made.


## Actions and presentation checkpoint, 2026-09-10

- The preceding feature-depth batch merged as PR #10 (`b1cedbf`); its full verify CI passed.
- Stock market now has searchable country/company lists, actual company detail and home-currency buy/sell. Successful trades feed the next turn's source-backed order-flow price multiplier, and the market records per-turn live price history through save/reload. Foreign quotes remain browsable, with trading held where quote and player cash currencies differ because the imported action has no FX settlement. Order books and corporation management remain open.
- Bills and proposals adds tax-rate selection, reference policy descriptions, chamber-specific bill lists and selected-bill details. The genuine elected save retains its cooldown, then sponsors income tax at 38% and preserves that rate on reload. General policy-level selection remains unavailable because the imported action has no corresponding parameter.
- Offline Help and device presentation settings are available from home and the game menu. Large text and reduced-motion preferences survive reload; storage failure preserves the current-session selection and reports the persistence failure. At 320 x 568, large-text header/footer layout leaves at least 160 pixels for content. Resources remain reachable in a horizontal footer row.
- Help now preserves its offline guide while restoring allowlisted wiki, in-game guides, about, Discord, supporter, contact and status destinations with visible network-required labels. Public destinations route through the Tauri opener on desktop and mobile instead of relying on WebView `target=_blank`. Account settings, feedback, the suggestions board and Quick Suggest remain inside the persistent AHDGame multiplayer surface, where AHDGame owns authentication, screenshot capture and mutations. Native cannot inspect that cookie session and stores no multiplayer credentials, so it does not expose account-dependent controls in offline Help. N09 remains in progress until the centralized native reachability gate passes.
- Pure presentation helpers are separated from engine runtime imports. This brought the initial integrated main bundle from 731 KB to 349 KB without moving simulation onto the UI thread. This is a bundle-size observation, not device performance evidence.
- Independent next work covers UK electoral careers, referendum lifecycle and bidirectional v42 compatibility. No paid build has run; mechanics, save interchange and physical-device candidate gates remain open.
- Validation: production build, 71 session/query/preferences/save/CLI tests, 109 UI tests and fixture integrity passed. The production-browser batch passed 17 of 18 scenarios and exposed the player-chamber default bug. After fixing it, all four affected market/legislature browser flows passed, alongside 9 focused session/query and 46 UI checks. Existing engine/content/native code was unchanged in this batch, so those broader suites were left to CI. No campaign fixture regeneration or paid build ran.

## Help reachability checkpoint, 2026-09-16

- Centralized native reachability gate for issue #82 passes: `src/ui/HelpReachability.test.tsx` renders every one of the 8 reference help destinations with a network-required mark, routes each through the native opener, pins all 8 URLs against the AHDGame `HelpDropdown` constants, and covers the opener-failure alert. The Rust allowlist test now asserts all 8 exact destination URLs and rejects raw URLs plus `feedback`/`account` identifiers.
- Focused evidence only: 10 UI tests (HelpReachability, HelpPanel, SettingsPanel), 4 preferences tests, and 1 Rust allowlist test passed. No full typecheck, verify, engine suite, Playwright, native build, or paid build ran; those belong to CI and the device gate.

## Referendum campaign checkpoint

- Campaign status transitions now include baseline and poll snapshots and recompute the canonical cohort/spend result before voting. A timer-only implementation was not accepted because it would have resolved stale stored values.
- The pure soft-cap, turnout-weighted aggregation, diminishing-spend and bounded poll-history formulas match the pinned AHDGame source. Native lacks the granular electorate substrate, so new campaign snapshots use that source's single-cohort fallback. This does not establish parity with fully populated UK cohorts.
- Public turn/save tests cover the campaign boundary through resolution, one transition per turn, absent closing dates and stale scalar values on both sides of the pass threshold. Complete serialized worlds match at every replay checkpoint after a mid-campaign reload. The local short engine suite passes 795 tests and engine typecheck passes.
- Request/grant actions, campaign spending/ground-game writers, consent bills and actuation remain incomplete. Passed votes still wait at actuation. This closes a bounded calculation/lifecycle slice, not M02 as a whole. No paid build, long simulation or UI/native rebuild was run for this engine slice.


## UK initialization checkpoint

- Added an explicit engine `historical` initialization option for the source-backed 1953/1979 UK synthetic winner roster. Regional magnitudes and largest-remainder allocation preserve 625/650 Commons seats and allow government formation on the first turn.
- `founding` remains the default. Historical UK politicians consume the shared creation RNG even when playing another country, so changing the app default is held for a controlled rollout with cross-world replay evidence. The new-game form has not changed and loaded saves are never reseeded.
- Nineteen focused UK/politician tests and engine typecheck passed. Tests include complete-world equality for omitted versus explicit founding and exact historical save/reload, alongside seat totals and government formation. Full regional constituencies, campaign eligibility and a UK career playthrough remain open. No paid build or long simulation ran.


## Offline discovery checkpoint

- Local search now opens the exact profile, politician, party, nation, company, election or bill destination. Country-scoped results follow available detail adapters; foreign nation/company browsing never switches the played country. Broader region/seat/commodity/currency/bond search remains open.
- Queries run on demand in the worker, return at most 30 ranked matches with a total count, and preserve complete saved-world state. The UI ignores stale responses, retries failures and transfers focus to the selected destination.
- Production build, 73 session/query/save tests, 111 UI tests, fixture integrity and all 20 production-browser scenarios pass. Browser coverage includes offline UK search/navigation and actual bill/election/politician selection from the genuine elected US save. No engine formulas changed in this slice and no paid build ran.

## Party founding checkpoint, 2026-09-10

- N04/U05: Start a party is wired through the grouped menu and party list into
  the worker action flow. Actual membership, costs, cooldown and charter records
  refresh after founding and survive save/reload.
- Fixed the double funding threshold in the imported dispatcher; founding costs
  one 100k charge and failed eligibility checks leave accounting unchanged.
- Validation and remaining source differences: [party management](PARTY-MANAGEMENT.md).
  Single-founder immediate ratification is not AHDGame's full charter lifecycle.

## Party platform comparison checkpoint, 2026-09-15

- N04 detail (#143 visual): the Parties detail opens with a phone-first,
  code-native platform comparison drawn from the saved projection. One compass
  marker per party at its real authored axes, a text table repeating the same
  numbers, and one-tap chips driving the same selection as the dropdown.
  Offline, no invented logos or vote figures. Read-only: editable platform
  actions, multi-founder flow, coalitions and charter depth stay open under
  #59; broader imagery #143 stays open.
- Source: `src/ui/PartyPlatformComparison.tsx` wired in
  `src/ui/PoliticsPanel.tsx`; visual reference record in [UI reference](UI-REFERENCE.md).
  Tests: `src/ui/PartyPlatformComparison.test.tsx` plus new
  `PoliticsPanel` chip/dropdown-sync and empty-projection cases.
- Integrated gate: 81 root tests, 114 UI tests, fixture integrity, engine
  typecheck and 7 focused action-accounting tests passed. All 21 production
  browser scenarios passed, including founding and reload at phone size.

## Phase-order corporation/macro checkpoint, 2026-09-10 15:02 UTC

- M04 remains in progress. This checkpoint closes only the corporate-revenue to
  macro-growth edge. Campaign spend still reaches the tally next turn. Other
  Native tail clusters stay where they are. TFP missing-input and remaining
  phase-order drift are unchanged.
- Registry now runs RNG-free `corporationTurnPhase` immediately before
  `macroCountryTurnPhase`, matching AHDGame `e364c0495`. Public
  `advanceTurn` tests cover same-turn snapshot visibility and save/resume
  byte identity. [Phase order evidence](PHASE-ORDER-DEPTH.md).
- RNG-free is not a no-behavior-change claim. Same-turn macro `sectorSignal`
  is the intended change and flows into later readers of `growthRate` such as
  `centralBankChairTurn`. Corporation now taxes before same-turn bill
  enactment and tax-rate phase-in, which matches AHDGame order. No other
  moved-over phase reads corp books.
- Validation: engine typecheck passed. The integrated branch including party
  founding and v42 projection passed 817 engine tests across 80 files. The
  explicit weekly-date/phase-timing assertion was updated for the intended
  source-backed move and passed separately (one selected test; 47 skipped).
  No historical world-hash goldens or career fixtures were regenerated.

## Native save isolation checkpoint, 2026-09-10

- S06: independently opened stores now claim separate temporary files for each
  save. Concurrent writes cannot share temporary bytes; final replacement
  remains atomic and concurrent completed saves resolve to the last rename.
- The original writer failed the separate-store concurrency regression at
  rename. The replacement passed all 13 native storage tests, with formatting
  and clippy clean. One manual profiling test remains intentionally ignored.
- Startup never deletes or promotes temporary files. [Recovery evidence](SAVE-RECOVERY-DEPTH.md)
  distinguishes pre-rename failures from a directory-sync failure after rename.
  Cross-process ordering and physical phone lifecycle validation remain open.

## Sovereign bond interface checkpoint, 2026-09-10

- N07/finance: domestic bond purchases and sales now run through worker actions,
  with real issuer, coupon, maturity, float and player-holding details.
- #305: sovereign coupons and matured principal now settle in the bond's
  authoritative denomination. Home-currency flows retain the legacy `cash`
  projection; foreign balances persist in optional per-currency player state.
- #306: sovereign buy/sell now debit and credit the balance named by
  `bond.currencyCode` in one atomic action transition, with insufficient
  denomination balance refusing untouched. Corporate lifecycle by #307/#308,
  and phase alignment by #309.
- The genuine elected-save flow retains the selected issue and remaining units
  across trades and relaunch. [Bond evidence](BOND-MARKET.md) records the exact
  local pricing contract and the remaining dealer-pool/FX mechanics gaps.
- Validation: 84 root tests, 116 UI tests, fixture integrity and build passed.
  The production build with the corporation/macro correction passed all 22
  browser scenarios, including bond trade/relaunch at phone size.

## Cross-border wire checkpoint (#316)

- Finance: personal wires now settle cross-border through the worker action.
  The transfer currency travels with the transfer and the recipient is
  credited in the same currency bucket, so there is no FX conversion, no fee
  and no delayed settlement, per the authoritative AHDGame `e364c0495`
  `src/app/api/characters/[id]/wire/route.ts` forex-enabled branch. Home-
  currency legs move `cash`; foreign legs move
  `currencyBalances.personal[ccy]` on the sender and on the recipient
  (new optional field on `Politician`, absent means zero, old saves omit it).
- Eligibility, denomination selection, per-currency balance debits/credits,
  anchor-denominated quota (amount / sender-home rate), insufficient-funds
  refusal, single-transition atomicity, save/reload and determinism are
  covered at the engine seam (`packages/engine/src/finance/wireTransfer.ts`)
  and through `executeAction`/`GameSession.act`, including forex-off
  same-country fallback, fail-closed missing rates and turn-phase ordering
  (turns preserve wire balances; quota resets after the 24-turn window).
- Exact residuals: no per-transfer ledger rows or recipient inbox
  notification (solo has no financial-tx log or MP inbox; news only); the
  24-turn new-character barrier is not ported (single persistent player, no
  multi-account surface); currency codes match exactly with no silent
  normalization. No engine formulas changed.
- Validation: 20 focused engine wire tests and 4 new session wire tests
  pass alongside the 7 pre-existing session finance tests. Full typecheck,
  full suites, build and verify belong to the shared scheduler/CI.
- UI surface (2026-09-18, worktree `muse/fx-trade-next-20260918`, #77 FX
  settlement / #76 wallets): Banking gains a Wire funds card projecting
  `FinanceView.wire` (`src/game/types.ts`, `projectWire` in
  `src/game/session.ts`, card in `src/ui/FinancePanel.tsx`). Recorded home
  cash plus recorded foreign personal buckets, recorded politician
  recipients (domestic first, cross-border options disabled while
  `foreignExchange` is off), and the recorded anchor quota remainder; the
  selected currency travels with the `wireTransfer` action untouched, so no
  conversion is quoted or applied. Evidence: `src/game/wireView.test.ts`
  (3 projection tests: fresh-world balances/recipients/quota, foreign
  buckets, post-wire quota + save/reload) and
  `src/ui/FinancePanelWire.test.tsx` (8 panel tests: no-conversion copy,
  home/foreign send params, local input/balance rejection, empty
  recipients, forex-off disabling, absent-projection unavailable text,
  loading/error hiding balances). Engine exports `DAILY_WIRE_CAP_ANCHOR`,
  `WIRE_QUOTA_WINDOW_TURNS`, `WireTransferResult` for the projection; no
  engine formulas changed. Order books, dealer spreads, trade routes,
  corporate issuance, and default lifecycle remain open under #77. No
  physical-device claims; phone/desktop validation is jsdom + layout
  styles only.

## Campaign timing checkpoint, 2026-09-10

- M04: campaign income, maintenance, media support and existing investment now
  settle before vote accumulation. The spend interval resets after the tally,
  and a resolving race receives its final campaign tick before archival.
- Source-backed order and focused red-to-green final-turn/save-resume evidence:
  [campaign timing](CAMPAIGN-ORDER-DEPTH.md). Decaying spend stock and the
  imported non-reference subsidy/investment algorithms remain explicit gaps.
- Integrated engine gate: 820 tests across 81 files and engine typecheck passed.
  Frontend gate: 84 root tests, 116 UI tests, production build and fixture
  integrity passed. Historical world-hash goldens were not regenerated.
- All 22 production browser scenarios passed, including the genuine election
  win, legislation, party founding, share/bond trading and save/relaunch flows.

## Caucus action depth checkpoint

- The Nation menu and Parties page expose actual party-scoped caucuses:
  founding, initial tax, treasury/member roster, leave and join. Queries run
  on demand; successful actions refresh and autosave through the worker.
- Repaired the existing public founding contract: a 25k charge now needs 25k
  on hand, not 50k. Invalid tax values reject atomically. This fixes Native
  accounting without certifying its inherited charges against AHDGame.
- [Caucus evidence](CAUCUS-MANAGEMENT.md) records the genuine turn-99
  create/leave/rejoin/relaunch flow and still-missing chair, whip, health,
  recruitment, disband and tax-edit mechanics. U05 and N04 remain in progress.
- Policy-level enactment is held as a draft until per-law fiscal baselines,
  replacement/repeal accounting and graded metric effects have source-backed
  implementations. War dependencies and regional browsing are active next
  slices. These do not change the paid-build hold or release criteria.
- Validation batch: 92 app/session tests, 120 component tests, production
  build, fixture integrity, engine typecheck and all 23 browser scenarios
  passed. Fifteen focused founding-accounting tests and 58 related
  action/membership/head-of-state tests passed. Full engine simulations and
  unchanged Rust checks were not repeated for this bounded action/UI slice.

## Mobile navigation correction

The owner rejected the desktop-style top banner and scrolling top tabs.
They are removed. Primary navigation now sits at the bottom; the complete
hierarchy and End Turn, Save and Exit controls live in a left-side drawer.
The five resource controls use one compact row above navigation, with full
values and breakdowns retained. Content reserves the actual measured footer
height, and resource details scroll above it.

The drawer is modal, traps focus, blocks background interaction and shows
turn/save outcomes directly. Route selection closes it and focuses the page.
[Mobile navigation](MOBILE-NAVIGATION.md) records the interaction and device
limits. Existing gameplay and the full roadmap remain in scope; no mechanics,
authentication, signing or paid-build behavior changed in this interface slice.

Validation: production build, 92 app/session tests, 123 UI tests and fixture
integrity passed. All 25 browser scenarios are covered by passing results:
21 passed in the broad batch, and the four old header/heading-dependent
checks passed in an eight-scenario focused follow-up. The final 39 affected
UI tests and build also passed. Screenshots at 320px and 390px show the new
footer and drawer; large-text 320px/568px flow passes. Engine and Rust tests
were not repeated for this UI-only change. Paid build usage remains unchanged.

### Native account, Ask and multiplayer correction

The phone navigation now gives Ask a permanent bottom destination and reduces
drawer density with accessible Nation and World disclosures while retaining
every route and turn/save control. Ask recognizes the current AHDClient secure
session cookie and opens the same native authentication broker instead of the
Ask homepage. Multiplayer enters the Native React screen exclusively; full-site
gameplay is not embedded as an alternate mode. On mobile, authenticated
multiplayer requests use the platform WebView cookie jar and a pinned,
allowlisted native relay, so the feature no longer depends on a second desktop
WebView that mobile builds cannot create.

Validation includes focused component tests at phone width, Rust cookie and
transport guards, desktop clippy, and an Android-target compile of the mobile
transport. Physical-device sign-in and cookie-sharing acceptance remain open
release checks.

## War mechanics prerequisite checkpoint

The control-track mobilization ramp now matches the pinned source: a 0.4
opening multiplier rises to 1 over 50 turns. Unknown ages retain the legacy
full multiplier. Seven public turn/save scenarios cover exact phase values
and complete mid-ramp resume identity; three cases failed before the fix.
[War depth](WAR-PARITY-DEPTH.md) records the remaining unit/combat, supply,
command, declaration/treaty and peace dependencies. No declaration UI is
exposed over the inherited GDP proxy. M03 remains in progress and full war
parity remains a release blocker.

Validation: 835 engine tests, 54 focused/related war and settlement checks,
and engine typecheck passed. Existing war golden assertions did not change;
no long-world fixture was regenerated. This engine-only slice leaves the
new side drawer and bottom navigation unchanged.

## Regional browsing and mobile follow-through

The drawer's Regions destination opens a country-scoped directory and saved
regional details. The directory is collapsed by default and closes on selection,
so the selected region is immediately accessible on a phone. Filtering and paging
preserve the open directory across worker requests. Browsing never changes the
player's country or home region and does not write world state.

US and UK views retain their actual saved office, chamber and election data.
The player's current seat is included only when saved election history identifies
its region; empty or missing records are shown explicitly. Regional governance,
constituency geometry and executive actions remain outside this read-only slice.
[Regional scope](REGION-DEPTH.md) records those limits. The UI reference and
navigation inventory now make the rejected top-bar layout explicitly obsolete.

Integration validation: `npm run verify` passed with 103 app/session tests,
127 UI tests, production build and fixture integrity. Final panel tests (4)
and build passed after the directory toggle fix. The new US/UK offline
browse, save, reload and home-preservation browser flows passed, as did the
320px/390px bottom navigation checks. The directory touch target is at least
44px. No engine changes, repeated Rust checks or paid signing build were needed for this display slice.

## Mobile overview and readable detail checkpoint

U03/U08 and N04/N05: the overview has grouped metrics and real destination
shortcuts. Party rosters are searchable and paginated rather than truncated;
regional chambers and secondary detail use counted disclosures. Bottom navigation
resets reading position, focuses the destination and marks the active parent
section. The player's current party membership is now present in its recorded
roster query. [Mobile readability](MOBILE-READABILITY.md) records behavior and units.
Nation browsing now opens from a collapsible directory near the top; foreign
country deep links remain accurate without switching the player country.
Full navigation, mechanics and physical-device parity remain in progress.

Validation: the integration batch passed 104 app/session tests, 142 UI tests,
production build and fixture integrity. Final overview/nation checks passed
13 tests. The browser broad batch passed 29 scenarios; two new overview tests
needed the documented engine GDP units rather than local budget values. The
final eight-scenario follow-up passed, including both corrected checks and the
new nation-directory case. All 32 scenarios have passing coverage across the
batches. Final narrow/large-text label checks passed four scenarios. Screenshots
were inspected at 320px and 390px. No engine formulas changed, and unchanged
Rust/engine suites or paid signing builds were not repeated.

## Character-first port correction

The owner clarified that existing game behavior and display hierarchy are binding
across the entire port. The national Overview landing from the previous UI
checkpoint is superseded. New and resumed games open Profile, matching AHDGame;
Actions is labeled consistently and national details remain under Economy.
Saved portrait/bio, standing and finance sections now replace the basic summary; the full profile and underlying player mechanics remain incomplete. Source-backed profile,
action and conditional-navigation slices now lead UI work in
[behavioral parity](BEHAVIORAL-PARITY.md), with validation evidence there.

## Shared rules checkpoint

[Shared rules](SHARED-RULES.md) records the Game-owned Fundraise package,
immutable source comparison, actual Native session/save and browser action
checks, and the controlled cost-change exercise. M07/M08 remain in progress:
RPG stats, campaign currency context, dynamic actions, complete source inventory,
automatic consumer updates and save ruleset policy are still open. The
[character action parity audit](CHARACTER-ACTION-PARITY.md) now records the 11
ActionsHub entries per-action at `cd99794` (issue #91, criterion 1); it changes
no formula and does not claim runtime parity. Current
AHDClient desktop SP already runs Game's packaged server; its provenance fix is
[AHDClient #56](https://github.com/Egg3901/AHDClient/pull/56).


## Private feedback preview, 2026-09-10

The owner authorized a development 0.1.0 feedback build for iOS, Windows and
Android. Codemagic is iOS only, with the existing manual 20-minute cap and
private signing rules. This supersedes the earlier blanket build hold for
this review candidate; full feature/mechanics/save and device acceptance
gates still apply to a 1.0.0 release. Track delivery in [#124](https://github.com/Egg3901/AHDNative/issues/124)
and use the [review walkthrough](REVIEW-WALKTHROUGH.md).

Local app tests and production-browser smoke precede paid signing. The
Windows portable executable and Android ARM64 debug APK use separate
[local build scripts](WINDOWS-ANDROID-REVIEW-BUILDS.md). Actual device launch,
save/reopen, lifecycle and performance results must follow each build.

Delivery is complete: iOS 0.1.0 (1.6) from `fc87a991` processed as Internal Only
and is attached to Owner review; local Windows and Android packages are built.
The [exact source verification](https://github.com/Egg3901/AHDNative/actions/runs/34533476660)
and all 36 integrated production-browser smoke scenarios passed. The owner has
given initial positive visual feedback while reporting remaining UI gaps; no
specific device, full playthrough or performance measurements were supplied.
Detailed results remain in [#124](https://github.com/Egg3901/AHDNative/issues/124).

## Issue reconciliation

GitHub open issues include partially delivered work, verification gates and
deferred MP scope. The parity audit was filed after most earlier feature PRs,
so its issue count measures remaining acceptance scopes rather than all work
performed since bootstrap. The reconciliation records 55 partially delivered issues, 34 whose requested
capability is not implemented, two physical-device gates, two deferred MP
issues, and parent #28. All 94 remain open; nine earlier issues are closed.
Each open child has a status label, current evidence and remaining criteria.
Parent #28 records these counts and distinguishes the original 92-child audit
from later build findings. These counts are scope counts, not effort percentages. Roadmap rows U05/U07/Q02/I01 above were stale and are now marked done
for their bounded acceptance; A01/A02 reflect completed packaging with device
checks outstanding. Future batches must update issues and roadmap rows as
part of completion, as required by AGENTS.md and the PR template.

### Active player resources and visual follow-through

The #30/#31/#32 implementation and its validation are documented in
[Player resource parity](PLAYER-RESOURCE-PARITY.md). All three are verified complete in PR #145 (`f9b1a9e`); their issues are closed. The active P0 batch remains tracked in
[milestone 1](https://github.com/Egg3901/AHDNative/milestone/1).

Owner visual feedback adds [the globe landing page](https://github.com/Egg3901/AHDNative/issues/142)
and [reference imagery across screens](https://github.com/Egg3901/AHDNative/issues/143).
These require rendered comparison with AHDGame/AHDClient, beyond matching colors
and functional controls. The shared React/Tauri app and TypeScript engine remain;
Rust implementation stays conditional on representative device profiling.


## Windows 0.1.1 visual review candidate

The owner requested a more ethereal space landing, a minimal globe and an
alignment pass, followed by another private Windows preview. Muse implemented
the globe and refined its lighting; root integrated the Actions and inbox
slices and reviewed rendered phone/desktop layouts. This candidate includes:

- #142: offline spinning geography, Fraunces title, restrained starfield and
  nebula backdrop, responsive entry controls and reduced-motion handling.
- #56: Influence/Fundraising/Intelligence categories with eligibility counts,
  projected costs/reasons, and category-preserving Profile/footer links.
- #85: generated local notifications, five-item preview, inbox/read/delete,
  safe local links and persisted app-owned metadata. Native history is retained;
  old AHDClient writers may discard the inbox metadata.
- The merged #30/#31/#32 player-resource corrections from PR #145.

Local validation: shared-rules checks, frontend typecheck/build, 153 app/CLI
checks (one error-contract regression corrected with a focused rerun), 187 UI
checks, career fixture validation and integrated production-browser flows.
Release evidence records the final source revision and private delivery outside
GitHub. No Codemagic build is part of this batch. Windows execution, device
performance, broader imagery #143 and unresolved mechanics remain open.


### Verified Windows review checkpoint, 2026-09-11

PR [#146](https://github.com/Egg3901/AHDNative/pull/146) merged as `a9bbd05b`.
Its source `79c0fd6` passed the complete verify gate, including all 42
production-browser scenarios and Rust fmt/clippy/tests. #56, #85 and #142 are
closed with source and test evidence. Five of the original ten P0 issues are
now complete: #30/#31/#32/#56/#85. The globe request #142 is additional.

Windows 0.1.1 was cross-compiled locally from `79c0fd6` and delivered privately
outside GitHub. No Codemagic minutes or iOS/Android rebuild were used. Actual
Windows launch and named-device acceptance remain #124. This remains a
feedback preview, with broader imagery #143 and mechanics still open.

GitHub scope after closure: 92 open and 15 closed issues. Open does not mean
untouched. The Hub board remains blocked by LakesideHub #4; no Hub sync is
claimed. The remaining original five (#39/#40/#67/#68/#92) and the related live
election distributor #141 continue under source-backed review.


### Next owner priorities and handoff, 2026-09-11

The owner requires the canonical AHD logo and platform icons (#148), plus
AHDClient-equivalent authentication (#149) as active work. Auth is not buried in the
deferred MP presence/countdown milestone: reuse the actual account/session
contract while preserving the offline SP boundary. Full MP gameplay remains
later. Inspect reference behavior before implementing either surface.

Six reviewed local slices (#39/#40/#67/#68/#92 and the related
#141 distributor) are preserved with `work: review` labels. Their agents have
finished bounded implementation; root integration and acceptance are still
required. They are excluded from Windows 0.1.1. #88 records its merged metadata
and invented-action corrections. Its remaining atomic player/NPC accounting
and Profile/party/notification/save/next-turn contract is now covered at the
public action and session boundaries.
#96/#97 now explicitly record the distributor's missing country/primary inputs
and lifecycle dependencies. The logo is a child of the still-open imagery #143.

A handoff audit updated the affected issue bodies/checklists and confirmed that
#30/#31/#32/#56/#85/#142 remain closed. Do not rerun paid builds for this
handoff or claim local mechanics branches are already shipped.


After adding the two explicit owner requirements, GitHub scope is 94 open and
15 closed: 55 partial, 33 not delivered, two device gates, two deferred MP and
two trackers. Six unmerged implementation slices carry `work: review`.
Account auth #149 is active; only the remaining MP integration in #86 is deferred.


Source inspection of AHDClient `378126dc` confirms live-site authentication:
desktop opens a dedicated online WebView, mobile navigates the main WebView,
and AHDGame owns login and the cookie session. Preserve persistent WebView
storage, auth navigation handling and isolation from native/local-save powers.
SP has no network or account requirement. Native currently has no auth path;
#149 needs runtime validation of the existing flow, not a second identity store.


## Election race hub and primary views checkpoint

N04/N05: the election detail now carries a derived race phase and a Filing,
Primary, General and Results stage ledger whose states come from the persisted
record, not a stored flag. The Elections race list groups by phase, active
primaries render their counted party ballots and standings from
`primarySnapshots`/`primaryVotes` (or the recorded `primaryResults` nominees),
and resolved winners link to the politician directory. Profile career-history
rows link back to the resolved race. No election formula changed.

Evidence: `src/game/politics.test.ts` derives phases across the lifecycle and
advances a live US primary through `advanceTurn` into recorded nominees;
`src/ui/PoliticsPanel.test.tsx`, `GameScreen.test.tsx` and `ProfilePanel.test.tsx`
cover the stage grouping, primary ledgers, phase label and winner/profile links;
`smoke/elections-stages.spec.ts` opens a race detail, saves, reloads and reopens
the same race with its stage ledger intact. Non-US primaries stay out of scope
under #96 and the reference campaign projection stays open under #68.



## Founding election lifecycle checkpoint (#223)

N02/N08: the full pre-iteration lifecycle is ported behind a strict world-setup
opt-in (`NewWorldOptions.foundingElections`, default OFF). The opt-in stamps
`WorldMeta.preIteration` / `preIterationTurns` once via the idempotent
`stampFoundingMarker` (never reopens a completed phase); the dedicated bounded
`runFoundingSweep` (`packages/engine/src/elections/founding.ts`) seats one
real cycle-0 race per in-scope series through the ported founding branch in
`pickNextCanonicalCycle` (24-turn primary + 24-turn general, era-gated types
skipped, capped at `MAX_FOUNDING_RACES`). The per-turn planners deliberately
bypass founding while the marker is active, so routing creation through them
spawns zero races and deadlocks the phase frozen forever; the sweep calls
`pickNextCanonicalCycle` directly and writes no candidacies. The
`foundingCompletionPhase` runs `detectFoundingComplete` (the
`src/lib/turn/preIterationLifecycle.ts` port at pinned AHDGame `e364c0495`:
complete once every cycle-0 race resolves with candidate + tally coverage)
right after election resolution each turn, stamping `completedTurn` and the
calendar offset. The calendar stays frozen at the era start while the phase is
active (`advanceCalendarPhase`) and resumes there afterwards via the offset in
`getCycleAnchors`; the shared `GameClock` (`src/game/gameDate.ts`) pins the
era-start rendering while active and subtracts the stamped offset after
completion, wired through `GameView.foundingActive` / `foundingOffset` into
the GameScreen footer. The footer renders the reference "Founding" badge only
while real cycle-0 founding races are unresolved. Opt-in fields are absent on
every older world, so existing save bytes and the pinned v42 hashes are
untouched; default worlds schedule at cycle >= 1 and never trip the badge.
Deliberate deviations: no preset-default auto-enable (reference defaults
1953-default/1979-default on) and no priors vacant-chamber seeding (founding
races seat the authored cast through the real tally path). Still missing
before #223 can close: that preset-default rule, vacant-chamber seeding, and
the rendered 320/390/desktop comparison against the reference status bar.
Evidence: `founding.test.ts` (stamp/sweep/detector/convergence/frozen-date/
save-reload), `session.test.ts` (opt-in/badge/offset/save-reload),
`gameDate.test.ts` (pinned/resumed calendar), `GameScreen.test.tsx`
(badge + post-founding footer).

## Resource and finance breakdown depth checkpoint

N08/#49/#83: Profile and the footer now render one breakdown built from the same
`projectResources` projection, so they cannot diverge. Action rows split the
office bonus into elected-seat, cabinet and chair sources and keep the party
bonus, hoarding penalty, cap and next balance; funds rows keep base, donor,
office, party tax and net; the history shows turn-over-turn fund and cash
deltas; and Profile shows the party-influence projection (closeness, leadership,
infamy penalty, gain, balance after decay). The chair row is an explicit 0 with
a note because solo worlds have no central-bank chair (#119).

Honest gaps: national-influence turn gain and favorability decay/tier
thresholds are not projected locally, and corporation values (#80) and election
vote/margin/seat chips (#68) remain open, so #83 stays partial. Evidence:
`src/game/resources.test.ts`, `ResourceBreakdown`/`ProfilePanel` UI tests and
`smoke/resource-breakdown.spec.ts` at 320px and 390px. No mechanics formula
changed.


## Referendum player surface checkpoint

#70: the Nation drawer's Referendums destination now renders the persisted W25
records (question, status, scope, yes share, campaign window, final share,
turnout, result, consent deadline) and the UK-only request seam. The request
rows reuse the engine's `UK_DEVOLUTION_REGIONS`, `referendumRegionStatus` and
60-desire threshold, so every surfaced reason matches the `requestReferendum`
gate, and the button dispatches the real action. Non-UK worlds get an explicit
not-applicable note.

Remaining: player referendum campaign writers (spending, ground game, positions)
do not exist in the engine, so #70 stays open for those. Evidence:
`src/game/politics.test.ts`, `PoliticsPanel.test.tsx`,
`smoke/referendums.spec.ts`. No mechanics formula changed.


## Campaign strength and strength projection checkpoint

#68: the campaign-strength mechanic is ported from AHDGame (contribution cost
and action formulas, the saturation vote curve, leader pullbacks, batch quote,
max-affordable clicks) with hand-derived reference vectors. `campaignStrength`
is a real campaign field defaulting to 0 with an additive save backfill, and the
multiplier is applied at vote accumulation exactly where the reference applies
it: presidential generals only. At strength 0 it is a strict no-op, so no
existing save, fixture or golden moved.

The player can contribute strength to their own presidential campaign through
the reference funds/action cost (validated before any debit), and the campaign
panel shows the recorded `+X% vote boost`. The race projection block now
separates counted totals from a strength-adjusted projected leader and margin,
with explicit unavailable states and a note that it is an estimate.

Remaining: leader pullbacks are ported but not yet attached to a turn phase, and
the national-influence coupling / cross-campaign transfer paths of the reference
command remain omitted (named in `docs/CAMPAIGN-STRENGTH.md`). #68 stays open
for those. Evidence: `packages/engine/src/campaigns/campaignStrength.test.ts`
and `campaignContribute.test.ts` (27 tests, including the no-op-at-0 and
presidential-only invariants), `src/game/politics.test.ts`, and
`src/ui/PoliticsPanel.test.tsx`.

## Caucus chair controls checkpoint (#60)

#60 partial: `setCaucusTaxRate` and `disbandCaucus` are now public, chair-only
catalog actions porting the reference PATCH and DELETE routes. Both charge no
action points or funds, matching the source. The disband path stamps
`disbandedAt`, clears membership and vacates the chair, and the disbanded
caucus is excluded from the tax phase and roster. The earlier member-level tax
helper now requires the chair seat.

`CaucusPanel` shows the tax input and Disband button only for a chaired caucus,
quoting the engine's own eligibility verdict. The chair checks additionally
require active affiliation (membership pointer plus roster entry), so a stale
chair seat cannot tax or disband a caucus the player left. Evidence: twelve
engine scenarios (`src/actions/caucusChairActions.test.ts`), four game-layer
scenarios, three panel scenarios, and an extended `smoke/caucuses.spec.ts`
that edits the tax, reloads, disbands and relaunches on the genuine elected
fixture. Validation:
engine non-sim suite 1020 tests, root suite 260, UI suite 285, content 41,
shared-rules gates, engine and root typecheck and production build all pass.

Still open on #60: chair/vice-chair elections, whip modes, health, color,
description, motto, NPP recruitment and rename. This closes only the tax-edit
and disband substeps; the issue stays open with `status: partial`.

Read-only roster/role slice (this batch): the projection now surfaces the
recorded chair, vice-chair, roster and player role with explicit
unknown/vacant copy, and the panel renders them without hiding the chair tax
and disband controls. Whip, health, recruitment, elections, color,
description, motto and rename remain unrecorded with no public engine action;
recruitment and leadership changes through validated commands remain the next
#60 work.

## World and new-game setup checkpoint, 2026-09-14 (#241)

## UK profile constituency checkpoint, 2026-09-15 (#47)

#47 is complete. Winning a regional election now retains the elected region
on the player's legislative seat. A sitting UK Commons member or Prime
Minister receives the same region-constrained 650-seat Westminster catalog as
the pinned AHDGame profile reference. The Profile selector writes through a
real worker/session command, rejects a constituency outside the held region
or one already assigned to another Commons official without mutation,
persists the selection through save and reload, and links the selected
constituency back to its region detail. Constituency-specific Commons
elections consume the selection in the real candidacy action and reject a
different constituency's race. Ineligible profiles show the applicable rule
instead of a disabled or fabricated choice.

Focused evidence: eleven public `GameSession` profile scenarios cover Commons and
Prime Minister eligibility, exact regional filtering, atomic rejection and
save/reload persistence. Ten public engine candidacy scenarios include the
selected-constituency race constraint. Thirty-six `ProfilePanel` player-flow scenarios cover
selection, save feedback, unavailable state and region navigation. The related
GameScreen suites also pass. The catalog retains the pinned reference's 650 ONS
codes and names, with every region assignment corrected against the House of
Commons Library's verified 2024 constituency results. A full-catalog source
digest, official region counts, unique-code checks, and reviewed border-area
cases guard all 650 mappings. Root owns the consolidated merge gate for this
batch.

## Head of State journey checkpoint, 2026-09-14 (#243)

#243 now seats a Head of State player as a permanent executive at world
creation. Presidential systems write the same `executives` record consumed by
cabinet, judiciary, succession, achievements and country overview mechanics;
parliamentary and one-party systems retain their authored executive office in
`player.currentOffice`. Both bindings survive save and reload.

The Actions destination becomes a dedicated Executive surface in HoS mode and
does not expose career campaigning actions. Its spending and tax controls
consume action points immediately but queue a fiscal directive; the directive
enacts at the next turn boundary through `fiscalDirectivesPhase`, where the
existing budget calculators recompute revenue, spending and surplus. The UI
identifies presidential, parliamentary and one-party office semantics rather
than silently treating every country as presidential.

Evidence: `packages/engine/src/hos.test.ts` covers permanent seating, authored
office selection, save/load and deferred fiscal enactment; the session contract
pins the executive-only action projection; `smoke/head-of-state.spec.ts` covers
mode selection, character creation, presidential seating, a tax direction,
turn advance, save, relaunch and permanent-office resume. `npm run verify`
passes with 277 app and 321 UI tests, both typechecks pass, and the production
browser suite passes all 59 scenarios.

Country-specific cabinet, court and appointment controls beyond the surfaced
office classification remain owned by #63, #65 and #101 rather than being
silently represented as implemented here.

#282 complete. The generated unavailable-law inventory accounts for all 269
Native PORT-STUB rows: 257 JP/DE/IE/CN/BR seed rows and 12 hand-ported
US/UK/RU/DD rows. Each record preserves its AHDGame source revision and path,
scope, authored eligibility prerequisites and effect targets, plus the named
Native subsystem required before release. Five Native-only US placeholder ids
have no matching row at the pinned AHDGame revision and say so explicitly.
`generateCatalogs.ts --check` detects drift without changing availability, and
the focused inventory contract proves exact coverage against the public catalog.

#283 complete. Japan's Consumption Tax Act is the first bounded executable row
from that inventory. Its national scope, exact 11 authored rate options,
economic values, sales-tax destination, and weighted political targets come
from the pinned Japan seed. Sponsorship rejects unauthored rates and records
the source option plus the direction of the move from the current budget rate.
The public legislation flow covers proposal, both Diet chamber votes,
pocket-sign enactment, gradual tax-rate effect, replacement, repeal, and save
reload. The generator now owns the one-row availability allowlist and leaves
the other 268 catalog rows unavailable with named blockers. This is not a claim
of full Japan catalog parity.

#288 partial. Brazil's Imposto de Renda Statute is the first bounded executable
BR row from that inventory. Its national scope, exact 6 authored rate options
(0/8/13/18/24/30), economic values, income-tax destination, and weighted
political targets come from the pinned Brazil seed at e364c049. Sponsorship
rejects unauthored rates and records the source option plus the direction of
the move from the current budget rate. The public legislation flow covers
proposal, both National Congress chamber votes, pocket-sign enactment, gradual
tax-rate effect, replacement, repeal back toward the catalog baseline, and save
reload, all driven in-country because BR is playable in the 1991 pack. The
generator allowlist now owns two executable rows and leaves the other 267
catalog rows unavailable with named blockers. This is not a claim of full
Brazil catalog parity: the remaining 13 BR rows stay unavailable.

#241 complete. `NewGameScreen` captures the reference world-setup fields and
carries them through `NewGameOptions` into the engine `NewWorldOptions`:
`mode` (`career` | `hos`), `homeRegionId`, and `initialization`
(`founding` | `historical`). Era/country choices expose the country's regions,
its `headOfStateOffice` from the generated `EXECUTIVE_OFFICE_BY_COUNTRY`
registry, and a per-initialization `rulingPartyByInitialization` preview.
Head of State eligibility is the conjunction of an executive office existing
and the selected initialization having a bindable party; the two failure modes
report distinct reasons (no executive office versus no governing-party content
for that start), and the preview updates when Founding/Historical changes. UI
never submits `mode: "hos"` with a null party. `rulingPartyIdForCountry` and
`rulingPartyForCountry` take an optional `initialization` (default founding)
and, under Historical, run `projectUkHistoricalCommonsComposition` before
`computeFormation` so the pre-world preview and `createWorld`'s bound
`player.hosPartyId` agree. `GameView.player` surfaces `mode`, `hosPartyId` and
`homeRegionId`, and the session save/load path retains them.

Reference source: AHDGame `singleplayer/page.tsx`,
`src/app/singleplayer/SingleplayerHome.tsx`,
`src/app/singleplayer/admin/SingleplayerAdmin.tsx`,
`src/app/api/singleplayer/new-game/route.ts` (`mode` enum and preset
derivation) and `src/app/page.tsx:39`; Native engine contract
`packages/engine/src/world.ts` (`NewWorldOptions.mode`/`homeRegionId`/
`initialization`, `rulingPartyForCountry`).

Evidence: RED/GREEN `packages/engine/src/hos.test.ts` (1953 and 1979 UK
Historical resolve `UK_LAB` and `createWorld` binds it into `hosPartyId`;
Founding and the era-only call stay null; `headOfStateOfficeForCountry` reads
the generated registry and returns null for an unlisted country),
`src/game/session.test.ts` world-setup contract (default Career/home region/no
governing party; HoS binding and mode/homeRegion/hosPartyId retention through
save/load; Historical 1953/1979 UK Commons consequence and binding versus
Founding), and `src/ui/NewGameScreen.test.tsx` world-setup suite (mode radios,
region reset on era/country change, initialization pass-through, 1953 UK
Founding HoS disabled with the missing-governing-party reason, switching to
Historical enabling HoS and previewing Labour, the distinct no-executive-office
reason, and never submitting `hos` when the party is null).
GREEN: focused engine/session/UI suites, app `tsc` and engine typecheck pass.
Earlier slice: production build, `npm run verify` and all 55
`SMOKE_PRODUCTION=1` Playwright scenarios passed against the installed
Chromium build, including the singleplayer create/advance/save/relaunch flow.

#333 complete. Local world setup now includes an Advanced world rules section
derived directly from the engine's canonical feature-flag definitions and
defaults. Every simulation toggle shows its source label and description,
submits a complete boolean map through the existing character-creation handoff,
and reaches `createWorld` without a UI-only copy. Focused rendered tests cover
defaults, a changed rule, the complete payload, and busy-state disabling. A
focused session test proves selected rules remain authoritative after save and
reload. Difficulty, autonomy tier, and world-simulation mode remain in #334
until they have real Native engine consumers.

World-start date checkpoint, 2026-09-25 (PR #673; #240/#118 partial): the
shared New game flow now retains authored era presets and lets a player choose
an exact seven-day week start through December 31, 2027. The selected date
reaches the local `createWorld` boundary and date-aware demographic inputs;
invalid calendar days are rejected there. A newly chosen era starts no earlier
than its authored content anchor (1953 begins January 6). Focused tests were
red before the final-week, invalid-day and 1953-anchor corrections, then green.
The final 320px/390px selector interactions passed locally and both screenshots
were inspected without horizontal overflow. Hosted verify at `23a2dd0` passed,
including the integrated real SP create/action/turn/save/relaunch browser smoke;
PR #673 merged as `1cbfaec`. The loaded-host focused local smoke hit its
90-second limit after turn 1 and before Save; the hosted pass is the completed
integrated result. AHDGame `SingleplayerHome.tsx` supplies the authored-era
baseline; Native's week selection is an added control. Missing 1999/2007/2023
packs, playable-country differences, and broader #240 creation/HoS/imagery
acceptance remain open. The selector does not make those dates fully playable.

#334 partial (difficulty axis). The canonical difficulty values (easy/normal/
hard, default normal) and the exact NPP resource tuning table are ported from
AHDGame (`new-game/route.ts`, `db/types/gameState.ts`,
`singleplayerDifficulty/rules/index.ts`) into `singleplayerDifficulty.ts`.
The axis persists on the world only when non-default (absent means normal,
no schema bump, so default worlds stay byte-identical), scales NPC fund
generation through `fundGenerationPhase` (absent/normal x1; the player path
stays untuned like the reference), and is selectable on the creation screen
with Career/HoS flow preserved. Schema 42 projection drops an absent/normal
axis and refuses any other. Covered by focused engine/session/UI suites.
Autonomy tier stays open in #345 until its engine
consumer exists; world-simulation mode closed in #346 below.

#346 complete (world-simulation mode, stacked on the #334 difficulty axis).
The canonical play-mode axis (`SingleplayerMode` normal/head-of-state/
worldsim, default normal, `permanentHeadOfState` only for head-of-state, a
playerless world behind the `/singleplayer/worldsim` spectator surface) is
projected onto the existing Native `player.mode` binding
(`singleplayerMode.ts`: career/hos/worldsim, default career). A worldsim
world binds no ruling party, office, or executive seat; the session offers
no character actions and refuses character acts while turns run the
identical engine; the mode persists through save/reload (corrupt values
rejected) and schema 42 projection refuses worldsim worlds while career/hos
project unchanged. The creation screen adds a Worldsim radio that submits
the contracted mode with Career/HoS flow and feature flags preserved.
Covered by focused engine/session/UI suites. No autonomy selector is added
(#345 untouched).

#345 autonomy tier axis. The canonical tier values (off/v0/v1/v2/v3/v4/v5,
default v4), rank ordering, and player-country rail are ported from AHDGame
(`new-game/route.ts`, `db/types/gameState.ts`, `nppAutonomy/featureFlag.ts`)
into `nppAutonomyLevel.ts`. The axis persists on the world only when
non-default (absent means v4, no schema bump, so default worlds stay
byte-identical) and gates its named simulation consumers — NPP bill
sponsorship, bill voting, and the NPP action loop — through the effective
per-country level (below v2 resolves to off in the player country).
Fund and AP regen stay on the difficulty-scaled fund phase, so competence
never moves with this axis. The tier is selectable on the creation screen
alongside difficulty with Career/HoS flow preserved. Schema 42 projection
drops an absent/v4 axis and refuses any other. Covered by focused
engine/session/UI suites. World-simulation mode stays open in #346.
#352 complete. A running world now has an in-game World settings surface under
World > Other in the drawer, the Native counterpart of AHDGame's
/singleplayer/admin running gates (Egg3901/AHDGame#1903). It renders exactly
the canonical WORLD_FEATURE_FLAG_DEFINITIONS with their current saved values;
each toggle submits a complete boolean map through a new worldFeatureFlags
session/client/worker command that validates through the canonical resolver
before commit, merges onto the live map, preserves every other saved field,
and persists through the existing save envelope. Busy disables every control
and App serializes the update through the existing run lock. Focused session
tests cover update, preservation, strict rejection, and save round-trip;
focused rendered tests cover drawer reachability, current values,
complete-map submit, and busy disabling. Difficulty and world-simulation
mode are covered in #334/#346 above; autonomy tier remains in #345 until
its engine consumer exists.

The entry journey now matches the remaining reference boundaries. Starting a
new game while an overworld is active opens a confirmation that preserves the
current saved world unless the player explicitly continues. After world setup,
the app hands off to `CharacterCreationScreen` before creating the world, as in
the reference `/create-character` route. `LandingScreen.test.tsx` protects the
confirmation and cancellation behavior, while the character-creation and
production browser suites protect the setup-to-character-to-world flow.

## Page-coverage UI polish checkpoint, 2026-09-14 (#244)

#244 partial. Bounded UI/CSS slice for three of the four owner-named surfaces;
no engine, session, DTO, signing, version or release file changed.

- `NewGameScreen` (320px/390px): the country/name pair stays in the shared
  `.ahd-grid-2` (one column under 640px), the mode radios share a `.ahd-mode-row`
  with 44px rows, and the HoS-unavailable reason is now an accessible
  `role="note"` beside the radios instead of an unattributed paragraph. The
  governing-party preview carries a `PartyMark` initials/color mark. Class-only
  hierarchy changes; form labels, order and submit behavior are unchanged.
- New `src/ui/PartyMark.tsx`: reusable identity mark that renders a
  party-authored image when the DTO supplies a real `logoUrl`, drops to an
  initials/color mark on `onError`, and otherwise derives deterministic
  initials plus a stable fallback color from the party id/color already in the
  DTO. No URL is invented and no proprietary art is bundled. Integrated into
  the visible Parties list (`GameScreen`), the Parties list/detail
  (`PoliticsPanel`), and party management rows (`PartyManagementPanel`).
- `ActionsHub` cards gain a compact code-native `.ahd-action-mark` glyph tile
  carrying `data-category` and `data-state` (available/locked); the locked
  state and `disabledReason` stay visible at 320px with no blank image chrome.

Honest gaps: this is not image parity. The Native DTOs carry no party
`logoUrl`, so every mark renders the initials/color fallback; the reference
hero art, portraits/flags, coalition marks and creation/HoS imagery remain
unported under #143/#244. No rendered AHDGame-vs-Native comparison screenshot
was captured for this slice, and no physical-device run was performed. The
issue stays open with `status: partial`, acceptance checklist unchanged.

Evidence: `src/ui/PartyMark.test.tsx` (image success, error fallback, initials,
deterministic color, decorative behavior), `src/ui/ActionsHub.test.tsx`
(category mark + locked reason visible), `src/ui/NewGameScreen.test.tsx`
(accessible HoS reason, preview mark, compact country/name grid),
`GameScreen.test.tsx`/`PartyManagementPanel.test.tsx` (marks render in the
visible party lists). Validation: focused UI suites and `npm run build`
(tsc + vite) all pass; the original slice result was full `test:ui` at 28 files
/ 307 tests. This review pass adds a `PartyMark` regression test (a second logo
URL is attempted after the first fails), so current head is 28 files / 308
tests. Production smoke is 17 scenarios
across the eight named specs (`singleplayer`, `actions-hub`, `party-founding`,
`mobile-navigation`, `ui-rosters`, `candidacy`, `feature-depth`,
`ui-navigation-depth`), all 17 passing against the installed Chromium build.


## Profile hero and identity composition checkpoint, 2026-09-15 (#371)

#371 done as a bounded Native UI slice; no engine, session, DTO, signing,
version or release file changed. Child of #143.

- `src/ui/ProfilePanel.tsx`: the Character section opens on a `RouteHero`
  (new `profileHeroImage`/`PROFILE_HERO_IMAGE` in `src/ui/RouteHero.tsx`)
  using the saved custom header when set, else the bundled offline
  `politicians.webp`; one overlap identity row below the fold carries the
  projected portrait-or-initials, party/office chips and region/country
  links. Edit controls, section order, constituency, finance and navigation
  behavior are unchanged.
- `src/ui/profile.css` (+ dead-banner removal in `src/ui/ui.css`):
  phone-first hero bleed and overlap with compact density at 320px, base
  phone column at 390px, and roomier overlap on desktop; 44px chip/link
  targets preserved.
- Reference: AHDGame `ProfileHeader.tsx` banner + overlap composition and
  `profileHeroLayout.ts` offsets; server-only elements (supporter/admin
  badges, copy-link, wiki link, member-since, flags) stay omitted.
- No remote images or new assets; no mechanics invented.

Evidence: new `src/ui/ProfileHero.test.tsx` (12 cases: imagery, fallback,
identity, destinations, boundaries, responsive rules) plus the unchanged
`src/ui/ProfilePanel.test.tsx`. Validation: focused UI suites only, per the
slice boundary — no full verify/build/typecheck/Playwright run.

Honest gaps: no rendered AHDGame-vs-Native comparison screenshot and no
physical-device run for this slice; `smoke/route-heroes.spec.ts` does not
yet cover the Profile hero. Server-only header elements remain omitted by
design (see UI reference).

## Commodity hero review corrections checkpoint, 2026-09-15 (#378 partial)

#378 partial. Review pass over the offline commodity hero subset: the 14
byte-identical AHDGame heroes stay under the same public path, and three
reference alt texts that contradicted the bundled bytes are corrected
against the inspected local WebP plus the upstream file identity in the
hero route (`energy` is the Anacortes refinery, not power lines; `freight`
is a hull marked MAERSK SEALAND, not "Sovereign Maersk"; `pharmaceuticals`
is blister packs of pills, not a manufacturing line).

- New total typed `commodityHeroAlt()` in `src/ui/RouteHero.tsx`: exact-key
  lookup with no case folding or trimming, and the nonempty
  `COMMODITY_HERO_FALLBACK_ALT` for every unported or unknown key.
- Markets company detail (`CompanyDetail`) now renders a reachable
  `RouteHero` keyed by the listing's recorded `sectorType`; only the
  `energy` and `retail` Native sectors hit bundled art, everything else
  takes the Actions fallback with the fallback accessible name. No route,
  mechanic, or sector mapping was invented.

Honest gaps: the corporation, IMF, and cabinet surfaces from #378 stay
open (no Native consumer or rights manifest yet); the central-bank slice
has since landed separately on `main` (#386: `BANKING_HERO_IMAGE` with
federal-reserve/bank-of-england/bank-of-japan art, preserved by this
branch's rebase). The other 14 commodity slugs stay remote-only, and the
reference commodity browse surface has no Native equivalent. The issue
stays open with `status: partial`, acceptance checklist unchanged. Full
#378 acceptance (corporation/IMF/cabinet heroes, plus rendered
overflow/external-request proof at 320px, 390px and desktop like
`smoke/route-heroes.spec.ts`; this slice asserts the crop CSS text only)
remains open under parent #143.

Evidence: `src/ui/CommodityHeroImagery.test.tsx` (total alt helper,
exact-key and fallback behavior, the three corrected alts, fallback
accessible name) and `src/ui/MarketsPanel.test.tsx` (company-detail hero
for a bundled sector, Actions fallback with the fallback accessible name).
Validation: focused Vitest on both files only; no full verify, typecheck,
build, or device run was performed for this pass.

## Character-creation player flow checkpoint, 2026-09-14 (#242)

#242 partial. The reference six-step creation hand-off now runs after world
setup, and every captured field persists through the engine, save and session.

- Engine (`packages/engine/src/`): new `stats/characterStats.ts`
  (seven keys, `STAT_MIN`/`STAT_MAX`/`STAT_POINT_BUDGET` 28/`STAT_FREE_POINTS`
  21, `statMultiplier`/`statBonus`), `stats/characterWealth.ts`
  (`WEALTH_BONUS` 1M/2.5M/5M anchor, deflated by `getEraNominalScale` and
  converted at the frozen base rate), `alignment/policyAlignment.ts`
  (`compassDistance`, `alignmentBand` thresholds 1.5/3/5.5, `nearestParty`,
  `ideologyLabel` archetypes) and `creationCountryRules.ts`
  (one-party RU/DD/CN; imperial-eligible UK/JP). Exact ports of
  `src/lib/stats/statsConstants.ts`, `statMultiplier.ts`, `statMeta.ts`,
  `constants/characterWealth.ts`, `registration/alignment.ts` and
  `lib/imperial.ts`.
- `createWorld` accepts and validates `policies`, `demographics`, `stats`,
  `wealth`, `partyId`, `avatarUrl` and `profileHeaderUrl`, writes them to
  `world.player`, and grants wealth-tier starting cash. `PlayerCharacter` gains
  `demographics`, `profileHeaderUrl` and the full `stats` block; `save.ts`
  validates every present stat key, demographic value and raster data URL.
- Consequences are observable through existing public boundaries: campaign
  influence and advertise favorability scale by Charisma, fundraise yield and
  the quoted yield scale by Fundraising, campaign/advertise fund cost scales by
  Intellect, and Energy scales the action cap via `energyActionLimits`. Compass
  position drives `nearestParty`/`alignmentBand`; the creation party binds
  directly (no joinParty charge) and drives party closeness.
- Session/UI: `GameSession.create` passes the creation file through;
  `session.creationChoices` exposes parties/one-party/imperial/region-noun;
  new `src/ui/CharacterCreationScreen.tsx` renders Country, The politician,
  Home region, Where you stand, Party, Stats in reference order with the
  reference option labels, one-party briefing and imperial notice, and local
  portrait (2 MB) / header (4 MB) pickers resized to the reference presets.
  `ProfilePanel` shows the full stat block, demographics and header.
- Profile policy and demographics parity (#50) is complete: the compass reads
  the persisted player axes, plots the authored party platform when available,
  labels the unavailable home-region lean without inventing one, and links to
  the party, home region and national policy destinations. Creation is the
  reference editing command; its values survive action, turn, save and reload.

Evidence: `packages/engine/src/characterCreation.test.ts` (persist/reject/
round-trip/wealth/party), `characterConsequences.test.ts` (charisma,
fundraising, energy, compass), `creationCountryRules.test.ts`,
`creationParties.test.ts`, `src/game/characterCreationSession.test.ts`
(session + save/relaunch incl. portrait/header) and
`src/ui/CharacterCreationScreen.test.tsx` (six-step order, deliberate party,
stat gating, one-party, imperial). `npm run verify` (268 root + 313 UI tests,
build, career fixtures), engine `tsc` and the engine CI suite (116 files /
1051 tests) pass. Production smoke runs 58 scenarios, all passing, including
the new `smoke/character-creation.spec.ts` create/act/turn/save/relaunch flow
and one-party briefing; existing creation-sensitive smoke expectations
(wealth cash, fundraising yield) were updated to the real consequence values.

2026-09-15 #242 home-region slice: `listCreationHomeRegions` and
`creationChoices.homeRegions` expose pack population plus the turnout-weighted
electorate lean per region (unseeded leans flagged as country averages), and
`HomeRegionPicker` renders the reference filter/sort radiogroup with lean, fit
and M/K population on the creation Home step. Evidence:
`homeRegionContext.test.ts` (6), `creationHomeRegions.test.ts` (3),
`HomeRegionPicker.test.tsx` (4), `CharacterCreationScreen.test.tsx` (25) and
`CharacterCreationMobilePresentation.test.tsx` (8), all green; fixed three
`/Name/i` ambiguities and the combobox-to-radiogroup assertion.

2026-09-15 #242 conditional-flow slice: the Party step now warns on a
deliberate Independent pick in a one-party state (0.0x vote weight, cannot be
fielded; join the ruling party and reform it from inside), keyed off the same
`isOnePartyState` conditional as the briefing and regime badges, and the
Country subtitle is word-identical to the reference. Evidence: new public
`characterCreationPlayerFlow.test.ts` (create, act, advance, save, relaunch,
continue with every creation field intact) plus 4 rendered tests (warning
show/clear, competitive-country silence, six subtitles); focused runs green
(9 session, 35 CharacterCreationScreen).

2026-09-17 #242 phone-first refinement slice (PR #370, rebased onto
current main): the six steps keep their order, labels, validation rules and
persisted submit contract and gain small-phone guidance — a Country summary
card, background progress plus name-length hints, keyboard compass steppers
with live axis labels, party cards with measured `compassDistance` platform
gaps and a best-match badge (shown only after the compass is answered), an
accessible stat-spend progressbar, and per-step Continue hints. The obsolete
raw region select was dropped in favor of the newer `HomeRegionPicker`
radiogroup; imperial-redirect panel, one-party warning, Dynamic Island safe
areas, glass/material fallbacks and phone navigation are preserved. Evidence:
`CharacterCreationRefinement.test.tsx` (country card, hints, background,
picker choice, compass keyboard, distances/best-match, pre-compass silence,
stat meter, 320/390px guards) plus the untouched `CharacterCreationScreen`,
`HomeRegionPicker`, mobile-presentation and game
create/act/advance/save/relaunch flow suites: 58 UI + 9 game tests green in
focused runs.

2026-09-18 #242 compass-legend slice: the Where-you-stand step now reads
the plot back in words starting with the home electorate, mirroring the
reference `CompassLegend` (`src/app/create-character/CompassLegend.tsx`):
`{Region} electorate` plus the `compassDistance` gap with its
`alignmentBand` label once the compass is answered, `lean not yet derived`
for an underived lean (the `HomeRegionPicker` vocabulary), and the
reference-exact `Pick a home {regionNoun} to plot its electorate.` prompt
when no region exists. The lean stays display-only context; only
`homeRegionId` and the compass axes persist. The compass subtitle is now
word-identical to the reference (`...elections actually measure.`).
Evidence: new `src/ui/CharacterCreationCompassElectorate.test.tsx` (6:
pre-measure silence, 2.0/Close measurement, null-lean honesty, empty-regions
fallback, 320/390px wrapping guards) plus one session save/relaunch test pinning
the row's persisted inputs; focused runs green (41 UI incl. the updated
subtitle test, 10 game, 23 adjacent presentation/picker). No engine numbers
changed; no server data invented. Phone layout is structural (no fixed widths,
no nowrap); no physical-device run.

Remaining #242 acceptance gaps: the imperial *creation input* remains
admin-only per the reference (`/create-imperial-character` is admin-gated), so
Native renders the honest notice rather than an imperial form; a rendered
AHDGame-vs-Native creation screenshot comparison and physical-device run were
not captured. The issue stays open with `status: partial`.

### Conversational mobile presentation (#335 / #336)

The owner-authorized Native adaptation now presents the same six sourced
creation steps one at a time. Completed answers form an editable candidate-file
transcript, Back follows the reached step history, and Review all details keeps
the direct six-section path available. The layer is local and deterministic:
it preserves the existing controls, validation, defaults and final
`CharacterCreation` contract instead of generating or inferring answers. Focused
rendered tests cover canonical progression, earlier-answer editing, the direct
review path and final submission. This is a Native mobile presentation choice,
not behavior attributed to current AHDGame development.

#335 mobile pass (stacked): a touch-first progress strip jumps directly to any
reached section with `aria-current` marking, the active step heading takes
keyboard focus on each change with a `role=status` announcement, chips gain a
visible focus ring, stat rows wrap at 380px and below, and a sticky
safe-area action bar keeps Continue/Back/Create reachable. Order, labels,
fields, defaults, conditional notices and the `CharacterCreation` submission
are untouched. Evidence: `src/ui/CharacterCreationMobilePresentation.test.tsx`
(8 tests: progress order/jump, Back, mount/keyboard focus, live region,
320/390px structural guards, exact submitted record),
`smoke/character-creation.spec.ts` (per-step zero-overflow asserts at the
390px default viewport plus turn/save/relaunch) and a temporary real-Chromium
320px walk (zero overflow per step, 44px targets, Profile handoff) run once
and removed. The smoke helper now walks the conversation; no engine change.

## Ministerial-order lifecycle checkpoint, 2026-09-15 (#258 / #105)

- Persisted orders now retain their cabinet position/catalog identity, duration,
  exclusive expiry turn, lifecycle status, last-applied turn, and optional regional
  target through the normal engine save/reload boundary.
- The turn phase normalizes pre-lifecycle saves from `issuedAtTurn`, applies active
  orders only before the exclusive boundary, and deactivates them at expiry. New
  worlds continue to start with no ministerial orders; issuance remains tracked by
  the dependent #259–#262 slices rather than being invented here.
- Focused evidence lives in
  `packages/engine/src/ministerialOrders/lifecycle.test.ts`, with the existing W28
  accumulation/cap test retained as a regression check.

## Cabinet nomination ballot checkpoint, 2026-09-15 (#267 / #63)

- Cabinet confirmation totals are recomputed from current, country-scoped seat
  holders. Stale, de-seated, and cross-country vote keys no longer influence a
  nomination outcome.
- The public engine ballot boundary accepts and replaces for/against/abstain
  votes only while the window is active. Ordinary cabinet nominations remain
  Senate-only; Vice President nominations retain separate House and Senate
  ballots and require both chambers at resolution.
- Pending ballots survive save/reload, and the cabinet lifecycle now resolves
  from the recomputed vote maps rather than trusting stale stored counters.
  SCOTUS ballots, session wiring, and UI remain in #268 through #273.

## Cabinet nomination sponsorship checkpoint, 2026-09-15 (#269 / #63)

- The exported sponsorship boundary requires the local player to be the sitting
  President for the nomination country, validates the source cabinet roster and
  era, and derives nominee identity from the world rather than caller text.
- Occupied positions, active duplicates, foreign or unknown nominees, cabinet
  members, a President self-nominated for Vice President, malformed world dates,
  and invalid turn clocks are rejected before nomination state changes.
  Valid nominations receive the reference 24-hour window as 24 Native turns.
- The reference nominates another player character. Offline Native has only one
  player record, so same-country generated politicians form the explicit local
  nominee-pool adaptation; caller-supplied identity text is never trusted.
- Ordinary nominations open a Senate ballot. Vice President nominations create
  separate House and Senate vote maps. Pending records survive save/reload and
  resolve through the existing current-seat lifecycle boundary.

## Supreme Court nomination ballot checkpoint, 2026-09-15 (#268 / #63)

- Supreme Court advice-and-consent now shares the cabinet nomination current-seat
  tally seam, so only incumbent senators from the nomination country count and
  stale, foreign, or de-seated ballots carry no weight.
- The public engine ballot boundary accepts for, against, and abstain, permits an
  eligible senator to replace a ballot while voting remains open, and rejects
  closed, expired, wrong-country, and non-Senate contexts without mutating the
  nomination.
- Turn resolution recomputes totals from eligible ballots after save/reload and
  seats a nominee only after a confirmed simple-majority result. Parent #63
  remains open for sponsorship, session wiring, UI, and the remaining slices.

## Corporate-sector asset core checkpoint, 2026-09-15 (#293 / #211)

- The public lazy accessor materializes one stable CorporateSector asset
  identity per aggregate Native corporation and keeps it distinct from the
  unowned-sector revenue headroom pools. Untouched schema-44 worlds and legacy
  saves retain their serialized shape and pinned hashes.
- The asset owns future-facing sale, worker, and union-representation state.
  Existing Corporation records remain authoritative for turn economics; the
  exported projection joins current revenue, margin, and growth on read so the
  two records cannot silently drift.
- Assets remain explicitly national/unallocated until source-backed regional
  ownership lands. Identity does not depend on catalog order. One validator is
  shared by seeding, projection, lazy backfill, and save loading, where corrupt
  keys, references, and duplicate tuples fail closed. Sale commands,
  worker/union mechanics, fan-out, and UI remain in #294 through #299.

## Corporate-sector ownership/detail slice, 2026-09-15 (#299)

- `projectMarkets` joins one recorded `CorporateSectorAsset` per listing into
  `MarketListing.sectorAsset`: verbatim id, workers, representing union, and
  for-sale state, with `scope`/`regionId`/`regionName` resolved from the
  recorded `stateId` against the region table and `unionName` from
  `representingUnionId` against the union table. No labor or sale state beyond
  the recorded fields is invented.
- The join is read-only: it seeds into a local map and never assigns
  `world.corporateSectors`, so untouched schema-44 worlds keep their
  serialized shape and hashes. The projected asset survives
  serializeSave/deserializeSave unchanged.
- Each `SectorSummary` carries `forSaleCount` counted from the same listing
  projection, so the directory can never drift from company detail. Every
  count reads 0 until the sector-sale commands land (#294/#295).
- The Markets panel renders a For Sale section (per-sector counts, no For Sale
  tab), a Sector asset card in company detail (scope, region, workers, union,
  sale state), and honestly disabled Buy sector controls held with
  `SECTOR_SALE_UNAVAILABLE` instead of hidden. Focused evidence:
  `src/game/markets.test.ts` (34 tests) and `src/ui/MarketsPanel.test.tsx`
  For Sale/sector-asset block.
- The region detail renders a Corporate sectors card (2026-09-18):
  `selectRegionSectorAssets` filters the recorded markets projection by
  `sectorAsset.regionId` and each row shows recorded ownership, workers,
  union, and for-sale state verbatim, with Buy gated by `evaluateSectorBuy`
  through the existing `onSectorSale("buy")` dispatch and a company drill
  that returns to the region. National assets stay in the Sectors directory.
  Fresh worlds seed every asset national, so the card honestly reports no
  regional sectors until a save records a regional split. List/update/unlist
  stay on the company detail. Focused evidence:
  `src/ui/RegionSectorAssets.test.tsx` (11 tests: selector, 320/390/1280px
  reachability, owned/unowned, buy dispatch, disabled reasons, recorded
  stateId join and player-acquisition readback) and
  `src/ui/RegionsRoute.test.tsx` (markets wiring, drill). No
  physical-device claims; jsdom pins content and containment styles.
  A further integrated route test in `src/ui/RegionsRoute.test.tsx` (2026-09-23)
  composes the real RegionsRoute and MarketsRoute with a real GameSession at a
  390px viewport: it drills Alabama to US-media, lists the sector for sale,
  verifies the session projection, then unlists it and verifies the cleared
  state. The fixture records the Alabama split in the persisted asset field
  consumed by the projection. This verifies routing and command integration;
  rendered source-screen comparison and physical-device behavior remain open.
  Remaining #299 gap: union bargaining/dues UI (#297) and
  nationalization/secession fan-out (#298), plus rendered source-screen
  comparison.

## Corporate-sector sale vertical slice, 2026-09-15 (#294 / #211)

- Strict persisted `forSale` content validation: a stored listing must be null
  or carry a positive finite asking price. Zero, negative, non-numeric, and
  missing anchors fail closed through the shared asset validator, so corrupt
  saves are refused at the load boundary. Acquisition and ownership transfer
  stay out of scope (#295).
- Direct `GameSession` list/update/unlist commands run the engine calls on a
  clone as the player and commit only on ok, so every refusal (non-shareholder,
  unknown listing, unlisted update/unlist, bad asking price) leaves the live
  world untouched. Listings persist through serialize/load and project into
  `MarketsView` (`sectorAsset.forSale`, per-sector `forSaleCount`). Wired
  through the worker boundary (`sectorSale` command, `GameClient.sectorSale`,
  `onSectorSale`) with save and success/error messaging in App.
- The Markets company-detail card exposes owner-only listing controls: List for
  sale, Asking price plus Update price, and Unlist enable only for a recorded
  shareholder (player holds >= 1 share); everyone else sees the gate reason.
  Buy sector stays honestly disabled for all viewers with the #295 reason.
  Focused evidence: `packages/engine/src/corporation/corporateSectorAssets.test.ts`
  (for-sale validation), `src/game/sectorSaleSession.test.ts` (player flow,
  atomicity, persistence), and the #294 block in `src/ui/MarketsPanel.test.tsx`.

## Corporate-sector acquisition and ownership transfer, 2026-09-23 (#295)

- The public engine command validates player authority, recorded asking price,
  currency, available cash, and current ownership before transferring the
  recorded sector to the player. A successful purchase debits player cash,
  credits the seller corporation, clears the sale listing, and leaves the
  corporation's labor and production record intact. Refusals preserve the
  serialized world.
- The `GameSession` boundary exposes buy alongside the existing list, update,
  and unlist commands. Ownership, cash, and listing state survive save/load;
  pre-acquisition saves default to corporation ownership.
- The company detail UI exposes owner-gated list/update/unlist controls and
  the live Buy action. The regional card links to that company detail and
  returns to the selected region, while its own Buy action dispatches directly
  for recorded regional listings.
- Evidence on current `origin/main`: `corporateSectorAcquire.test.ts` (8),
  `sectorSaleSession.test.ts` (8), and the regional/market UI suites
  `RegionSectorAssets.test.tsx`, `RegionsRoute.test.tsx`, and
  `MarketsPanel.test.tsx` (61) pass. `npm run typecheck` completed without
  diagnostics. UI tests pin content and touch-target contracts at
  320/390/desktop widths; they are not physical-device visual comparisons.
- Remaining corporate-sector program issues under #211 are bargaining/dues
  integration (#297), nationalization/secession fan-out (#298), and the
  dependent regional UI acceptance remainder (#299).

## Player polling checkpoint, 2026-09-15 (#38)

- `poll` and `pollLarge` are live through the public `executeAction` contract
  with the reference 2 AP / $25,000 and 6 AP / $75,000 anchors. The shared
  action cost path applies the player's Intellect modifier consistently to the
  displayed quote and debit, then converts the anchor amount with the frozen
  campaign-currency rate. Neither polling action has a cooldown.
- Each commission reads current home-region demographics, live turnout
  modifiers, party organization and an active general-election opponent set.
  Quick polls persist topline and strongest/weakest groups. Full polls also
  persist the complete category breakdown. Competitive races include the
  projected player and opponent vote totals. Both snapshots include the
  reference additive granular contract (`dims`, `dimLabels`, `cells`, and
  `candidateShares`) over the seeded voter cells used by Native's tally.
- Invalid demographic inputs reject atomically before any AP, funds, cooldown
  or achievement count remains charged. Successful snapshots are deterministic
  and survive the normal save/reload path as `lastPoll` and `lastPollLarge`.
- The Actions page exposes both commissions under Intelligence and renders the
  latest stored quick/full result flow, including an expandable granular
  electorate reading. Focused polling correction evidence covers cost, FX,
  cooldown, granular payload, save persistence and rendered results. The
  integrated polling journey uses the current character-creation handoff and
  remains part of the consolidated smoke gate.

## Ministerial action-pool checkpoint, 2026-09-15 (#260 / #105)

- Each new cabinet appointment receives the reference four-action ministerial
  pool. Pre-#260 cabinet records are normalized on their first turn without
  inventing a debit, and both remaining actions and the refill marker survive
  save/reload.
- Because Native is a deterministic offline simulation rather than a wall-clock
  service, the reference daily refill is adapted to its 24-turn clock: depleted
  or partial pools refill to the cap at the boundary and not before it.
- A shared synchronous spend boundary rejects exhaustion before mutation and
  refunds a debit if downstream order persistence throws. Catalog and dispatcher
  wiring remain isolated in dependent #259–#262.

## Union contribution conservation checkpoint, 2026-09-15 (#319 / #114)

- Union political policy still affects approval, but cash now leaves treasury
  only when it can be credited to an eligible organizer, matching the pinned
  union turn. Native has no organizer rows yet, so configured but unpaid cash
  is retained rather than destroyed. Organizer state and atomic payouts remain
  #320/#321; bargaining, strikes and phase timing remain #322/#323.

## Bank balance-sheet checkpoint, 2026-09-15 (#325 / #109)

- One banking rule now totals discount-window, central-bank margin and
  interbank claims for book equity and regulatory capital. Invalid or negative
  legacy values fail closed to zero, and the volatile proprietary mark cannot
  be distributed as equity. Discount-window transactions land with #327 below;
  interbank and proprietary transactions remain #326/#328; solvency and phase
  integration remain #329.

## Discount-window checkpoint, 2026-09-18 (#327 / #109)

- Banks draw and repay central-bank emergency liquidity through
  `banking/discountWindow.ts`: prime-plus-3 rate, cap at 25% of cash-backed
  deposits, usage-scaled confidence stigma, per-turn interest with shortfall
  arrears and turn-stamp idempotency, and a senior failure claim ahead of
  depositors. Every refusal throws before mutation, so rejected draws and
  repayments leave state untouched.
- Servicing runs as `discountWindowTurn` immediately after `bankingTurn` and
  before `playerLineOfCredit`/`bankSolvencyTurn`, matching the reference
  end-of-banking-pass order. Native adaptations: retail-only charters carry
  the capability structurally, draws mint and repayments burn (no CB
  reserve/creation ledger exists), interest paid is retired the same way, and
  arrears extinguish on failure exactly as the reference waterfall holds.
- Focused evidence: `packages/engine/src/banking/discountWindow.test.ts`
  (24 cases: quote/limits/draw/repay, rejection atomicity, unrounded gate,
  interest/arrears, idempotency, pre-#327 saves, stigma, failure waterfall,
  ordering) and
  `src/game/discountWindowSession.test.ts` (advance-seam servicing, reload,
  debt-free no-op). #327 acceptance is met; #326/#328 lifecycles and the full
  multi-claim waterfall (margin/interbank senior legs) remain open under #329.
## Proprietary bank positions checkpoint, 2026-09-18 (#328 / #109)

- Investment and universal charters run an equity proprietary book: opens debit
  ring-fenced cash at the live mark into cost basis, closes credit proceeds
  with pro-rata realized P&L, and every refusal lands before mutation so the
  charter is untouched. Seeded banks stay retail; the desk is reachable only
  through a synthetic (or future charter-wave) investment/universal charter.
- Each solvency turn marks the book before confidence, shrinks leverage
  breaches proportionally at those marks (with the 0.15 confidence penalty),
  fails a red investment bank with no equity behind its book, and clears the
  book on failure. Contagion still stamps peers only on a deposit-taker
  failure, and the prop mark still cannot leak into equity or deposit
  ceilings. Pre-#328 saves load as retail with an empty book, and
  present-but-invalid prop state fails closed.
- Cut for a later wave, not silently dropped: bond/indexUnit/forex assets (no
  solo pricing substrate), the B7 supervisory open gate, ref resolution by
  ticker or name, and interbank/margin servicing (#326/#327).

## Canonical logo/icon Linux re-verification checkpoint, 2026-09-15 (#148 partial)

- Linux-verifiable acceptance is re-confirmed and pinned: canonical SHA-256
  `1a7fe54f...f66a9` at 500x500 RGBA, offline decorative square launcher
  render, `tauri.conf.json` declarations, desktop/iOS/Android/ICO dimensions
  and no remote image references (`src/ui/logoIconAcceptance.test.tsx`,
  8 cases, red-to-green; `LandingScreen.test.tsx` still green).
- Fixed: Android `mipmap-hdpi` legacy and round launchers were 49px instead of
  72px (corrected from the same-pipeline xhdpi pair; artwork unchanged).
  Removed three byte-identical iOS `*-1.png` duplicates.
- Launcher/account surfaces re-checked: Help/Settings carry no remote image
  dependency and `src/` holds no Native auth token store; AHDGame still owns
  authentication and SP stays account-free.
- No paid build, no signing access, no device claim. #148 stays open with
  `status: partial` until the installed icon/launcher check passes in an
  authorized package on each platform (0.1.5 build 1.9 or later qualifies).

## Legislature nominations checkpoint, 2026-09-15 (#273 / #271)

- The Legislature destination now projects the cabinet/SCOTUS nomination list,
  per-item ballot eligibility with the engine's exact blocked reasons, cabinet
  sponsorship options, and an honestly unavailable SCOTUS sponsor (#270 absent).
  Session commands run the engine sponsor/vote functions on a clone and commit
  only on success, so rejections leave state untouched.
- Focused evidence: `src/game/nominations.test.ts` (6 cases: empty list,
  sponsor/project, senator ballot with save/reload, House refusal with
  unchanged state, turn resolution, SCOTUS unavailable) and
  `src/ui/NominationsPanel.test.tsx` (2 cases: status/tally/widths/refusals,
  cabinet ballot command). Session trio
  (nominations/legislature/session, 32 tests) and UI trio
  (NominationsPanel/LegislaturePanel/LegislationDetailsPanel, 24 tests) green.

## Nomination commands and player flow checkpoint, 2026-09-17 (#272 / #273)

- Session sponsor/vote commands now carry exact engine rejection strings with
  clone-discarded atomicity for cabinet non-President and duplicate
  sponsorship as well as the SCOTUS quartet; VP nominations route both
  chambers with House and Senate ballots kept across save/reload; withdrawn
  nominations project at the session boundary; deterministic 1953 Senate
  composition proves minority-party rejection with no seating and
  majority-party confirmation with seating; create/action/save/reload/turn/
  continue runs through the real session boundary.
- The Legislature panel renders the live session loop (sponsored detail with
  nominee, sponsor, office/seat, deadline, status, tally, and player vote;
  ballot through the session command; save/reload and turn-boundary
  stability) at 320px, 390px, and desktop widths, plus empty,
  ineligible-ballot, and resolved states. No production code changed.
- Focused evidence: `src/game/nominations.test.ts` (20 cases green) and
  `src/ui/NominationsPanel.test.tsx` (11 cases green); neighbors
  `src/game/legislature.test.ts` + `src/game/client.test.ts` (16) green.
  Full typecheck/verify/build remain queued with the supervisor. No
  physical-device evidence is claimed; parent #63 stays open.

## Nomination detail party checkpoint, 2026-09-18 (#271 partial)

- The nomination detail byline now names the nominee's party, matching both
  AHDGame detail pages (`src/app/congress/nominations/[id]/page.tsx` and
  `src/app/congress/scotus-nominations/[id]/page.tsx`, which render
  `nomineeParty` beside sponsor and proposed date). The projection keeps the
  raw `nomineeParty` id and adds `nomineePartyName` resolved from
  `world.parties` with the sibling fallback (`?.name ?? id`, null stays
  null); the panel renders it conditionally, so unknown parties change
  nothing. No nominees, votes, or mechanics invented.
- Focused evidence: `src/game/nominationProjection271.test.ts` (11 green,
  incl. display-name resolution plus null/unknown-id edges),
  `src/ui/NominationListDetail271.test.tsx` (4 green, incl. party shown at
  390px and omitted when null), `src/ui/NominationsPanel.test.tsx`
  (11 green); `src/game/nominations.test.ts` 18/20 with the 2 failures
  being pre-existing turn-advancement timeouts on this host (68s/72s vs the
  60s default; same failures with this change stashed).
- Environment note: this worktree's `node_modules/@ahdclient/engine`
  symlink points at the main checkout (c6510ee), whose engine predates
  `isFoundingActive`, so every session-touching test fails on a clean
  checkout; the runs above temporarily pointed the symlink at the
  worktree-local `packages/engine` and restored it afterwards. Full
  typecheck/verify/build remain owed via the supervisor queue. No
  physical-device evidence is claimed; #271 stays open (`status: partial`).

## Glass material system checkpoint, 2026-09-16 (#437 partial)

- The Native material contract now lives in `src/ui/materials.ts`: a
  restrained four-level hierarchy (chrome, elevated, modal, opaque content)
  on the established AHD dark palette, a `system/on/off` reduced-transparency
  resolver, and WCAG contrast pairs for the solid fallbacks. Token values
  ship in `src/ui/ui.css` between the material markers; inspiration only, no
  proprietary assets copied and no new transitions or animations added.
- Representative surfaces: footer and drawer resolve chrome, resource details
  resolve elevated, the resource/notification popover resolves modal with a
  new readable surface, and content cards stay opaque. Geometry (insets,
  widths, heights, positioning) is untouched and stays owned by #436.
- Accessibility: Settings gains a Transparency group wired through the
  existing device-preference pipeline (`data-reduced-transparency`);
  `prefers-reduced-transparency` and forced-colors both resolve every glass
  surface to its solid fallback. Measured contrast on the solid tokens: body
  text 12.1-15.4, secondary 4.6-5.2, primary-action label 4.8 (all WCAG AA;
  body pairs hold 7+). The existing reduced-motion takeover is unchanged.
- Focused evidence: `src/ui/materials.test.ts` (9 cases: token contract,
  blur/fallback resolution, resolver, shipped-stylesheet fallback, contrast,
  motion restraint), `src/ui/SettingsPanel.test.tsx` transparency reporting,
  `src/preferences.test.ts` normalization/dataset, plus neighboring
  `MobileNavigation`/`GameScreen` suites green. No full typecheck, verify, or
  smoke run per scope; no physical-device performance evidence is claimed.
- #437 stays open: representative phone screenshots and named-device
  performance evidence remain before any release claim.

## Glass material visual acceptance checkpoint, 2026-09-16 (#437 partial)

- New `smoke/material-visual-acceptance.spec.ts` renders the real game at
  320px and 390px portrait and asserts the shipped hierarchy: chrome footer
  plus 4-button bottom nav and drawer (translucent with blur), elevated
  resource details inside the modal resource popover with linked actions and
  close reachable, opaque never-blurred content cards, and no horizontal
  overflow. Supported appearance is the default dark theme (AHDGame
  light/pastel options are not ported); forced-colors and the Settings
  Transparency group both resolve every glass surface to its solid fallback
  with no blur. Large text keeps chrome and overlays reachable; Settings
  reduced motion removes the drawer animation.
- Rendered evidence (local, gitignored): `artifacts/smoke/material-{game,
  overlay, drawer, solid, large-text}-{320,390}.png`. One probe finding was
  a test-timing artifact, not a product defect: drawer screenshots caught
  the 0.18s slide-in mid-flight, so the spec now polls the drawer to its
  resting x before asserting geometry or capturing.
- Focused evidence: new spec 2 passed; neighboring
  `safe-area-composition` (3) and `preferences` (2) smoke green; unit
  `materials`/`SettingsPanel`/`MobileNavigation`/`GameScreen` (96) plus
  `preferences` (4) green. No full typecheck or verify per scope.
- #437 stays `status: partial` solely for named physical-device performance
  evidence; all software-verifiable acceptance is now covered.

## Glass material consistency audit, 2026-09-17 (#437 partial)

- Audited the PR #449 tokens and their application across persistent chrome,
  elevated controls, drawers, modals, cards, disclosures, and resource
  surfaces. Six inconsistencies closed, all background/border/fallback only,
  no geometry, no new transitions, no proprietary assets:
  (1) the creation sticky action bar was persistent chrome with an ad-hoc
  92% tint and no blur or fallback; it now resolves chrome tokens with blur
  and a solid app-bg fallback; (2) the drawer quick bar was an opaque card
  strip seam inside glass chrome; it is transparent so drawer chrome shows
  through; (3) drawer disclosures were a translucent tint with no fallback;
  they stay blur-free over the already-blurred drawer (no nested backdrop
  cost) and now resolve to solid elevated card in all three fallback
  branches; (4) the drawer edge and inner chrome dividers used opaque or
  doubled hairlines; outer chrome edges share the footer fg-18% translucent
  treatment with inner dividers at fg-10%; (5) resource details carried an
  opaque border; it now uses a translucent edge highlight in the modal-border
  family; (6) `.ahd-empty` was a translucent placeholder; it is opaque
  content. The drawer scrim stays unblurred by documented design.
- Accessibility and restraint preserved: solid fallbacks unchanged, so the
  contrast evidence (body 12.1-15.4, secondary 4.6-5.2, action label 4.8)
  still holds; backdrop blur stays on five large containers only (footer,
  drawer, creation bar, resource details, popover), never on small repeated
  controls; the reduced-motion takeover is untouched.
- Contract docs updated: the UI-REFERENCE material table now records the
  shipped PR #449 values (78%/16px, 72%/22px, 68%/28px) instead of the stale
  pre-#449 values, plus the full surface assignment.
- Focused evidence: `src/ui/materials.test.ts` (14: token contract,
  fallback branches incl. creation bar and disclosures, content opacity,
  quick-bar transparency, divider depth, contrast, motion restraint),
  `src/ui/DeviceChromeContracts.test.ts` (10: safe-area plus perceptible
  glass with drawer and creation-bar chrome bindings),
  `SafeAreaComposition`/`MobileNavigation`/`GameScreen` (98),
  `SettingsPanel` transparency (6), `preferences` (4). No full typecheck,
  verify, build, or smoke rerun per scope; shared-scheduler validation owed.
- #437 stays `status: partial` solely for representative phone screenshots
  and named physical-device performance evidence; no device claim is made.

## Glass material single-surface overlay fix, 2026-09-17 (#437 partial)

- `.ahd-resource-details` renders only nested inside the modal
  `.ahd-resource-popover` (GameScreen), so every resource overlay opening
  stacked two backdrop blurs (22px elevated inside 28px modal) behind a
  double border/shadow frame at ~91% combined opacity, burying the modal
  translucency and contradicting the system's own no-nested-backdrop-cost
  rule used for drawer disclosures. The nested section is now a flat
  transparent single-surface overlay (no own background, blur, edge, or
  depth; padding/margins/gaps untouched), so an open overlay paints exactly
  one modal glass surface. Reduced-transparency selectors outrank the nested
  rule and forced-colors pins it solid, so all fallbacks stay opaque and the
  contrast evidence still holds. No geometry, motion, or token changes.
- Focused evidence: `src/ui/materials.test.ts` (15, incl. the new nested
  single-surface regression case), `src/ui/DeviceChromeContracts.test.ts`
  (10), `GameScreen`/`GameScreenNotifications`/`SettingsPanel` (75),
  `preferences` (4). No full typecheck, verify, build, or smoke rerun per
  scope; shared-scheduler validation owed (incl. the material visual
  acceptance spec at 320/390px, which could not run locally: no matching
  Playwright browser installed and port 1427 held by another session).
- #437 stays `status: partial` solely for representative phone screenshots
  and named physical-device performance evidence; no device claim is made.

## Dynamic Island safe-area composition checkpoint, 2026-09-16 (#436 partial)

- Browser-geometry contract only. `env(safe-area-inset-*)` is now used
  coherently across every chrome surface: top inset for main content, drawer,
  and landing (padded chrome, never overlaid on the island); bottom inset for
  the fixed footer, creation sticky action bar, and drawer quick bar; side
  insets for the content container, drawer, and bottom navigation.
- Two geometry fixes: the bottom navigation's full-bleed negative margins now
  mirror the container's side insets instead of defeating them in landscape,
  and a landscape query pins the fixed footer to the side insets where the
  cutout and rounded corners move to the sides. The viewport meta adds
  `interactive-widget=resizes-content` so keyboard-adjacent layouts
  (creation inputs, search) resize rather than hide behind the keyboard;
  inputs already hold 16px to avoid iOS zoom, and large text scales type
  with no hidden-control fallback.
- Evidence: new `src/ui/SafeAreaComposition.test.tsx` (13 cases: geometry
  contract plus rendered footer/drawer/overlay visibility at 320/390px,
  landscape shape, and large text) and new
  `smoke/safe-area-composition.spec.ts` (portrait 320/390px plus 844x390
  landscape: overflow, footer/nav visibility, resource overlay, drawer).
  Focused runs green: 13 new, 32 MobileNavigation/MpModeScreenNav, 56
  GameScreen. Full typecheck, verify, and Playwright runs were not repeated
  for this CSS/test-only slice.
- Honest gaps: no physical-device pass on a Dynamic Island iPhone (portrait /
  landscape, keyboard, large text, reduced motion, orientation changes,
  rounded-corner and home-indicator behavior), no rendered
  AHDGame-vs-Native comparison, and the new smoke spec has not yet run in CI.
  #436 stays open with `status: partial`; no device claim is made.
- Visual-acceptance follow-up, 2026-09-16: `smoke/safe-area-composition.spec.ts`
  passes 3/3 against the installed desktop Chromium build (320px portrait,
  390px portrait, 844x390 landscape: zero horizontal overflow, footer/primary
  nav visible, resource overlay and drawer controls reachable). Structural
  limit: desktop Chromium resolves every `env(safe-area-inset-*)` to 0px (no
  island, cutout, or home indicator), so this run proves the geometry contract,
  not island-shaped rendering. Source-grounded comparison: the chrome preserves
  the reference hierarchy per the character-first correction above
  (Profile-first entry, consistent Actions label, national details under
  Economy) instead of a generic dashboard; no rendered AHDGame-vs-Native
  screenshot was captured. #436 stays open with `status: partial` only for
  the named physical Dynamic Island device pass. Probe screenshots removed;
  no product code changed in this follow-up.
- Gap-closure follow-up, 2026-09-17 (CSS/layout only, on top of merged #449,
  no navigation/mail behavior change): the landing entry shell now clears the
  home indicator (`max(1.5rem, env(safe-area-inset-bottom))`); the standalone
  help/settings/ask (`src/App.tsx`) and character-creation
  (`src/ui/CharacterCreationScreen.tsx`) shells clear it the same way the
  NewGameScreen shell already did (`max(2rem, env(...))`); the 1024px
  reading-width override keeps side insets on `.ahd-main`/`.ahd-footer-inner`
  (`max(1.5rem, env(...))`) so wide landscape keeps rounded-corner/cutout
  clearance; bare MP mail compose inputs/textarea hold the 16px iOS anti-zoom
  floor without restyling; the docked drawer gains a `100vh` fallback ahead of
  `100dvh`. Evidence: new `src/ui/SafeAreaGaps.test.ts` (5 cases) plus
  neighboring `DeviceChromeContracts` (10), `SafeAreaComposition`,
  `MobileNavigation`, `MpModeScreenNav` suites green. #436 stays open with
  `status: partial` for the named physical-device pass; no device claim made.
- Native-fallback follow-up, 2026-09-17 (WKWebView zero-env failure): internal
  iOS 0.1.8 resolved `env(safe-area-inset-top)` to zero, which no web CSS can
  distinguish from a notch-less device. New `src/ui/iosSafeArea.ts` measures
  the live value with a probe and, only on iPhone-class portrait webviews
  reading ~zero, publishes a 59px fail-safe floor as
  `--ahd-safe-area-top-fallback` (composed into all 11 top rules: game main,
  drawer, landing, MP layout, docked drawer, resource popover, Ask window,
  App/NewGame/Creation shells) plus `data-ahd-safe-area` and
  `window.__AHD_SAFE_AREA__` diagnostics. The probe is the chosen source
  over the locked native-derived window position APIs (async bridge call,
  physical pixels, main-thread caveat); no dedicated inset command exists,
  pinned by a Rust no-native-surface test. Desktop,
  Android, iPad, landscape, keyboard, and pinch zoom are untouched by
  construction. Evidence: new `iosSafeArea` (14) + `SafeAreaFallback` (10)
  cases, red-checked (8 fail without the fix); neighboring safe-area suites
  green. `NewGameScreen` seed-length case times out identically on the clean
  tree (pre-existing, unrelated). #436 stays open with `status: partial`
  for the named physical-device pass reading the diagnostic; no device
  claim made.
- Root-clearance follow-up, 2026-09-18 (layout invariant only, no geometry
  restyle): both shells measured the fixed footer but published
  `--ahd-footer-height` on the screen element alone, which `html`
  (`scroll-padding-bottom`) cannot inherit, so the document rule always used
  the 9rem fallback while `.ahd-main`/popover tracked the grown footer. New
  shared `src/ui/footerClearance.ts` (`installFooterClearance`) publishes the
  live height to the screen element and `document.documentElement`, clears
  the shared root value on unmount, and is consumed by `GameScreen` and
  `MpModeScreen` with no per-screen logic change. Desktop is unchanged by
  construction (same inherited value for descendants; `env()` is zero).
  Evidence: new `src/ui/FooterClearanceRoot.test.tsx` (9 cases: helper
  publish/resize/uninstall/no-footer, the `html` consumer contract, and
  rendered GameScreen root tracking plus unmount cleanup at 390px phone and
  1280px desktop with a 172px grown footer); neighboring `MpFooterClearance`
  (renders through the same helper), `FocusScrollContracts`,
  `SafeAreaFallback`, `SafeAreaGaps`, `DeviceChromeContracts` suites green
  (36 cases). No physical-device pass; full typecheck/verify/build owed via
  the shared scheduler. #436 stays open with `status: partial`; no device
  claim made.
- Bottom-floor follow-up, 2026-09-18 (zero-env home-indicator clearance):
  the WKWebView fail-safe floored only the top inset, so on a zero-env phone
  webview the fixed footer (`max(0.35rem, env(bottom))`), creation sticky bar
  (`0.6rem`), drawer chrome (`0.7rem`) and quick bar (`0.5rem`), and the Ask
  window composer (`10px`) all fell back to bases under the 34px home
  indicator. One env() implementation reports every inset, so the same
  iPhone-class portrait + ~zero-top gate now also publishes a 34px
  `--ahd-safe-area-bottom-fallback`, composed as
  `max(<base>, var(...), env(...))` into those five persistent bottom rules;
  a working native bottom inset always wins the max(), and desktop, Android,
  iPad, landscape, and home-button iPhones (working top reads 20px, gate
  closed) stay byte-identical. The floor follows the gate, never the bottom
  probe, so a transient bottom misread moves nothing; the probe reading is
  diagnostic-only (`measuredBottomPx`/`fallbackBottomPx` in
  `window.__AHD_SAFE_AREA__`). Scrolling content shells (landing 1.5rem,
  entry/creation 2rem bases) are intentionally untouched: their content
  scrolls clear rather than parking controls under the indicator. Liquid
  Glass styling untouched (padding-bottom lines only). Evidence: extended
  `src/ui/iosSafeArea` (bottom var, 34px constant, single-gate refresh) with
  updated `iosSafeArea` cases plus new `src/ui/SafeAreaBottomFallback.test.ts`
  (token default, four-control + composer composition with bases intact,
  landscape env-only, 390px-phone vs 1280px-desktop gate publication,
  keyboard `scroll-padding-bottom`/drawer focus-ring coexistence) and the
  Ask composer contract extended to the new composition. Focused runs green
  on both vitest configs (47 UI incl. neighbors) plus 63 neighboring chrome
  cases (`DeviceChromeContracts`, `SafeAreaComposition`, `SafeAreaGaps`,
  `SafeAreaEntryShells`, `FocusScrollContracts`, `FooterClearanceRoot`,
  `MpFooterClearance`, `DualPaneTracks`); node config 41. No full typecheck,
  verify, build, or device pass; owed via the shared scheduler. #436 stays
  open with `status: partial` for the named physical-device pass reading the
  extended diagnostic; no device claim made.

## Dual-pane and hinge-aware layout checkpoint, 2026-09-16 (#438 partial)

- The shell reports dual-pane only for separated viewport segments, a
  spanning-media match, or the explicit `?ahd-span=` QA override
  (`src/ui/dualPane.ts`). Viewport width is not an input, so a generic wide
  window keeps the single-pane phone flow: bottom nav, modal drawer, compact
  footer, stacked lists.
- Deliberate pairings without duplicated state: docked navigation drawer
  beside routed content (same destinations/handlers, no modal trap), and
  parties list/detail landmarks sharing one selection. Other list/detail
  surfaces keep the stacked flow until they adopt the landmarks.
- Hinge avoidance: segment-fitted grid tracks and footer placement via
  `env(viewport-segment-*)` under `spanning` media (ignored where
  unsupported); Tauri webviews expose no segment API today, so dual-pane
  stays unreachable there. No material tokens changed (#437 owns them).
- Focused evidence: `dualPane` (14), docked drawer, GameScreen single/dual
  shell, parties list/detail, plus adjacent notification shell suites green.
  No full typecheck or verify ran for this UI-only batch (per batch scope).
- Behavior contract and QA path: [dual-pane layout](DUAL-PANE-LAYOUT.md).
  Folded/unfolded posture acceptance on representative hardware remains open;
  no device claim is made from viewport width or the override.

## World map directory checkpoint, 2026-09-15 (#73, first vertical slice)

- N07: the phone-first offline `World map` route lists the actual projected nations and regions with
  search, 44px+ touch rows, and links into the existing Nations/Regions detail routes. No coordinates,
  leaderboards, election links, or profile data are fabricated; Hall of Fame stays explicitly tracked.
- Only the supported `worldMapSection` view preference persists (device preferences, Settings UI).
- Validation: focused UI tests (`WorldMapPanel`, drawer, settings, preferences) against real engine
  projections. #73 remains open: Hall of Fame/leaderboards, plotted map surfaces, country/region map
  depth, and the remaining acceptance checklist (stable player/era filters, election/profile entity
  links, mobile-width verification beyond the directory slice).

## World directory checkpoint, 2026-09-18 (#73, directory/read-only slice)

- N07: the read-only `World directory` route (World > Diplomacy) lists exactly the recorded nations
  from `projectWorldOverview` with search, 44px+ touch rows, and links into the existing Nations
  detail route. No coordinates, regions, leaderboards, election links, or profile data are rendered
  or implied; empty and no-match states are explicit. No view state persists.
- Validation: focused UI tests (`WorldDirectoryPanel` populated/empty/search/honesty, modal + docked
  drawer reachability) against real engine projections, updated drawer-structure assertions, and the
  route-matrix sweep at 320/390/1280px. Existing world/country/region routes and MP/SP gating
  untouched. #73 remains open: plotted map surfaces, Hall of Fame/leaderboards, and map-entity links
  beyond the nation detail route.

## Nation context and identity navigation checkpoint, 2026-09-15 (#84)

- Drawer identity now exposes real Profile, Actions, and Wallet destinations;
  Portfolio and Banking cross-link as the supported Native wallet surfaces.
- Nation detail links into the offline World map directory. Nation deep-links
  update browse context only, so returning preserves the viewed nation without
  mutating the player's country, save, turn, or controlled character.
- Focused evidence covers the full navigation flow plus World, Finance, drawer,
  map, and GameScreen surfaces (103 tests). #84 stays open because Native has
  no projected player-corporation or union membership destination and records
  no coordinates for plotted country maps.

## Banking hero subset checkpoint, 2026-09-17 (#386)

#386 done as a bounded Native UI slice; no engine, session, DTO, signing,
version or release file changed. Child of #378 and #143.

- Reference (read-only inspection of the public AHDGame checkout at
  `e364c04`, no downloads): `centralBank.heroImage`/`heroAlt` per country
  in `src/lib/constants/countries.ts` (US `federal-reserve`, GB+SCO/WAL
  `bank-of-england`, JP `bank-of-japan`, DE/IE remote-only `ecb`, CN
  remote-only `peoples-bank-of-china`, DD flag URL with no photo hero),
  the Commons file identity per slug in
  `src/app/api/images/hero/[slug]/route.ts`, the icon/gradient
  `BankingHero` in `src/app/banking/BankingHubClient.tsx`, and the photo
  pattern `InstitutionMasthead` in
  `src/components/national/InstitutionMasthead.tsx`.
- `public/static/heroes/{federal-reserve,bank-of-england,bank-of-japan}.webp`
  vendored under the same public path, SHA-256 verified byte-identical to
  AHDGame (hashes in docs/UI-REFERENCE.md). Only these three slugs have a
  local file upstream; DD/CN/DE/IE and all other countries take the
  Actions fallback with a nonempty fallback accessible name. No mapping
  was invented from executive art.
- `src/ui/RouteHero.tsx`: `BANKING_HERO_IMAGE`/`BANKING_HERO_ALT`,
  `bankingHero()`/`bankingHeroAlt()` with exact-key total fallback.
  `src/ui/FinancePanel.tsx`: Banking renders the hero keyed by the new
  optional `countryId` prop (wired from `GameScreen`), with cash/savings
  balances, a "Savings holder · {currency}" label over the verbatim
  holder, and the unchanged Portfolio cross-link; deposit/withdraw
  validation, limits, busy/unavailable states and payloads unchanged.
- Shared 172px/220px crop (120px short-landscape cap) reused with no new
  CSS; balance rows keep the shrink/wrap contract and transfer controls
  wrap at 320px.

Evidence: new `src/ui/BankingHeroImagery.test.tsx` (18 cases: resolver,
total alt, grounded alts, webp bytes, local decode, error fallback,
Banking surface, mechanics preserved, crop CSS, holder/currency labels,
320px contracts) plus unchanged `FinancePanel`/`GameScreen` suites and
`smoke/route-heroes.spec.ts` Banking coverage at 320/390/desktop.
Validation: focused UI suites only, per the slice boundary — no full
verify/build/typecheck/Playwright run.

Honest gaps: unbundled countries show honest generic art rather than
their real central bank; the BankingHub icon/gradient composition is not
ported; prime/APY rates omitted (no Native DTO); no physical-device run.

## Union sector aggregation and organizer checkpoint, 2026-09-17 (#320 partial)

- The union turn no longer builds dues from a synthetic total-labor-force x
  1953-weight sector. Dues rows now come from the recorded #296
  corporate-sector assets each union represents (`representedSectorsForUnion`
  in `packages/engine/src/unions/sectorAggregation.ts`): stored headcount x
  union density, country annual wage from current region labor and payroll.
  Display headcount and dues headcount share one record and cannot drift.
  The dues helpers are untouched, so arithmetic stays mainline-golden.
- `UnionOrganizer` rows (`packages/engine/src/unions/organizers.ts`) port
  the reference collection at seeded-roster granularity with deterministic
  `${unionId}:${characterId}` ids, banked strength weighting leadership votes
  and political-contribution payouts, 0.5%/turn decay on pools and banks
  (suspended unions frozen), and the 100-strength election gate. Null-pointer
  sectors adopt into their industry's seeded union; held shops are never
  overwritten.
- Save shape stays additive with no version renumber: `unionOrganizers` is
  optional with absent-means-empty, `Union.strength` absent reads as zero,
  and load validates without materializing either field, so a mid-campaign
  save/load leaves union rows byte-identical. Present-but-invalid rows fail
  closed at the save boundary.
- Focused evidence: new `sectorAggregation.test.ts` (7) and
  `organizers.test.ts` (9) green plus unchanged `unions.sim.test.ts` (28,
  incl. the mid-campaign round-trip), 44 total. The v42 projection goldens
  still fail, byte-identical on clean main and on this branch, so that is a
  pre-existing failure, not a branch regression; no full typecheck, verify,
  or build per scope, queued with the supervisor.
- #320 stays open: drive crediting and organize commands land with #322,
  atomic payout ledger with #321, bargaining/strikes/phase timing with
  #322/#323; per-sector wage/unionization tables remain a documented gap.

## Union organizer payout checkpoint, 2026-09-17 (#321 partial)

- The union turn now pays the requested contribution to organizers atomically
  (`applyUnionContributionPayouts` in
  `packages/engine/src/unions/contributions.ts`): the pinned
  `distributePoliticalContributions` split over `eligibleOrganizerShares`
  filtered to resolvable recipients, so the treasury debit equals exactly
  what real recipients are credited; stale organizer pointers are skipped,
  never paid and never debited (issue #321 mandates debit-only-credited,
  where the reference would still debit a ghost payout while its character
  write matches nothing). Each payout credits the single local
  campaign-funds balance (`Politician.funds`, or `player.funds` for the
  reserved `"player"` organizer; Native has no forex-split campaign wallet)
  and appends one `union_contribution` ledger row shaped like the reference
  `financialTxLog` entry (`type`/`subjectType`/`subjectId`/`subjectName` with
  the reference `"Unknown"` fallback, `amount`, union-country currency from
  the verbatim `COUNTRY_CURRENCY_MAP` with USD fallback,
  `counterpartyType: "system"`, `meta.source: "union_pac"`), with
  deterministic `${unionId}:${turn}:${recipientId}` ids doubling as
  idempotency keys: a same-union same-turn re-apply throws without touching
  state. Validation runs before any write and a snapshot restores treasury,
  recipients, ledger rows, and ledger presence together, so failed calls
  leave absent ledgers absent and save bytes untouched.
- Save shape stays additive with no version renumber:
  `unionContributionLedger` is optional with absent-means-empty, load
  validates without materializing, and present-but-invalid rows fail closed
  at the save boundary. No bargaining, strikes, or #322/#323 behavior.
- Focused evidence: `contributions.test.ts` (16: weighted split with
  debit==credits==ledger conservation, fractional-split absorption with
  cents treasury, recipient-id ordering, ineligible/stale skip without
  debit, no-organizer surplus retention, suspension freeze, zero-rate and
  zero-flow silence, player credit and `"Unknown"` naming, union-currency
  rows with full verbatim currency table, same-turn duplicate rejection
  with untouched state plus clean next-turn pay, 7-way invalid-recipient
  rollback, per-turn accumulation, save round-trip with absent-defaults,
  9-way corrupt-ledger refusal, absent-ledger failure silence) plus the
  re-fixtured #320 split test on real politician ids, with unchanged
  `organizers.test.ts` (9), `sectorAggregation.test.ts` (7) and
  `unions.sim.test.ts` (28, incl. the mid-campaign round-trip), 60 total
  green. Adversarial review against pinned AHDGame `e364c04`
  (`turn/unions/index.ts` payout leg, `unionPoliticalContributions.ts`,
  `COUNTRY_CURRENCY_MAP`, `financialTxLog` row shape) found and fixed two
  defects red-first: 11 missing currency codes (HU/PL/RO/YU/BG/BLR/UKR/CS/
  BAL/SCO/WAL fell back to USD) and ledger materialization on failed
  validation. The v42 projection goldens still fail, byte-identical on
  clean main and on this branch, so that is a pre-existing failure, not a
  branch regression; no full typecheck, verify, or build per scope, queued
  with the supervisor.
- #321 stays open: every acceptance bullet has focused proof above, but the
  shared-scheduler full validation (typecheck/verify) is still owed and the
  merge decision sits with the supervisor.

## Pension lifecycle checkpoint, 2026-09-18 (#315)

- The occupational (second-pillar) pension lifecycle is ported from pinned
  AHDGame `e364c04` (`src/lib/pensions/rules.ts`, `pensionTurn.ts`,
  `pensionBenefits.ts`, `employerPensionCosts.ts`, `db/types/pensionScheme.ts`):
  pure contribution/accrual/deficit-top-up/retirement/benefit-cut/investable-cash
  rules with verbatim constants, `PensionScheme`/`pensionLedger` state, the
  `pensionTurnPhase` charge-before-accrual pass with retire-then-pay benefits,
  and additive save validation with absent-means-empty old-save onboarding.
  Every amount is home-country local units (Native corporations keep a single
  `liquidCapital` balance, so the reference anchor conversions are identity);
  the covered wage bill is represented headcount x country annual wage /
  TURNS_PER_YEAR over the same dues-row population, unscaled by unionization
  exactly like the reference sums whole-sector labour cost.
- Turn semantics delivered: funded contributions debit employers and accrue
  claims with debit==credit==ledger conservation; below-accrual rates drift
  into deficit and draw wage-share-split top-ups; broke employers record
  shortfalls while the claim still accrues; benefits retire claims before the
  drawdown so first pensioners draw the same turn, pay cash-only with pro-rata
  cuts, and leave unpaid claims booked; suspended unions originate no charge
  while their pensioners still draw; zero/absent rates stay silent; per-union
  plans validate before mutating with snapshot rollback; same-turn re-runs are
  idempotent via `lastChargedTurn`/`lastBenefitTurn` stamps plus deterministic
  ledger ids; unions iterate in sorted id order with no RNG consumed; the
  phase sits immediately after `unionsTurnPhase` (corporationTurn < unionsTurn
  < pensionTurn, matching the reference relative order).
- Focused evidence: `pension.test.ts` (30 rules/validator tests) plus new
  `pensionTurn.sim.test.ts` (19 turn/session tests: twin-differenced funded
  conservation, top-up emergence, shortfall-with-accrual, partial-affordability
  no-overdraw with contribution priority, retirement ordering,
  pro-rata cut with no-overdraw, duplicate refusal with total rollback,
  idempotent re-run, sorted deterministic ordering, suspension freeze with
  benefits, phase position and RNG-freedom, mid-campaign round-trip, old-save
  onboarding, 3-way corrupt-save refusal, post-rename load, static currency
  pin), with unchanged `contributions.test.ts` (16), `organizers.test.ts`
  (9), `sectorAggregation.test.ts` (7) and `unions.sim.test.ts` (28),
  109 total green. Adversarial review against the pinned reference found and
  fixed five defects, three red-first: benefit-leg ids baked the `system` sink
  while the validator recomputed with `""` (every benefit save failed to
  reload); ledger `unionName` equality rejected valid history after a union
  rename (now display text, identity rides the deterministic id); ledger
  currency read mutable budget/forex rows instead of the static union-country
  map shared with `contributions.ts`; a refused plan created its scheme row
  before validating (now plans against the prior position and creates only
  after validation); the top-up affordability check ran against the same
  pre-debit balance as the contribution, so an employer covering each charge
  alone but not both was driven negative (now checked against the
  post-contribution balance with contribution priority, matching the
  reference sequential-debit order; the ledger array is likewise created at
  apply time so a refused plan leaves no trace at all).
- Explicit residuals, not gaps in the delivered acceptance: the bargaining
  writer that settles `pensionContributionRate` is #322 (the turn charges only
  unions already carrying a rate); there is no index-fund substrate, so the
  investing pass is the reference fail-closed no-op with the
  `pensionInvestableCash` rule ported and tested for it; the first-pillar
  state pension (budget line) is untouched, as in the reference; the
  employer-cost projection is per-union where the reference aggregates per
  employer across agreements, pending a real employer-console caller.
- #315 stays open until the supervisor merges: shared-scheduler full
  validation (typecheck/verify/build) is queued, not run locally per scope.
## Union bargaining checkpoint, 2026-09-18 (#322 partial)

- Bargaining campaigns run the full lifecycle against pinned AHDGame
  `e364c04`: mandate-gated open over the employer's country+industry locals,
  employer accept/counter/reject, union accept (member ballot when organizers
  hold strength, direct settlement on an empty electorate), counter, withdraw,
  and one-rung-per-turn escalation (overtime ban 35 / selective 50 / industry
  65 support, 400-per-local strike fund, 40-per-local ban upkeep) in
  `packages/engine/src/unions/actions.ts` over the pure rules in
  `bargaining.ts` and state in `campaigns.ts`. Every action validates before
  mutating and restores snapshots on a mid-write throw; same-turn double acts
  refuse with the reference reload message.
- Economic enforcement lands exactly once in `corporationTurn`
  (`corporation/corporationLabour.ts`): turn-start strike state folds into a
  worker-weighted output factor (0.75 striking, 0.96 ban) plus a transient
  -8pp margin hit, applied in the corp math, then strike stepping
  (concession / waitout with the +10 bump capped at 100 / ban / agreement)
  runs after it. The unions pass never touches revenue, margin, or output;
  a settled agreement suppresses the hit through its no-strike window, and
  the penalty leaves with the strike. NPP employers and NPP unions answer
  through the deterministic policy in `employerPolicy.ts`; worker political
  feedback is computed from live campaign state through the verbatim
  provider (dispute drag, settlement lift, suspended excluded).
- Save shape stays additive with no version renumber:
  `bargainingCampaigns` / `collectiveAgreements` are optional with
  absent-means-empty, load validates without materializing, and
  present-but-invalid rows fail closed at the save boundary; pre-#322 saves
  round-trip byte-identical. The corp-turn labour read validates present
  rows without materializing, so idle worlds stay map-free.
- Focused evidence: `bargaining.test.ts` (25: audited constants, mandate
  gates, terms, open/counter/dispute, ladder rungs and strike-plan targeting
  with no-target/cooldown/funds blocks, settlement windows, lapse/reopen,
  ballot open/tally/close rules, strike machine ignition/hysteresis/
  resolution paths), `labourRelations.test.ts` (28: public open/answer/
  ballot/re-vote flows, escalation with single fund debit, withdraw cooldown,
  refusals and no-row-left failure silence, deadline/expiry/lapse clocks,
  upkeep funding and defunded-ban end, suspended-treasury freeze, mandate
  refresh, NPP autoplay without revenue touch, settlement math and policy
  decisions, nudge drag/lift, advanceTurn seam, mid-campaign reload, old-save
  byte stability, corrupt-map refusal), `corporationLabour.test.ts` (15:
  idle/ban/strike/agreement factors, single-application revenue and margin
  proof, waitout/concession/agreement/ban resolution, no manufactured
  strikes, map-free corp turns, deterministic twins), 68 total green, with
  neighboring `unions.sim` / `contributions` / `organizers` /
  `sectorAggregation` / `corporateSector*` / `corporationTurn.sim` suites
  green. Red-first fixes: `castRatificationBallot` crashed on a missing
  `ratificationWeightFor` import (any ballot cast threw `ReferenceError`),
  suspended unions were debited overtime upkeep against the frozen-treasury
  contract, and the corp-turn labour read silently tolerated corrupt rows.
- #322 stays open: shared-scheduler full validation (typecheck/verify) is
  still owed and the merge decision sits with the supervisor. Documented
  source gaps, not silent omissions: government mediation intervention
  (#127 crisis path) is not ported, organic grievance strikes never ignite
  (the corp turn resolves union-called strikes only), agreement wage floors
  have no Native consumer yet (no-strike window only), and the
  `labourNudgesForTurn` feedback has no metric-engine writer (the write
  itself stays a documented blocker).

## Interbank lending and servicing checkpoint, 2026-09-18 (#326)

#326 done as a bounded engine plus session-seam slice on top of the #325
balance sheet. Child of #109; depends on #329 for failed-bank creditor
resolution and leaves margin/discount/prop-trading halves unported.

- `packages/engine/src/banking/interbank.ts` (new): `lendInterbank`,
  `repayInterbank`, `quoteInterbankMax` plus idempotent
  `serviceInterbankLoans` (interest-only, arrears counter, default
  write-off on the 8th consecutive shortfall). Gates are source-faithful:
  active charters both sides, lendable-headroom share cap, lender cash,
  borrower limits; a failed borrower's repay is refused and its recorded
  debt settles through `returnDepositBook` (#329), never out-of-band.
  No kill switch is ported: source gates on privateBanking plus
  propTrading, but native banking is always on, so an active charter is
  the whole enablement check. Every mutation validates first and applies
  lender cash, borrower cash/debt, and loan state together, so failures
  leave the world byte-identical.
- Wired into `bankingTurnPhase` after every bank's deposit/interest/
  premium/named/NPC pass and before `bankSolvencyTurnPhase` reads cash,
  matching source's bankingTurn (incl. interbank) before solvency order.
  Registry order verified: bankingTurn, playerLineOfCredit,
  bankSolvencyTurn. Save schema v48 for `world.interbankLoans` with
  empty-book backfill on pre-#326 saves.
- `src/game/session.ts`: `lendInterbank`/`repayInterbank`/`interbankQuote`
  seam commands over the serialized save.

Evidence: engine `interbank.test.ts` (origination gates, principal
repayment incl. failed-charter refusal, interest/arrears/default,
phase ordering, neighbor isolation of retail/insurance/foreign books,
deterministic ordering, save round-trip and backfill) plus unchanged
`bankingTurn` (13), `bankSolvencyTurn` (11), `balanceSheet`, `npcBanks`,
`migration`, `constants`, and `playerLineOfCredit` (19) neighbors, 121
engine tests green; session `interbank.test.ts` (9: lend/persist,
over-cap refusal, advance plus interest plus repay, quote boundary,
uncovered-repay refusal, 8th-shortfall default, determinism,
byte-identical reload, pre-#326 load) plus unchanged
`lineOfCreditSession` (2), 11 session tests green. 132 focused total.
Validation: focused suites only, per the slice boundary — no full
typecheck, verify, or build, queued with the supervisor.

Honest gaps: failed-bank creditor sweep itself is #329, not here;
central-bank margin line, B8 discount window, and prop-trading book stay
unported; no physical-device run.

## Action outcome history checkpoint, 2026-09-18 (#58 partial)

#58 stays open: this is one bounded display slice over the existing
session outcome projection, not the full structured-result scope. No
engine accounting changed; no save schema change.

- `src/ui/ActionsHub.tsx`: each Recent-results entry now carries an
  explicit "Succeeded" badge, an accessible `: succeeded` article name,
  and the recorded result message alongside the existing target,
  resource/stat changes, and follow-ups. Entries remain successes only:
  failures record no history (no partial spend) and surface through the
  existing `role=alert` error banner on the Actions destination.
- The projection itself (`session.ts` outcome/history via notifications,
  surviving turn advancement and save/reload) is unchanged and already
  covered; this slice adds only the status/result copy rendering.

Evidence: `src/ui/ActionsHub.test.tsx` (3 new: success status plus
result copy rendering, empty history omits the section, history capped
at five entries), 14 UI tests green; unchanged
`src/game/actionOutcomes.test.ts` (4: changed resources plus target
plus follow-ups, history across turn plus save/reload, notification
projection, prerequisite failure with no spend and no history) green.
Validation: focused suites only, per the slice boundary — no full
typecheck, verify, or build, queued with the supervisor.

Honest gaps: no per-action reference outcome copy (AHDGame card/modal
detail beyond the engine message); failures stay transient banner text
with no persisted rejected-attempt record; canvass-targeting work on
another branch is untouched; no physical-device run.

## Outstanding issue reconciliation, 2026-09-23

- Closed #295, #307, #320, #321, #323, and #326 after checklist/evidence
  review of merged implementation PRs and successful hosted `verify` checks:
  #295 (#417/#503), #307 (#545), #320 (#542/#504), #321 (#546), #323 (#563),
  and #326 (#559). The #295 acquisition, save/load, regional and company UI
  evidence is detailed above; current-main focused tests were acquisition 8/8,
  session 8/8, related UI 61/61, and `npm run typecheck` exit 0.
- #308 is now `status: partial`: coupon, maturity, supported buyback/default
  state, atomic flows and reload tests are delivered by #547, with phase order
  in #550 and hosted verification green. Creditor asset/ownership consequences
  on corporate default remain unimplemented; bondholders currently retain
  frozen holdings at the default quote. Market pool/escrow/FX and restructuring
  remain unsupported.
- #322 remains `status: partial` because the labor-nudges metric writer needed
  to apply worker political feedback is still absent. #299 remains partial:
  regional inventory and linked buy/list controls exist, while bargaining and
  nationalization fan-out plus rendered source visual comparison remain open.
- Parent trackers now record #211 as 4/7 child issues complete, #110 as 4/5,
  and #114 as 4/5. #109 has all five child slices closed, while its broader
  combined stress/save/turn acceptance remains partial and open.
