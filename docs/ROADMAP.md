# AHDNative roadmap

The owner delegates uncertain feature decisions to the implementation team. The lodestar is native iOS and Android UI for SP first, then MP, with performance central to every decision. The target is a unified mobile/desktop app with local offline SP and server-authoritative MP. iOS SP comes first. This roadmap records real completion evidence; card counts are not a progress percentage.

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
| G04 | Evidence | Ready | G03 | Audit production RNG and imported source publication | No unseeded runtime randomness or secret/ops material |
| G05 | Evidence | Blocked | G03 | Measure named physical iOS device late-turn performance | p95 budget plus worst-turn,memory,thermal evidence; needs eligible device build |
| G06 | Evidence | Queued | G05 | Record TS optimization versus Rust go/no-go | Device evidence determines rewrite; no speculative bulk port |
| E01 | Engine | Done | G04 | Import pinned reusable engine/content without UI/history | Unchanged formulas; source manifest; proprietary notice |
| E02 | Engine | Done | E01 | Implement world session through public engine contract | Create,actions,turn,serialize,load behavior tests |
| E03 | Engine | Done | E02 | Move simulation into dedicated worker | UI responsive; ordered commands; no duplicate turns |
| E04 | Engine | Done | E03 | Handle worker errors, interruption and disposal | Failure preserves last good state; promises settle |
| E05 | Engine | Done | E02 | Produce stable display queries from real world | Economy/player/party/election/news views use engine state |
| E06 | Engine | Done | E02 | Validate supported era/country matrix | All shipped imported combinations create,act,turn,save/reload |
| E07 | Engine | Done | E02 | Run independent seeded replay and save-boundary comparison | Exact checkpoint hash; record reference commit |
| E08 | Engine | Queued | E07 | Audit long-world election memory and turn spikes | Profile once per changed performance concern; no pruning without compatibility proof |
| S01 | Saves | Done | G02 | Build native atomic save-slot storage with TDD | Fresh instance reads saved data; failed replacement preserves prior data |
| S02 | Saves | In progress | S01,E02 | Connect native save and reload commands | Raw engine envelope retained; completion and errors visible |
| S03 | Saves | Done | S02 | Implement slot list,delete and replacement confirmation | No traversal; deliberate overwrite/delete; deterministic metadata |
| S04 | Saves | Queued | S02 | Provide save import/export interchange | Real fixture both directions; no silent version downgrade |
| S05 | Saves | Queued | S04 | Resolve v42/v43 compatibility explicitly | Fixture-backed policy; no promise of roundtrip until verified |
| S06 | Saves | Queued | S02 | Recover after close,crash and partial write | Last completed save survives; no false saved status |
| U01 | Interface | In progress | G01 | Extract actual MP/SP visual and navigation baseline | Reference source/screens; no historical client redesign |
| U02 | Interface | Done | U01 | Build new-game era/country/player flow | Accessible form; real content choices; validation |
| U03 | Interface | In progress | U01,E05 | Build shared game chrome and country overview | Actual MP/SP hierarchy; compact mobile navigation |
| U04 | Interface | Done | U03,E05 | Expose real character and action flow | Costs,target input,result/errors; no fake actions |
| U05 | Interface | In progress | U03,E05 | Expose party membership and party views | Actual joins/leaves/party state wired through contract |
| U06 | Interface | Done | U03,E05 | Expose election and news views | Real records and clear empty states |
| U07 | Interface | In progress | U03,S03 | Connect save browser and in-game lifecycle | New/resume/save/reload/exit flow tested |
| U08 | Interface | In progress | U02,U07 | Verify mobile layout and accessibility | Small-screen overflow,touch,keyboard,focus and errors |
| M01 | Mechanics | Done | G03 | Inventory phase/order and feature drift from AHDGame | Named differences,source refs,release blockers |
| M02 | Mechanics | Queued | M01 | Close referendum lifecycle omissions | Behavioral parity scenarios through public actions/turns |
| M03 | Mechanics | Queued | M01 | Resolve war abstraction mismatch | Actual authoritative rules; no rebalancing or blanket waiver |
| M04 | Mechanics | Queued | M01 | Close phase order and TFP differences | Reference-driven tests; impacts traced |
| M05 | Mechanics | Queued | M01 | Close electoral and content omissions | National/subnational lifecycle and all supported content |
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
- Authentic v42 import now passes for the pinned 1953 US fixture. Current v43 output is rejected by the old v42 reader; a compatibility writer remains unimplemented.
- Main contains the local SP development slice from PR #4; it is not a validated iPhone release.

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
