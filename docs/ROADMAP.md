# AHDNative roadmap

The owner delegates uncertain feature decisions to the implementation team. The lodestar is native iOS and Android UI for SP first, then MP, with performance central to every decision. The target is a unified mobile/desktop app with local offline SP and server-authoritative MP. iOS SP comes first. This roadmap records real completion evidence; card counts are not a progress percentage.

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
| G05 | Evidence | Blocked | G03 | Measure named physical iOS device late-turn performance | p95 budget plus worst-turn,memory,thermal evidence; needs eligible device build |
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
| S06 | Saves | Queued | S02 | Recover after close,crash and partial write | Last completed save survives; no false saved status |
| U01 | Interface | In progress | G01 | Extract actual MP/SP visual and navigation baseline | Reference source/screens; no historical client redesign |
| U02 | Interface | Done | U01 | Build new-game era/country/player flow | Accessible form; real content choices; validation |
| U03 | Interface | In progress | U01,E05 | Build shared game chrome and country overview | Actual MP/SP hierarchy; compact mobile navigation |
| U04 | Interface | Done | U03,E05 | Expose real character and action flow | Costs,target input,result/errors; no fake actions |
| U05 | Interface | In progress | U03,E05 | Expose party membership and party views | Actual joins/leaves/party state wired through contract |
| U06 | Interface | Done | U03,E05 | Expose election and news views | Real records and clear empty states |
| U07 | Interface | In progress | U03,S03 | Connect save browser and in-game lifecycle | New/resume/save/reload/exit flow tested |
| U08 | Interface | In progress | U02,U07 | Verify mobile layout and accessibility | Small-screen overflow,touch,keyboard,focus and errors |
| U09 | UI | Done | E02,U07 | Expose party membership and candidacy through real engine actions | Filing,withdrawal,save/reload and accessible race pagination |
| U10 | UI | Done | U09,Q01 | Complete a seeded election-to-office loop and expose legislature actions | Genuine t95 fixture, election win,sponsor,vote,relaunch through production UI |
| M01 | Mechanics | Done | G03 | Inventory phase/order and feature drift from AHDGame | Named differences,source refs,release blockers |
| M02 | Mechanics | In progress | M01 | Close referendum lifecycle omissions | Behavioral parity scenarios through public actions/turns |
| M03 | Mechanics | Queued | M01 | Resolve war abstraction mismatch | Actual authoritative rules; no rebalancing or blanket waiver |
| M04 | Mechanics | In progress | M01 | Close phase order and TFP differences | Reference-driven tests; impacts traced |
| M05 | Mechanics | In progress | M01 | Close electoral and content omissions | National/subnational lifecycle and all supported content |
| M06 | Mechanics | Queued | M02,M03,M04,M05 | Sign off reference mechanics coverage | No unacknowledged mechanics gaps in 1.0 candidate |
| Q01 | Validation | Done | E03,S02,U07 | Integrated gameplay smoke through actual UI | Create,country,action,turn,save,close,reload,continue |
| Q02 | Validation | In progress | Q01 | Exercise error and concurrency smoke | Corrupt import,double-click turn,save failure and recovery |
| Q03 | Validation | In progress | Q01,U08 | Capture representative UI evidence | Desktop and mobile screenshots from real running world |
| Q04 | Validation | Done | E06,E07,Q02,Q03 | Run batched regression gate | Focused changes first; full suite only integration checkpoint |
| Q05 | Validation | Queued | Q04,M06,S05 | Assess 1.0.0 candidate readiness | Exact commit/results/remaining limitations; no placeholder success |
| I01 | iOS | Blocked | Q05 | Build one private signed candidate | Manual <=20min; no public artifacts; no retries unchanged |
| I02 | iOS | Queued | I01 | Install and smoke on iPhone | Real install,launch,world,turn,save/relaunch |
| I03 | iOS | Queued | I02 | Validate lifecycle and memory/performance | Background,lock,interruption,low memory,named-device measurements |
| I04 | Release | Queued | I03,G06 | Cut private 1.0.0 when release gates pass | Version consistency,private artifact,release notes,known risks |
| P01 | Multiplayer | Queued | I04 | Adapt shared screens to authoritative MP transport | Existing auth/server authority unchanged |
| P02 | Multiplayer | Queued | P01 | Validate reconnect,read-only safety and mode separation | SP remains offline; MP cannot mutate local authoritative world |
| A01 | Platforms | Queued | I04 | Bring up Android shell and lifecycle | Same game UI; physical Android smoke/performance |
| A02 | Platforms | Queued | I04 | Adapt desktop navigation and packaging | No janky alternate UI; keyboard/window state and saves |
| R01 | Conditional Rust | Conditional | G06 | Port exact RNG and save model | Only if rewrite activated; TS vectors and fixture parity |
| R02 | Conditional Rust | Conditional | R01,E07 | Port integer-clean systems in phase order | One bounded slice with phase hash gate |
| R03 | Conditional Rust | Conditional | R02 | Port transcendental-heavy systems | Exact first; documented proven tolerance only |
| R04 | Conditional Rust | Conditional | R03 | Integrate native contract after replay gate | Complete reference replay before shell engine switch |
| W01 | Deferred | Deferred | I04 | Web/WASM and drift automation | Separate approval; not initial release |

## Current release blockers

- Physical iOS gameplay/lifecycle/performance evidence does not exist yet.
- Historical engine mechanics differ from current AHDGame in known systems. Reuse is an integration starting point, not parity certification.
- Authentic v42 import now passes for the pinned 1953 US fixture. Current v43 output is rejected by the old v42 reader. The engine projector and local export CLI write authentic fixtures byte-identical and Native-fresh pre-turn worlds as a keep-home schema 42 extension (not the authentic mint). Progressed `countryPolitics` still cannot round-trip without loss and is refused.
- Main contains the growing local SP development app; it is not a validated iPhone release.

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
- Stock market now has searchable country/company lists, actual company detail and home-currency buy/sell. Fresh balances preserve the selected company. Foreign quotes remain browsable, with trading held where quote and player cash currencies differ because the imported action has no FX settlement. Price history, order books and corporation management remain open.
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
