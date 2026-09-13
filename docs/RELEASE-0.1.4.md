# AHDNative 0.1.4 development preview

This is a source candidate for the next private development preview. It is not
a 1.0.0 release and it is not a public store submission.

## Included since 0.1.3

- **UI parity with the web reference.** Reference type system (Geist / Lora /
  Fraunces / Geist Mono, offline-bundled), in-game dates on the reference
  calendar, the drawer hierarchy and Nation ordering aligned with the reference
  menu, a persistent-footer character identity, and a wide-viewport layout with
  the reference card grids and hero bands. Reference imagery (#143) and
  platform icon acceptance (#148) remain open.
- **Elections.** Race stages and primary views with the persisted primary
  lifecycle, candidacy gates mapped to the reference `enter`/`withdraw`
  commands, live election tally wiring, and strength-adjusted vote projections.
- **Campaigns.** Campaign strength ported end to end (contribution cost/curve,
  leader pullbacks, cross-campaign contributions) plus the operations blend
  board.
- **Referendums.** Player campaign writers (yes/no spend, cohort ground game)
  feeding the resolved share.
- **Economy and finance.** Regional tax enactment with phase-in, TFP basket
  inputs aggregated from recorded regional metrics, budget depth and the
  political metrics registry, sector directory and recorded ownership,
  resource/finance breakdown depth.
- **Institutions.** FOMC meeting and nomination lifecycle, international
  organization dues/resolutions/leadership/sanctions, party/caucus action cost
  and consequence single-sourcing, home-region conditional rows.

## Validation

The candidate is eligible for private platform review only after these checks
pass against the exact release commit:

```text
npm run verify
SMOKE_PRODUCTION=1 npm run test:smoke
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
RUSTFLAGS='-D warnings' cargo xwin check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --all-targets
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
  exist yet (#43, #44, #124).
- Historical engine mechanics still differ from current AHDGame in known
  systems; the projection and save-interchange gaps remain tracked (#116, #122).
- The corporate-sector asset model (workers, for-sale, acquisition) is not
  ported (#211).
- Profile policy axes and character demographics are not recorded, so the
  profile compass renders read-only (#50); the reference founding badge has no
  Native state (#223).

## 0.1.4 validation record

- Frontend: `tsc --noEmit`, production build, full unit and UI suites and the
  integrated production-browser smoke suite pass on the release-prep commit.
- Engine: typecheck plus the campaign, referendum, budget, metrics, central-bank
  and international-organization suites pass, including the pinned determinism
  and save/reload invariants.
