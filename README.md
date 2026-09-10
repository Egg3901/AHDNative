# AHDNative

A unified A House Divided app for singleplayer and multiplayer on mobile and desktop. Delivery starts with offline singleplayer on iOS.

## Status

The integration branch runs a local singleplayer world through React game screens and a dedicated simulation worker. New game, actions, turns, save, app reload and resume have passed a real browser smoke test at phone screen size. Native save storage has passing Rust tests. This is development progress, not an iPhone build or a 1.0.0 release.

The reusable TypeScript engine is pinned to a recorded AHDClient revision. Known differences from current AHDGame, v42/v43 save compatibility, native lifecycle and physical-device performance remain acceptance gates. A Rust engine rewrite remains profile gated. See [roadmap](docs/ROADMAP.md), [mechanics audit](docs/MECHANICS-PARITY.md) and [engine provenance](docs/engine-source-manifest.json).

## Standing product rules

- AHDNative is the intended unified mobile and desktop app for SP and MP. Players should not have to pass through a separate AHDClient application.
- SP runs locally and supports offline play. MP connects to the existing authoritative AHDGame server; it does not run authoritative simulation on the device.
- Both modes share React screens and interaction patterns, with adapters at the game data and action boundary. Preserve existing authentication.
- Polish the actual MP/SP interface for touch, responsive layouts, platform navigation, accessibility, and reliable lifecycle behavior. Visual parity is an acceptance criterion from the first playable screen.
- Reuse suitable AHDClient code during development without maintaining competing UI implementations long term.
- Deliver a convincing iOS SP slice first, complete and harden SP, then connect MP to the shared screens. Expand Android and desktop with appropriate device navigation. Web still requires separate approval.

## Product requirements

- Preserve the familiar A House Divided multiplayer and singleplayer React UI. Native packaging must retain its layout, styling, and interaction patterns.
- Support every shipped era and playable country in singleplayer.
- Keep mechanics aligned with AHDGame. Port formulas without rebalancing them.
- Measure representative late-game turn performance on named iOS and Android hardware. The proposed UX budget is p95 below 500 ms per turn.
- Validate deterministic seeded action replays and save interchange against the reference engine. Save schema compatibility must be verified explicitly before promising support for a specific version.
- Prioritize the iOS build and device validation, then Android. A web build is conditional on separate approval.

## Implementation sequence

1. Record mobile performance measurements and the engine go/no-go decision.
2. Establish the actual MP/SP UI reference and a tested game contract boundary.
3. Add the native shell and compatible engine implementation, guided by profiling and differential tests.
4. Validate save interchange, full singleplayer playthroughs, lifecycle behavior, and device performance.
5. Bring up Android after the initial iOS milestone.

If profiling supports a Rust engine, integrate it directly into the Tauri shell and port it in independently validated system slices. Repository creation does not establish that the performance gate has passed.

## Development

Run `npm ci`, then `npm run verify` for the frontend build, type checks, session tests and UI tests. Run `npm run test:smoke` with a Playwright Chromium installation for integrated browser QA. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing browser binary. Browser QA uses IndexedDB; native builds use the Rust app-data save store. Run `npm run tauri -- dev` for the native shell after installing the platform prerequisites. Rust uses the pinned toolchain in `rust-toolchain.toml`.

## Codemagic setup

Connect this GitHub repository in Codemagic. The manual `ios-private-testflight` workflow builds a signed iPhone application and uploads it privately to App Store Connect for internal testing. It requires signing setup first and has not yet been validated on a macOS builder.

Codemagic runs are capped at 20 minutes to conserve the build allowance. No push, pull request, or scheduled triggers are configured. Routine checks run locally and on Linux CI. Signed builds, credentials, and signing logs must stay off GitHub and public build dashboards.

See [iPhone testing setup](docs/IOS-TESTING.md) for the owner setup. The workflow uploads to App Store Connect without automatically requesting external beta review or App Store release. Assign the processed build to an internal TestFlight group yourself.

## Licensing

This source is proprietary under [LICENSE.md](LICENSE.md). Public visibility does not grant permission to reuse A House Divided code or assets. Imported engine and content provenance is recorded in the source manifest.
