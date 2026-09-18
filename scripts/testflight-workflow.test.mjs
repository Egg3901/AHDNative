/**
 * Static regression check for the private iOS TestFlight workflow.
 *
 * Proves codemagic.yaml stays a manual-only, time-capped, internal-only
 * upload gated on the exact locally reviewed commit, with signing inputs
 * referenced (never embedded), and that docs/IOS-TESTING.md documents the
 * manual invocation path. Reads files as text only; never prints, resolves,
 * or validates secret values.
 *
 * Run exactly:
 *   node --test scripts/testflight-workflow.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = resolve(REPO_ROOT, "codemagic.yaml");
const DOCS_PATH = resolve(REPO_ROOT, "docs", "IOS-TESTING.md");

const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");
const DOCS = readFileSync(DOCS_PATH, "utf8");

const REQUIRED_SIGNING_VARS = [
  "IOS_CERTIFICATE",
  "IOS_CERTIFICATE_PASSWORD",
  "IOS_MOBILE_PROVISION",
  "TAURI_APPLE_DEVELOPMENT_TEAM",
  "APP_STORE_CONNECT_PRIVATE_KEY",
  "APP_STORE_CONNECT_KEY_IDENTIFIER",
  "APP_STORE_CONNECT_ISSUER_ID",
];

describe("ios-private-testflight workflow", () => {
  it("defines exactly one workflow and no automatic triggers", () => {
    assert.match(WORKFLOW, /^\s{2}ios-private-testflight:$/m);
    const names = [...WORKFLOW.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map(
      (m) => m[1],
    );
    assert.deepEqual(
      names,
      ["ios-private-testflight"],
      "no second workflow may appear beside the manual preview",
    );
    for (const banned of [
      "triggering",
      "schedule",
      "cron",
      "pull_request",
      "branch_patterns",
      "tag_patterns",
    ]) {
      assert.doesNotMatch(
        WORKFLOW,
        new RegExp(`^\\s*${banned}\\s*[:\\[]`, "m"),
        `automatic trigger key must stay out of codemagic.yaml: ${banned}`,
      );
    }
  });

  it("caps the paid build at 20 minutes", () => {
    const match = WORKFLOW.match(/max_build_duration:\s*(\d+)/);
    assert.ok(match, "max_build_duration must be set");
    const minutes = Number(match[1]);
    assert.ok(minutes > 0 && minutes <= 20, `cap is ${minutes}, want 1-20`);
  });

  it("fails closed unless HEAD equals the full reviewed commit pin", () => {
    assert.ok(
      WORKFLOW.includes("AHD_REVIEW_COMMIT"),
      "review-commit gate must reference AHD_REVIEW_COMMIT",
    );
    assert.ok(
      WORKFLOW.includes("rev-parse") && WORKFLOW.includes("[0-9a-f]{40}"),
      "gate must require a full 40-hex commit",
    );
    assert.ok(
      WORKFLOW.includes("raise SystemExit"),
      "gate must fail the build on mismatch",
    );
  });

  it("references app-scoped encrypted signing inputs without embedding values", () => {
    assert.ok(
      WORKFLOW.includes("ahdnative-signing"),
      "must use the app-scoped encrypted variable group",
    );
    for (const name of REQUIRED_SIGNING_VARS) {
      assert.ok(
        WORKFLOW.includes(name),
        `signing check must require ${name}`,
      );
    }
    assert.doesNotMatch(WORKFLOW, /PRIVATE KEY/, "no key material in yaml");
    const longLiterals = WORKFLOW.split("\n").filter((line) => {
      const quoted = line.match(/"([^"]{64,})"|'([^']{64,})'/);
      return quoted !== null;
    });
    assert.deepEqual(
      longLiterals,
      [],
      "no long quoted literal (embedded secret) may appear in yaml",
    );
  });

  it("uploads to App Store Connect but stays internal-only and manual", () => {
    assert.ok(
      WORKFLOW.includes("publishing:") &&
        WORKFLOW.includes("app_store_connect:"),
      "must keep the App Store Connect upload (not artifact-only export)",
    );
    for (const key of ["api_key:", "key_id:", "issuer_id:"]) {
      assert.ok(
        WORKFLOW.includes(key),
        `upload auth must keep ${key} (actual upload, not artifact-only export)`,
      );
    }
    assert.doesNotMatch(
      WORKFLOW,
      /^\s*beta_groups\s*:/m,
      "no automatic tester-group distribution; the owner adds the build by hand",
    );
    assert.ok(
      /testFlightInternalTestingOnly["']?\]\s*=\s*True/.test(WORKFLOW),
      "export must be restricted to internal testing",
    );
    assert.match(WORKFLOW, /submit_to_app_store:\s*false/);
    assert.match(
      WORKFLOW,
      /submit_to_testflight:\s*false/,
      "TestFlight submission stays a manual owner step in App Store Connect",
    );
  });
});

describe("docs/IOS-TESTING.md manual invocation path", () => {
  it("documents the manual build, commit pin, cap, and internal-only scope", () => {
    for (const token of [
      "ios-private-testflight",
      "AHD_REVIEW_COMMIT",
      "Start new build",
      "20-minute",
      "internal",
    ]) {
      assert.ok(DOCS.includes(token), `docs must explain: ${token}`);
    }
    assert.ok(
      /no external|No external beta review/i.test(DOCS),
      "docs must state no external/App Store submission",
    );
    assert.ok(
      DOCS.includes("rustls"),
      "docs must acknowledge the native Rust TLS client in the export review",
    );
    assert.ok(
      DOCS.includes("reqwest"),
      "docs must name the MP reqwest TLS client in the export review",
    );
    assert.ok(
      DOCS.includes("ureq"),
      "docs must name the Ask ureq TLS client in the export review",
    );
    assert.ok(
      /re-confirm/i.test(DOCS),
      "docs must mark export-compliance re-confirmation owed before the next candidate",
    );
  });
});
