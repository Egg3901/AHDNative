# AHDNative 0.1.3 development preview

This is a source candidate for the next private development preview. It is not
a 1.0.0 release and it is not a public store submission.

## Included

- More complete singleplayer campaign, primary, referendum, policy, market and
  leadership lifecycles.
- Persistent action outcomes, native save protection and offline session
  recovery.
- Profile, navigation, footer, campaign and finance UI improvements across the
  shared mobile and desktop shell.
- Explicit country and mechanics boundaries where AHDGame behavior is not yet
  ported. Unsupported JP and DE starts remain economy-preview entries instead
  of pretending that their regional budget processors exist.
- A mechanics drift gate and updated parity documentation against the pinned
  AHDGame source.

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

- Physical iPhone gameplay, lifecycle, safe-area, accessibility and performance
  evidence is still required after the private build.
- Native output is schema 44. v42 compatibility remains deliberately narrow and
  does not claim bidirectional lossless interchange.
- Mechanics parity with current AHDGame is incomplete. Supported content is
  limited to the validated eras, countries and flows documented in this tree.
- This preview does not close the broader parity, authentication or device
  acceptance issues.
