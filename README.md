# AHDNative

A unified A House Divided app for singleplayer and multiplayer on mobile and desktop. Delivery starts with offline singleplayer on iOS.

## Status

This repository is the initial project bootstrap. It does not yet contain a playable application or a Rust game engine. Target mobile hardware profiling and the engine implementation decision are still pending.

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

There are no build commands or application dependencies yet. Build instructions and executable CI checks will be added with the first runnable implementation.

## Codemagic setup

Connect this GitHub repository in Codemagic and select `main`. The included `bootstrap-check` workflow validates the repository bootstrap only; it does not compile or sign an iOS app.

The next iOS milestone adds the Tauri shell, generated Xcode project, and a real simulator build workflow. A device or TestFlight workflow will also need an agreed bundle identifier, Apple developer team, and signing configuration in Codemagic. Keep credentials in Codemagic integrations or encrypted environment groups.

## Licensing

No open-source license is granted by this repository at present. Public visibility does not grant permission to reuse proprietary A House Divided code or assets. Source and asset licensing must be established before they are imported.
