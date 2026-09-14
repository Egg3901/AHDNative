# AHDNative 0.1.5 development preview

This is a source candidate for the next private development preview. It is not
a 1.0.0 release and it is not a public store submission.

## Included since 0.1.4

Four commits landed after the delivered 0.1.4 source `1f97fe0`:

- **Presidential race and political metrics views (#69, PR #234).** The
  Elections and Nation surfaces now project the recorded Electoral College
  standing and per-state results where state tallies exist, and expose the
  political metrics registry. The engine exports `allocateElectoralVotes`,
  `electoralVotesByState` and `electoralMajorityFor` from the same
  winner-take-all allocation, live EV apportionment and majority threshold the
  resolution phase seats presidents with, so a rendered electoral count cannot
  disagree with `applyPresidentialResolution`. The reference entry hierarchy
  and approved mobile navigation are preserved.
- **Nation-context switcher (#84, PR #235).** The Nations surface gains the
  reference "Switch nation view" control. The "Nation view" selector changes
  only which recorded nation's details are shown, states the player country
  beside it and flags the player's own country in the directory. The selection
  is owner state that survives route changes, so returning to Nations lands on
  the viewed nation; switching the view triggers no action, save or turn
  change. Reference destinations with no Native route or data surface (Map,
  Crises, International Orgs, Sectors, Currency Exchange, Trade, IMF, Unions,
  Hall of Fame, My Corporation) remain reported gaps, never placeholder rows.
- **Responsive canonical landing logo (#148 partial, PR #236).** The bundled
  500x500 canonical mark now renders square and contained at every viewport.
  `smoke/landing-review.spec.ts` verifies at 320x568, 390x844 and desktop that
  the asset loads at its canonical dimensions, stays inside the viewport,
  remains decorative beside the accessible product heading and makes no
  external asset request. The check exposed the launcher `<img>` HTML height
  attribute holding the phone render at 96px while its responsive width shrank;
  `.ahd-landing-logo` now uses `height: auto`.
- **Caucus chair tax and disband actions (#60 partial, PR #237).**
  `setCaucusTaxRate` and `disbandCaucus` are now public, chair-only catalog
  actions porting the reference PATCH (0-5 tax edit) and DELETE (soft disband)
  routes. Neither charges action points or funds. The disband path stamps
  `disbandedAt`, empties membership, vacates the chair seats and clears the
  player's `caucusId`, and the disbanded row is excluded from the tax phase and
  roster. `CaucusPanel` shows the tax input and Disband button only for a
  chaired caucus and mirrors the reference confirmation guard before issuing
  the disband.

## Version and iOS build number

The marketing version is `0.1.5` across `package.json`, `package-lock.json`,
`src-tauri/Cargo.toml`, the `ahdnative` entry in `src-tauri/Cargo.lock` and
`src-tauri/tauri.conf.json`. The iOS `bundleVersion` stays at its existing base
`1`; Tauri appends Codemagic's `BUILD_NUMBER`, producing Apple build `1.N`. The
most recently delivered preview was Apple build `1.8`, so the next authorized
Codemagic run must set `BUILD_NUMBER` to produce a build greater than `1.8`
(that is, `9` or higher). Do not append a fourth numeric component to the
marketing version.

## Validation

The candidate is eligible for private platform review only after these checks
pass against the exact release commit:

```text
NODE_ENV=test npm run verify
npm run typecheck:engine
SMOKE_PRODUCTION=1 NODE_ENV=test npm run test:smoke
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Delivery

- Windows uses the private unsigned x64 portable review build. It requires
  WebView2 and is not uploaded to GitHub or presented as a signed installer.
- iOS uses the manual Codemagic `ios-private-testflight` workflow and internal
  TestFlight only. Signing inputs, IPA files and logs remain private. No
  external beta review or App Store submission is automatic.
- The Codemagic build must receive the exact reviewed commit through
  `AHD_REVIEW_COMMIT` and must keep the existing 20-minute cap.

## Known release limits

- Physical iOS/Android gameplay, lifecycle and performance evidence does not
  exist yet (#43, #44, #124). Device acceptance remains open, including the
  installed icon and launcher logo check on each platform.
- #148 is not closed. PR #236 delivers the responsive landing acceptance and
  the bundled asset is byte-identical to the canonical AHDGame/AHDClient logo,
  but installed launcher treatment, OS masking and device accessibility remain
  package/device acceptance. Do not record #148 as complete on browser evidence
  alone.
- #60 remains partial. Chair tax edit and disband are delivered; chair and
  vice-chair elections, whip modes, health, color, description, motto, NPP
  recruitment and rename remain open.
- Historical engine mechanics still differ from current AHDGame in known
  systems; the projection and save-interchange gaps remain tracked (#116, #122).
- The corporate-sector asset model (workers, for-sale, acquisition) is not
  ported (#211).
- Profile policy axes and character demographics are not recorded, so the
  profile compass renders read-only (#50); the reference founding badge has no
  Native state (#223).
- Reference imagery across game screens remains incomplete (#143).

## 0.1.5 validation record

- Frontend: `NODE_ENV=test npm run verify` passes on the release-prep commit
  (shared rules and mechanics-drift gates, `tsc --noEmit`, production Vite
  build, unit suite, UI suite 288/288, career fixtures).
- Engine: `npm run typecheck:engine` passes.
- Integrated smoke: `SMOKE_PRODUCTION=1 NODE_ENV=test` Playwright suite passes
  against the production bundle, 55/55 scenarios. (The installed Playwright
  expects a newer Chromium build than the host cache; the run used the existing
  host binary through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, the config's documented
  override.)
- Rust: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
  `cargo test` pass (17 passed, 1 ignored manual memory profile). The cargo
  target was built on the host data volume; the production root filesystem had
  no free space.
