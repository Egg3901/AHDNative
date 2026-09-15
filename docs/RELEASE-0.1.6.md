# AHDNative 0.1.6 development preview

This is a private internal review candidate. It is not a public store release
or a 1.0.0 claim.

## Included since 0.1.5

- World setup records government form, one-party structure, elections,
  monarchy and imperial succession from the selected country and era.
- Character creation follows the reference staged journey, persists identity,
  background, ideology, party and allocated stats, and carries those choices
  into player state and action capacity.
- Head of State mode seats the player in the selected executive office,
  exposes executive-only Actions, queues tax and spending directives, enacts
  them on the following turn, and survives save and reload.
- Actions, Parties, character creation and Head of State surfaces use bundled
  AHDGame hero artwork with offline fallbacks and responsive phone crops.
  Party rows use the reusable party identity mark and initials fallback.

## Version and iOS build number

The marketing version is `0.1.6` across `package.json`, `package-lock.json`,
`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and
`src-tauri/tauri.conf.json`. The iOS `bundleVersion` remains `1`; Codemagic
appends its build number. The most recently delivered preview is 0.1.5 build
`1.9`, so the authorized run must produce Apple build `1.10` or higher.

## Required validation

```text
NODE_ENV=test npm run verify
npm run typecheck:engine
SMOKE_PRODUCTION=1 NODE_ENV=test npm run test:smoke
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Delivery

iOS delivery uses only the manual Codemagic `ios-private-testflight` workflow
and the internal Owner review TestFlight group. The workflow must receive the
exact reviewed commit as the plain string `AHD_REVIEW_COMMIT`. No external beta
review or App Store submission is authorized.

## Known limits

- Physical iPhone latency, lifecycle, installed icon and accessibility checks
  remain owner device acceptance under #43, #44, #124 and #148.
- #242 and #244 deliver the bounded 0.1.6 flows but retain explicit broader
  parity gaps in their child issues and #143. This candidate does not claim
  whole-game visual or mechanics parity.
- Historical engine, save interchange and corporate-sector gaps remain tracked
  under #116, #122 and #211.

## Validation record

Before the version-only release commit, the exact feature tree passed the full
frontend gate (277 app tests, 321 UI tests), engine typecheck, and all 63
integrated production-browser smoke scenarios. The release commit must repeat
the required gates above before delivery.
