#!/usr/bin/env bash
# Unsigned Windows portable exe for private owner review.
# Does not sign, upload, or start CI. Requires an existing cargo-xwin cache.
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
need rg
need rustc
need npm
need cargo-xwin
need llvm-rc
need lld-link
need rustup

if [[ ! -d node_modules ]]; then
  printf 'run npm ci in this tree first\n' >&2
  exit 1
fi

if [[ -z "${XWIN_CACHE_DIR:-}" ]]; then
  printf 'set XWIN_CACHE_DIR to an existing cargo-xwin cache\n' >&2
  exit 1
fi
if [[ ! -d "$XWIN_CACHE_DIR" ]]; then
  printf 'XWIN_CACHE_DIR is not a directory\n' >&2
  exit 1
fi

if ! rustup target list --installed --toolchain 1.96.0 2>/dev/null | rg -qx 'x86_64-pc-windows-msvc'; then
  printf 'install rustup target x86_64-pc-windows-msvc for toolchain 1.96.0, then rerun\n' >&2
  exit 1
fi

export CI=1
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
npm run tauri -- build --ci --no-sign \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --no-bundle

printf 'portable exe: src-tauri/target/x86_64-pc-windows-msvc/release/ahdnative.exe\n'
printf 'unsigned; no GitHub or Codemagic publication\n'
