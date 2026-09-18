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
need git
need sha256sum
need cargo-xwin
need llvm-rc
need lld-link
need rustup

# Pin the exact reviewed main SHA. The exe filename carries no version or
# revision, so a build from any other commit is a mislabeled artifact.
# Mirrors the AHD_REVIEW_COMMIT gate in codemagic.yaml. Fails before any
# host provisioning check so the wrong source never reaches the compiler.
if [[ ! "${AHD_REVIEW_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'set AHD_REVIEW_COMMIT to the full 40-hex reviewed main SHA\n' >&2
  exit 1
fi
actual="$(git rev-parse HEAD)"
if [[ "$actual" != "$AHD_REVIEW_COMMIT" ]]; then
  printf 'HEAD (%s) does not match AHD_REVIEW_COMMIT (%s)\n' "$actual" "$AHD_REVIEW_COMMIT" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  printf 'tracked tree is dirty; commit or discard changes so the exe matches %s\n' "$actual" >&2
  exit 1
fi

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

exe='src-tauri/target/x86_64-pc-windows-msvc/release/ahdnative.exe'
sha256sum "$exe" | tee "$exe.sha256"
printf 'commit: %s\n' "$actual"
printf 'portable exe: %s\n' "$exe"
printf 'checksum: %s.sha256\n' "$exe"
printf 'unsigned; no GitHub or Codemagic publication\n'
