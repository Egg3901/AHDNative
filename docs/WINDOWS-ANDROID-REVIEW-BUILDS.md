# Private Windows and Android review builds

Local Linux host builds for owner evaluation. Not Codemagic, not GitHub artifacts, not store submission. iOS remains the Codemagic-only signed path. Identifier stays `net.lakesidegames.ahdnative`. Saves stay under Tauri `app_data_dir()/saves`.

These commands prepare unsigned Windows portable binaries and an installable Android debug APK (ARM64). Record actual build, smoke and signing results separately. This document does not record a completed build.

Official references:

- [Windows installer / Linux cross-compile](https://v2.tauri.app/distribute/windows-installer/)
- [Android APK / ABI selection](https://v2.tauri.app/distribute/google-play/)
- [Host and Android prerequisites](https://v2.tauri.app/start/prerequisites/)
- [CLI: `android init` / `android build` / `build --runner`](https://v2.tauri.app/reference/cli/)

## Shared prerequisites

- Node 22.12+ and `npm ci` in this tree (`node_modules` present).
- Pinned Rust from `rust-toolchain.toml` (1.96.0).
- `@tauri-apps/cli` 2.11.x from the lockfile. Do not bump versions for this route.

Do not point these scripts at Codemagic, GitHub Actions, or a public upload. Keep signing material out of the tree (`.gitignore` already excludes keystores, `src-tauri/gen/`, and native artifacts).

## Windows (portable exe)

Cross-compile from Linux with cargo-xwin. Use `--no-bundle` for the portable review executable. MSI packaging requires Windows. Unsigned is expected (`--no-sign`).

Host tools:

- `cargo-xwin` on `PATH`
- `XWIN_CACHE_DIR` set to an existing cargo-xwin cache (do not let the build download a new SDK into the worktree)
- `rustup target add x86_64-pc-windows-msvc` already installed for toolchain 1.96.0
- LLVM resource compiler (`llvm-rc`) and LLD, as in the Tauri Windows cross-compile notes

```bash
export XWIN_CACHE_DIR=...   # existing cache directory
bash scripts/review-windows.sh
```

Equivalent CLI:

```bash
CI=1 npm run tauri -- build --ci --no-sign \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --no-bundle
```

Outputs (after a successful run):

- Portable exe (unsigned, needs WebView2 on the Windows machine): `src-tauri/target/x86_64-pc-windows-msvc/release/ahdnative.exe`

The portable executable is unsigned. Do not enable Windows code signing for this review.

A portable executable does not install its prerequisites. Install the Microsoft WebView2 Evergreen Runtime if it is absent; a current runtime is required for the preview.

Save path on Windows: `%AppData%\net.lakesidegames.ahdnative\saves\`.

## Android (ARM64 APK)

`src-tauri/gen/` is gitignored. First run must initialize the Android Studio project, then build an ARM64 debug APK (Gradle debug keystore, no owner identity).

Host tools:

- JDK 17 or 21 (`JAVA_HOME`). AGP 8 needs at least 17.
- Android SDK (`ANDROID_HOME`) with platform, platform-tools, build-tools, cmdline-tools
- NDK (`NDK_HOME`). r28+ aligns 16 KB pages by default. The script supplies a 16 KB maximum-page-size linker flag for r27 as well.
- `rustup target add aarch64-linux-android` for toolchain 1.96.0

```bash
export JAVA_HOME=...
export ANDROID_HOME=...
export NDK_HOME=...   # $ANDROID_HOME/ndk/<version>
bash scripts/review-android.sh
```

Equivalent CLI:

```bash
CI=1 npm run tauri -- android init --ci --skip-targets-install
CI=1 npm run tauri -- android build --ci --debug --apk --target aarch64
```

Output:

- `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`

`bundle.android.debugApplicationIdSuffix` is `.debug`, so the debug package is `net.lakesidegames.ahdnative.debug`. That package has its own app-files directory. Release builds keep `net.lakesidegames.ahdnative`. Do not change the identifier.

Release APK/AAB needs a keystore supplied outside this repo. Keep signing material outside the source tree.

Save path on Android: app files dir / `saves` (`app_data_dir()/saves` in `src-tauri/src/lib.rs`). Debug and release packages do not share that directory.

## What these builds do not prove

Physical install, WebView worker boot, native invoke, save/reload, lifecycle, or performance. Browser smoke is not a Windows or Android result.

## Outstanding platform evidence

Native save durability, bundled worker startup, peak IPC memory and lifecycle
remain device checks in issues #43 and #44. Existing storage characterization
in SAVE-RECOVERY-DEPTH.md documents the directory-sync and replacement limits.
No speculative storage change is included in build preparation. Inspect the
Android ELF LOAD alignment and APK zip alignment before private delivery.
