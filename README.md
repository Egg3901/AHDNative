# AHDNative

<img src="app-icon.svg" alt="" width="96" align="right">

A unified A House Divided app for singleplayer and multiplayer on mobile and desktop. Delivery starts with offline singleplayer on iOS.

Companion to the public browser game at [Egg3901/AHDGame](https://github.com/Egg3901/AHDGame), which remains the authoritative multiplayer server and the mechanics reference. Licensed proprietary - see [LICENSE.md](./LICENSE.md).

## The app

**Singleplayer.** Runs locally on the device through a pinned reusable engine and supports offline play. New game, actions, turns, save, app reload and resume.

**Multiplayer (later).** Will connect to the existing authoritative AHDGame server; the device never runs authoritative simulation. Existing authentication is preserved.

**One UI.** Both modes share React screens and interaction patterns, with adapters at the game data and action boundary. Players do not pass through a separate AHDClient application. The visual baseline is the actual MP/SP interface in AHDGame (see [UI reference](docs/UI-REFERENCE.md)).

## Status

Development progress, not an iPhone build or a 1.0.0 release. What holds today:

- Main runs a local singleplayer world through React game screens and a dedicated simulation worker. New game, actions, turns, save, app reload and resume have passed a real browser smoke test at phone screen size.
- Bottom navigation and a side drawer reach politics, national economy/budget/policy, home region, nations, portfolio and banking. Turn, save and exit controls live in the drawer. The compact footer opens full resource details. Full feature parity is still in progress.
- Party and caucus founding, membership, stock and sovereign bond trades, bill inspection and tax-rate sponsorship use real engine actions and retain state across reloads. Offline search opens actual saved entities; appearance settings persist.
- The mobile overview links to real game destinations. Party rosters expose all recorded members through search and paging; regional chambers and secondary details expand on demand.
- Native save storage has passing Rust tests.
- The reusable TypeScript engine is pinned to a recorded AHDClient revision (354 non-test engine/content files scanned; baseline provenance in [engine-source-manifest.json](docs/engine-source-manifest.json), with [subsequent adaptations](docs/ENGINE-ADAPTATIONS.md)).

Known acceptance gates before any release claim: differences from current AHDGame ([mechanics audit](docs/MECHANICS-PARITY.md)), v42/v43 save compatibility ([save compatibility](docs/SAVE-COMPATIBILITY.md)), native lifecycle and physical-device performance. A Rust engine rewrite stays profile gated: it ships only if device measurements justify it. Not every era, country, or mechanic is available yet; supported content is whatever the docs above and the [roadmap](docs/ROADMAP.md) show as validated.

## Top priority now

Feature parity with AHDGame navigation and its persistent game status bar is priority one. This means working destinations, submenus, country/role-dependent entries, resource details and linked actions. Layout is mobile-first; matching pixels is not required. Labels and placeholder screens do not count as completed features. Work continues through the entire roadmap, including gameplay, mechanics, saves, lifecycle and performance. See the [navigation and footer inventory](docs/NAVIGATION-PARITY.md), [UI reference](docs/UI-REFERENCE.md) and [roadmap](docs/ROADMAP.md).

## How it runs

```
React 19 UI (Vite, Tauri webview)
  -> world session boundary (createWorld, actions, advanceTurn, serialize/deserialize)
  -> dedicated simulation worker (TypeScript engine, pinned revision)
  -> native save store (Rust app-data; IndexedDB under browser QA)
```

MP later reuses the same screens against the AHDGame server API instead of the local worker.

## Running it locally

Requires Node 22.12+ and the pinned Rust toolchain in `rust-toolchain.toml`.

```bash
git clone https://github.com/Egg3901/AHDNative.git
cd AHDNative
npm ci
npm run dev              # http://127.0.0.1:1420
```

For the native shell (after installing the platform prerequisites):

```bash
npm run tauri -- dev
```

## Development

```bash
npm run verify            # frontend build, session tests, UI tests, career fixtures
npm run test:smoke        # Playwright integrated browser QA (needs a Chromium install;
                          # PLAYWRIGHT_CHROMIUM_EXECUTABLE can select an existing binary)
npm run typecheck         # tsc --noEmit
npm run test:ui           # UI component tests
```

Browser QA uses IndexedDB; native builds use the Rust app-data save store. Behavior work follows TDD through the agreed public contract or player flow (red-to-green per slice), with expected mechanics results grounded in reference-engine evidence. Repository bootstrap does not satisfy the physical-device performance gate.

## iOS testing and build budget

Paid Codemagic builds and signed distribution are on hold until a solid 1.0.0 candidate passes real behavioral tests and smoke evidence. The allowance is 500 minutes; runs are capped at 20 minutes each, with no push/PR/scheduled triggers. Signed binaries, credentials, signing identities, and signing logs stay off GitHub and public dashboards; signing lives in encrypted Codemagic variables, internal TestFlight first, no automatic external review. Full owner setup in [iPhone testing setup](docs/IOS-TESTING.md).

## Documentation

| Doc | What it covers |
|---|---|
| [Roadmap](docs/ROADMAP.md) | Delivery sequence and completion evidence |
| [Navigation and footer parity](docs/NAVIGATION-PARITY.md) | Destination inventory, resource controls and remaining feature gaps |
| [UI reference](docs/UI-REFERENCE.md) | Actual MP/SP baseline, tokens, parity notes |
| [Mechanics parity](docs/MECHANICS-PARITY.md) | Audit against AHDGame at pinned revisions |
| [Save compatibility](docs/SAVE-COMPATIBILITY.md) | v42 interchange validation |
| [Save storage](docs/SAVE-STORAGE.md) | Native save store behavior |
| [Career playthrough](docs/CAREER-PLAYTHROUGH.md) / [validation](docs/CAREER-VALIDATION.md) | Career flow coverage |
| [World validation](docs/WORLD-VALIDATION.md) | Seeded world evidence |
| [iOS runtime validation](docs/IOS-RUNTIME-VALIDATION.md) | Device runtime checks |
| [iPhone testing setup](docs/IOS-TESTING.md) | Private signing and TestFlight setup |
| [Engine source manifest](docs/engine-source-manifest.json) | Imported engine/content provenance |

Standing implementation rules live in [AGENTS.md](./AGENTS.md); read them before changing product scope or architecture.

## Contributing

Bug reports, UI feedback and documentation corrections are welcome through the issue templates. Source modifications require written permission under the proprietary license. Authorized mechanics work needs parity evidence against the reference engine before it merges; formulas are ported, never rebalanced. Save-schema support must be verified explicitly before it is promised. Report exploits through [private vulnerability reporting](https://github.com/Egg3901/AHDNative/security/advisories/new), never public issues.

## License

Proprietary source-available - see [LICENSE.md](./LICENSE.md). Public visibility grants inspection and evaluation only: no reuse, modification, distribution, or hosted/commercial operation without written permission. "A House Divided" and the logo are trademarks of Lakeside Games.
