# Physical-device gates #43 and #44

This record separates work that can run on Linux from the two device-only acceptance results. It does not claim that a browser smoke, Rust unit test, simulator, or private package proves a phone result. Use one known source commit and one private build per platform; keep signing material, account identifiers, binaries and logs off GitHub.

## Committed late-game workload

`fixtures/career-current-distributor-t95-1953-US.save.json.gz` is the recorded 1953 US turn-95 career save generated through the public action and turn policy in `scripts/validate-career.ts`. Its `.provenance.json` records the action log and generator revisions. `scripts/benchmark-late-game.ts` loads that exact save through public `deserializeSave`, advances one turn, and calls public `serializeSave` with a fixed timestamp. It repeats from the same input and refuses nondeterministic output. It reports separate deserialize, turn and serialize samples with nearest-rank p50/p95, input/output SHA-256, source commit and dirty state. This is a **Linux engine-only** probe; it excludes the worker bridge, Rust file store, device memory, thermal state and interaction latency.

```sh
npx vitest run --config vitest.config.ts scripts/benchmark-late-game.test.ts
/root/bin/lakeside-check-queue enqueue --workdir "$PWD" --label ahdnative-late-game-20 --priority normal -- npx tsx scripts/benchmark-late-game.ts --samples=20 --warmup=2
```

The two-sample integrated probe passed locally on 2026-09-25. The shared scheduler then completed a 20-sample run at source `9e8dcb2ba1f8bd0588569416ad624d6cfa0f392d` (clean checkout), with two warmups. The uncompressed fixture SHA-256 was `a08a9e6e718483266760b68ff54b9895a213454a8ceabca5dde301accb8e4cc7`; every trial produced output SHA-256 `baa4995d01579a3934edb48eaf62a6763817483b24a6815b69052f0d5a97b834` and a 13,776,741-byte serialized save.

| Linux public-engine boundary | p50 | p95 |
| --- | ---: | ---: |
| Deserialize | 529 ms | 1,671 ms |
| Advance one turn | 6,379 ms | 10,601 ms |
| Serialize | 268 ms | 556 ms |

Command: `npx tsx scripts/benchmark-late-game.ts --samples=20 --warmup=2`. Scheduler job `20260925T045356Z-1584b9c1` passed on 2026-09-25. These are wall-clock measurements on a shared, loaded Linux host; they are neither controlled device timings nor a mobile go/no-go. Keep the complete individual sample array in the private device record. The shared scheduler is required while host load is high.

## Local durability and player-flow checks

Run the following against the same source revision before a private candidate build. Save the command, exit status, timestamp and resulting artifact hashes in the candidate readiness record. Existing tests cover the named behavior; a fresh passing run is still required for the candidate.

```sh
npx vitest run --config vitest.config.ts src/game/session.test.ts src/game/saveCompatibility.test.ts
npx playwright test smoke/singleplayer.spec.ts smoke/save-browser.spec.ts
cargo test --manifest-path src-tauri/Cargo.toml --locked save_store
```

The integrated browser cases create/action/turn/save/reload and reject a corrupt save without replacing the active saved world. The Rust save store tests cover same-slot replacement and failed-write preservation. Neither can suspend or terminate a phone process. Use the exact matching test names and counts from the fresh run; do not infer a pass from this command list.

## #43 physical latency run

On **each** target iOS and Android device separately, record model, OS, build/source revision, power mode, battery level, thermal state, save hash, and method. Import the turn-95 save into the actual native app. For at least 30 samples, restore the same input before each trial, advance one turn, and measure (a) tap to completed UI, (b) local engine time, (c) serialization, and (d) native file save. Record individual values, nearest-rank p50/p95 and worst case, plus save size and peak memory. Repeat warm and thermally constrained conditions. Compare end-to-end p95 to the proposed 500 ms UX budget and record an explicit go/no-go before an engine rewrite. A device trace must identify where the time went; Linux numbers cannot substitute for these observations.

## #44 physical durability run

On **each** target iOS and Android device separately, start a real SP world, perform an action, complete a turn, and confirm the saved revision after a clean relaunch. Repeat while backgrounding/locking during a turn, during save, after the save acknowledgment, and after force termination. In every case, the app may resume the most recent completed save or the preceding good save, but must never replace the last good save with a corrupt or partial file. Import a deliberately malformed save and verify an actionable error and preservation of the prior slot. Record safe areas, platform back/exit behavior, keyboard, screen reader and touch targets on the same build. Attach private screenshots/trace excerpts to the owner record, not public GitHub if they reveal account or signing details.

## Open result slots

| Platform | #43 named late-game p50/p95, memory, thermal and go/no-go | #44 lifecycle, corruption and recovery | Status |
| --- | --- | --- | --- |
| iOS phone | Pending physical run | Pending physical run | Unverified |
| Android phone | Pending physical run | Pending physical run | Unverified |

The final issue checklists remain open until the named device results exist. This document prepares the run; it is not evidence that the run happened.
