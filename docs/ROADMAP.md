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
| N09 | In progress | Help, settings, search and notifications | Explicit offline behavior, real content/results and accessible controls; MP-only presence stays deferred |
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
| S04 | Saves | In progress | S02 | Provide save import/export interchange | Real fixture both directions; no silent version downgrade |
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
| U09 | UI | Done | E02,U07 | Expose party membership and candidacy through real engine actions | Filing,withdrawal,save/reload and accessible race pagination |
| U10 | UI | Done | U09,Q01 | Complete a seeded election-to-office loop and expose legislature actions | Genuine t95 fixture, election win,sponsor,vote,relaunch through production UI |
| M01 | Mechanics | Done | G03 | Inventory phase/order and feature drift from AHDGame | Named differences,source refs,release blockers |
| M02 | Mechanics | In progress | M01 | Close referendum lifecycle omissions | Behavioral parity scenarios through public actions/turns |
| M03 | Mechanics | In progress | M01 | Resolve war abstraction mismatch | Actual authoritative rules; no rebalancing or blanket waiver |
| M04 | Mechanics | In progress | M01 | Close phase order and TFP differences | Reference-driven tests; impacts traced |
| M05 | Mechanics | In progress | M01 | Close electoral and content omissions | National/subnational lifecycle and all supported content |
| M06 | Mechanics | Queued | M02,M03,M04,M05,M07,M08 | Sign off reference mechanics coverage | No unacknowledged mechanics gaps in 1.0 candidate |
| M07 | Mechanics | In progress | M01 | Consume authoritative Game-owned rules one action/system at a time | Fundraise shared cost/yield/eligibility first; preserve complete stat/currency context before parity signoff; [Game #1724](https://github.com/Egg3901/AHDGame/issues/1724) |
| M08 | Mechanics | In progress | M01,M07 | Detect upstream drift and gate consumer updates | Immutable source checks first; complete source coverage, update PRs and ruleset/save policy in [#120](https://github.com/Egg3901/AHDNative/issues/120) |
| Q01 | Validation | Done | E03,S02,U07 | Integrated gameplay smoke through actual UI | Create,country,action,turn,save,close,reload,continue |
| Q02 | Validation | Done | Q01 | Exercise error and concurrency smoke | Corrupt import,double-click turn,save failure/recovery and worker startup failure pass integrated smoke at fc87a991 |
| Q03 | Validation | In progress | Q01,U08 | Capture representative UI evidence | Desktop and mobile screenshots from real running world |
| Q04 | Validation | Done | E06,E07,Q02,Q03 | Run batched regression gate | Focused changes first; full suite only integration checkpoint |
| Q05 | Validation | Queued | Q04,M06,S05 | Assess 1.0.0 candidate readiness | Exact commit/results/remaining limitations; no placeholder success |
| I01 | iOS | Done | Q04,owner preview approval | Build first private signed feedback preview | 0.1.0 (1.6) exported, Apple VALID/INTERNAL_ONLY, attached to Owner review; #124. Full 1.0 gate remains Q05/I04 |
| I02 | iOS | Queued | I01 | Install and smoke on iPhone | Real install,launch,world,turn,save/relaunch |
| I03 | iOS | Queued | I02 | Validate lifecycle and memory/performance | Background,lock,interruption,low memory,named-device measurements |
| I04 | Release | Queued | I03,G06 | Cut private 1.0.0 when release gates pass | Version consistency,private artifact,release notes,known risks |
| P01 | Multiplayer | Queued | I04 | Adapt shared screens to authoritative MP transport | Existing auth/server authority unchanged |
| P02 | Multiplayer | Queued | P01 | Validate reconnect,read-only safety and mode separation | SP remains offline; MP cannot mutate local authoritative world |
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

## Integration checkpoint, 2026-09-10 06:18 UTC

- Engine import/session: `0c8e7ae`; UI components: `8314d8d`; native storage: `16e4c9a`; mechanics audit: `b964028`.
- Local integration: production frontend build, 7 session/worker tests and 17 component tests pass. Native storage: 10 tests pass after replacement-path review.
- Real Chromium smoke at 390 x 844: create 1953 US world, donate personal cash, advance, save, reload the app, resume and advance again. Passed with no browser errors or horizontal overflow. This uses the actual worker and browser QA persistence, not a mock world. Native invoke and iOS lifecycle are still unverified.
- Screenshot inspection found rate formatting wrong because the display expects percentages while the engine supplies fractions. UI correction is in progress.
- Supported-world replay, mobile UI corrections and iOS worker feasibility are active independent slices. No paid build was started.

## Follow-up checkpoint, 2026-09-10 11:50 UTC

- Production bundle: 5 integrated browser smoke tests pass. They cover meaningful action/turn/save/relaunch, corrupt import recovery, duplicate-click turn protection, autosave and injected storage failure preserving the preceding save, and a visible recovery screen when worker startup is denied.
- Regression batch: 740 engine tests, 41 content tests, 7 session/worker tests, 28 UI tests and 10 native storage tests pass. Rust clippy and formatting pass. Long simulation suites were not repeated.
- All 21 imported era/country combinations pass scripted action and save/reload replay. 126 checkpoint hashes match the pinned AHDClient oracle. See [world validation](WORLD-VALIDATION.md); this does not establish AHDGame parity.
- Rate formatting and keyboard/form/focus behavior are corrected. A 390 x 844 running-world screenshot has no horizontal overflow. Native visual comparison remains open.
- A source AST scan over 354 non-test engine/content files found no direct `Math.random` references. Direct math references: pow 19, sqrt 12, log 7, exp 3, hypot 5. This count is not proof against arbitrary computed aliases or float drift.
- The cutoff has passed with 1.0.0 withheld. No iOS build or paid minutes were used. The candidate remains version 0.1.0 pending mechanics, interchange and device gates. See [iOS runtime gate](IOS-RUNTIME-VALIDATION.md).
- Hub board clearing and population remain pending supported card archive/clear operations. The project-scoping and archive issues are filed in the separate private Hub repository. This document is the current detailed execution record; it is not a claim that the Hub board has been updated.

## Save hardening checkpoint

- Main integration CI completed successfully before this batch.
- Native validation now extracts metadata without allocating a second world tree. A bounded local synthetic listing fell from 180 to 115 ms and peak process memory from 46,336 to 19,220 KiB. See [storage evidence](SAVE-STORAGE.md); no phone performance claim.
- Removed the full save-list rescan from each autosaved action/turn.
- Added explicit delete/cancel controls, failure handling and disposal of a deleted active session. Eight production-browser smoke tests and 11 Rust correctness tests pass; the manual memory profile is separate and ignored by CI.

## Authentic save interchange checkpoint

- Save hardening PR #5 passed CI and merged.
- Minted a real schema-v42 fixture using clean AHDClient source at `c5017542c860f5f94b7d4b4d5cfea2939b28995d`. Compressed fixture and SHA-256 provenance are committed; no version relabeling was used to create it.
- Twenty-three contract checks pass for authentic load, deterministic continuation and the old reader's rejection of new schema-v43 saves. The actual import/turn/autosave/reload UI smoke also passes.
- This closes the missing-authentic-fixture evidence gap, not bidirectional save portability. No compatibility writer or silent downgrade was added. See [save compatibility](SAVE-COMPATIBILITY.md).


## Candidacy checkpoint

- Added party join/leave controls and real engine candidacy actions, with filing dates, action costs, availability reasons, candidate/winner names and 20-race pagination. Removed the old 40-race projection cap so open races remain reachable. The active player race appears first.
- TDD: two new session scenarios and six new UI scenarios failed against the previous implementation, then passed. Production build, 9 session/worker tests, 34 component tests and 10 integrated browser smoke tests pass.
- The new production smoke creates a real 1953 US world, joins the Democratic Party, advances to scheduled races, files, saves, relaunches, checks candidacy and withdraws. Existing save import/deletion/error/concurrency smoke remains green.
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
- The persistent footer shows actual turn/date, processing/player-paced state and five resource controls with real data and links. Full income/action breakdowns, election projections/history and corporation strips remain open.
- Banking uses the existing deposit/withdraw actions. Portfolio shows real balances and stock holdings in their own currencies. Six finance contract scenarios cover US and UK savings, rejection atomicity, holdings and save/reload. No formulas changed.
- Validation: production build, 18 session/worker tests, 63 initial UI tests and fixture integrity passed; a keyboard-focus regression was then added and fixed, bringing UI coverage to 64. All 12 pre-existing browser scenarios passed. The new banking/menu/footer flow passed after correcting its expected action-result message; the five core SP smokes also passed after the focus changes. Screenshot review at 390 and 320 pixels caught and corrected header label wrapping. Focused verification follows changes; full engine/content/Rust simulations were not repeated locally for this adapter/UI batch.
- No Codemagic build or paid minutes used. Current mechanics drift, bidirectional v42 output and physical-device validation remain release blockers. N04-N10 track the remaining navigation/footer features; this batch does not claim complete feature parity.


## Full feature depth checkpoint, 2026-09-10

- Politics: list-to-party and list-to-race detail, platform/leadership/roster, actual candidate tally shares, filters, politician directory and active-race links. Eligibility uses real party-switch/purge checks plus action costs. The UK 1953 starting Commons has vacant seats and no NPC roster; the UI preserves that empty state instead of inventing politicians. Campaign projections, election system completeness and full national/subnational career coverage remain open.
- Nation and world: real macro history, local-currency budget/revenue/spending/debt, enacted policy records, searchable nation directory with government/chamber metadata, and home region demographics/support/elections/office. Browsing another nation does not change the player country. US congressional labels are limited to US regions. Executive actions, detailed regional chambers and other world systems remain in progress.
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
- Pure presentation helpers are separated from engine runtime imports. This brought the initial integrated main bundle from 731 KB to 349 KB without moving simulation onto the UI thread. This is a bundle-size observation, not device performance evidence.
- Independent next work covers UK electoral careers, referendum lifecycle and bidirectional v42 compatibility. No paid build has run; mechanics, save interchange and physical-device candidate gates remain open.
- Validation: production build, 71 session/query/preferences/save/CLI tests, 109 UI tests and fixture integrity passed. The production-browser batch passed 17 of 18 scenarios and exposed the player-chamber default bug. After fixing it, all four affected market/legislature browser flows passed, alongside 9 focused session/query and 46 UI checks. Existing engine/content/native code was unchanged in this batch, so those broader suites were left to CI. No campaign fixture regeneration or paid build ran.

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
- The genuine elected-save flow retains the selected issue and remaining units
  across trades and relaunch. [Bond evidence](BOND-MARKET.md) records the exact
  local pricing contract and the remaining dealer-pool/FX mechanics gaps.
- Validation: 84 root tests, 116 UI tests, fixture integrity and build passed.
  The production build with the corporation/macro correction passed all 22
  browser scenarios, including bond trade/relaunch at phone size.

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
automatic consumer updates and save ruleset policy are still open. Current
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
and invented-action corrections while retaining broader unchecked acceptance.
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

