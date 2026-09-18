/**
 * Static regression check for the private Windows review build.
 *
 * Proves scripts/review-windows.sh stays pinned to one exact reviewed main
 * SHA (via AHD_REVIEW_COMMIT, mirroring codemagic.yaml), refuses a dirty
 * tracked tree, keeps the deterministic unsigned portable invocation, emits
 * a sha256 checksum sidecar, and never signs, uploads, or publishes.
 * Reads files as text only; never runs a build or prints secret values.
 *
 * Run exactly:
 *   node --test scripts/review-windows.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "scripts", "review-windows.sh");
const DOCS_PATH = resolve(REPO_ROOT, "docs", "WINDOWS-ANDROID-REVIEW-BUILDS.md");

const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");
const DOCS = readFileSync(DOCS_PATH, "utf8");

const PACKAGE = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
);
const TAURI_CONF = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "src-tauri", "tauri.conf.json"), "utf8"),
);
const CARGO = readFileSync(
  resolve(REPO_ROOT, "src-tauri", "Cargo.toml"),
  "utf8",
);

describe("windows review build script", () => {
  it("fails closed unless HEAD equals the full reviewed commit pin", () => {
    assert.ok(
      SCRIPT.includes("AHD_REVIEW_COMMIT"),
      "build must be pinned through AHD_REVIEW_COMMIT",
    );
    assert.ok(
      SCRIPT.includes("rev-parse") && SCRIPT.includes("[0-9a-f]{40}"),
      "gate must require HEAD to equal a full 40-hex commit",
    );
    assert.ok(
      SCRIPT.includes("exit 1"),
      "gate must fail the run on mismatch",
    );
  });

  it("refuses a dirty tracked tree so the exe matches the pinned SHA", () => {
    assert.ok(
      SCRIPT.includes("git diff --quiet"),
      "build must refuse uncommitted tracked changes",
    );
  });

  it("keeps the deterministic unsigned portable invocation", () => {
    for (const token of [
      "--runner cargo-xwin",
      "--target x86_64-pc-windows-msvc",
      "--no-bundle",
      "--no-sign",
      "--ci",
    ]) {
      assert.ok(SCRIPT.includes(token), `invocation must keep ${token}`);
    }
    assert.ok(
      SCRIPT.includes("XWIN_CACHE_DIR"),
      "must keep the pre-existing xwin cache guard",
    );
    assert.ok(
      SCRIPT.includes("x86_64-pc-windows-msvc") &&
        SCRIPT.includes("rustup target"),
      "must keep the pinned rustup target check",
    );
    assert.ok(
      SCRIPT.includes("llvm-rc") && SCRIPT.includes("lld-link"),
      "must keep the documented resource-compiler and linker checks",
    );
  });

  it("emits a sha256 checksum sidecar identifying the artifact", () => {
    assert.ok(
      SCRIPT.includes("sha256sum") && SCRIPT.includes(".sha256"),
      "must write a sha256 checksum sidecar for the exe",
    );
    assert.ok(
      SCRIPT.includes("commit:"),
      "must print the pinned commit beside the output path",
    );
  });

  it("never signs, uploads, or publishes", () => {
    assert.ok(SCRIPT.includes("unsigned"), "must stay unsigned");
    assert.ok(
      SCRIPT.includes("no GitHub or Codemagic publication"),
      "must keep the no-publication boundary",
    );
    for (const banned of [
      "signtool",
      "gh release",
      "upload-artifact",
      "artifacts:",
      ".p12",
      ".pfx",
      "password",
      "PRIVATE KEY",
    ]) {
      assert.ok(
        !SCRIPT.includes(banned),
        `signing/upload token must stay out of the script: ${banned}`,
      );
    }
  });

  it("labels one version across package, Tauri config, and Cargo", () => {
    const cargoVersion = CARGO.match(/^version\s*=\s*"([^"]+)"$/m)?.[1];
    assert.ok(cargoVersion, "Cargo.toml must declare a version");
    assert.equal(
      TAURI_CONF.version,
      PACKAGE.version,
      "tauri.conf.json must match package.json",
    );
    assert.equal(
      cargoVersion,
      PACKAGE.version,
      "Cargo.toml must match package.json",
    );
  });
});

describe("docs/WINDOWS-ANDROID-REVIEW-BUILDS.md private scope", () => {
  it("documents the commit pin, checksum, and unsigned scope", () => {
    for (const token of [
      "AHD_REVIEW_COMMIT",
      "sha256",
      "Unsigned",
      "XWIN_CACHE_DIR",
      "ahdnative.exe",
    ]) {
      assert.ok(DOCS.includes(token), `docs must explain: ${token}`);
    }
  });
});
