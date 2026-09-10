#!/usr/bin/env bash
# Installable ARM64 debug APK for private owner review.
# Uses the Gradle debug keystore. Does not use an owner signing identity.
# Does not upload or start CI. Generated Android project stays in gitignored src-tauri/gen/.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'missing command: %s\n' "$1" >&2
    exit 1
  fi
}

need cargo
need rustup
need rg
need rustc
need npm
need java

if [[ ! -d node_modules ]]; then
  printf 'run npm ci in this tree first\n' >&2
  exit 1
fi

if [[ -z "${JAVA_HOME:-}" || ! -d "${JAVA_HOME}" ]]; then
  printf 'set JAVA_HOME to JDK 17 or 21\n' >&2
  exit 1
fi
if [[ -z "${ANDROID_HOME:-}" || ! -d "${ANDROID_HOME}" ]]; then
  printf 'set ANDROID_HOME to the Android SDK\n' >&2
  exit 1
fi
if [[ -z "${NDK_HOME:-}" || ! -d "${NDK_HOME}" ]]; then
  printf 'set NDK_HOME to the NDK (prefer r28+ for 16 KB page alignment)\n' >&2
  exit 1
fi

if ! rustup target list --installed --toolchain 1.96.0 2>/dev/null | rg -qx 'aarch64-linux-android'; then
  printf 'install rustup target aarch64-linux-android for toolchain 1.96.0, then rerun\n' >&2
  exit 1
fi

export CI=1
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
# Keep r27-linked libraries usable on devices with 16 KB memory pages.
export CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS="${CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS:-} -C link-arg=-Wl,-z,max-page-size=16384 -C link-arg=-Wl,-z,common-page-size=16384"
if [[ ! -d src-tauri/gen/android ]]; then
  npm run tauri -- android init --ci --skip-targets-install
fi

npm run tauri -- android build --ci --debug --apk --target aarch64

printf 'APK: src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk\n'
printf 'debug package id: net.lakesidegames.ahdnative.debug (suffix from tauri.conf.json)\n'
printf 'release identifier unchanged: net.lakesidegames.ahdnative\n'
printf 'no GitHub or Codemagic publication; root handles signing and device smoke\n'
