# AHDNative 0.1.3 continuation handoff

Continue `Egg3901/AHDNative` from this handoff. Read `/root/.claude/CLAUDE.md`,
then current `README.md`, `AGENTS.md`, `docs/ROADMAP.md`,
`docs/MECHANICS-PARITY.md`, and this file. This is a production server. Use
sanctioned worktrees under `/root/projects/AHDNative/worktrees`, preserve every
dirty worktree, stage explicit files, and never switch the intentionally stale
main filesystem checkout.

## Baseline

Before the handoff documentation PR, `origin/main` is
`3f8513a4bd2b219143941ed6178eb9d0fcccb2c7`. Confirm the final handoff merge
SHA and its post-merge workflow before calling that exact tree green. The
workflows for PRs #161, #162, and #163 passed.
GitHub has 92 open and 17 closed issues. The only unrelated open PR is old draft
#22. All accepted work from PRs #151 through #161 is merged on main.

The product remains one React/Tauri app: offline local SP first on iOS and
Android, then authoritative AHDGame MP through the same UI. Preserve the actual
game hierarchy, mechanics, labels, conditions, visual identity, character-first
Profile entry, side drawer, bottom navigation, and compact resource footer.
Never claim whole-game parity from a playable preview or deterministic replay.

## Delivered through 0.1.2

- Canonical AHD identity and generated platform icon families merged in #151.
  Issue #148 remains open for production-browser responsive inspection and
  installed-icon acceptance on each platform.
- AHDClient-style multiplayer/account entry merged in #152. AHDGame owns auth;
  the persistent WebView owns cookies. SP remains offline and account-free.
  The desktop remote window has no native capabilities. Issue #149 remains open
  for real provider, cookie, lifecycle, failure, and IPC-isolation acceptance.
- Campaign spending persistence #153, source election distributor #154, live
  subsidy budget revenue #155, subsidy schema coverage #156, and routed campaign
  operations #157 are merged. These are bounded slices, not closure of the broad
  campaign, forecast, election, TFP, or command-economy issues.
- Release preparation #158 moved source metadata to 0.1.2 and corrected the
  stale historical-election expectations introduced by the new distributor.
- Windows conditional import cleanup #159 is on main and passes native and
  Windows cross-target warnings-as-errors checks.
- iOS HTTPS/OAuth export-compliance decision #160 is documented. The plist
  remains `ITSAppUsesNonExemptEncryption=false`; the Apple Account Holder or
  Admin must confirm the App Store Connect answers. This is not legal advice.
- Fresh current-distributor career evidence #161 records a genuine House win at
  turn 96, deterministic replay, save/reload integrity, and post-win sponsor and
  vote behavior without overwriting historical oracle fixtures.

The private Windows 0.1.2 feedback executable is pinned to release source
`91f1f1b6a5de0e26f1f1e35f0b1027a63cd852e1`, not the later main SHA. It is an
unsigned 9,653,760-byte PE32+ x64 GUI binary with SHA-256
`15e958a89ac4c50d6cb93089a5e0b2ac005ac95d7d309e5bbb99c0a3be49ead6`.
The local private copy and manifest are under
`/root/projects/AHDNative/artifacts/private-review/0.1.2/`; the owner-only Drive
delivery was verified. Never publish the binary or private URL on GitHub.
Cross-compilation is not Windows execution evidence.

No iOS 0.1.2 build was triggered. The existing internal TestFlight preview is
0.1.0 build 1.6. Do not imply that iOS contains the later Windows or auth work.

## 0.1.3 objective

Use 0.1.3 for meaningful runtime progress toward parity, not merely another
package cut. Keep `package.json`, root `package-lock.json`, `src-tauri/Cargo.toml`,
the `ahdnative` entry in `src-tauri/Cargo.lock`, and
`src-tauri/tauri.conf.json` consistent when the release candidate is actually
cut. Do not bump early while feature work is still moving.

Recommended sequence:

1. Complete #149 runtime auth acceptance. Verify signed-out entry, Discord and
   Google callbacks, provider cancellation, cookie restore after full process
   termination, logout, server expiry, offline/network/TLS failure and recovery,
   desktop close/reopen/focus/external navigation, and iOS foreground/background,
   relaunch, back, and return-to-Native behavior. Prove remote content cannot
   invoke Native IPC or local-save commands. Re-run the complete offline SP loop
   with no login prompt.
2. Complete #148 package and responsive identity acceptance at 320x568, 390x844,
   and desktop. Inspect real installed icon crops and the landing logo without
   replacing the approved globe. Continue broader reference imagery under #143.
3. Implement #97 primary resolution and lost-race lifecycle before calling the
   distributor reachable for primaries. Cover persisted transitions, ties,
   withdrawal, incumbent loss, and save/reload. Then address #96 country-specific
   election behavior and inputs. These unblock honest completion of #141, #66,
   and later campaign/forecast work in #67/#68.
4. Port live TFP inputs under #40 together with #106 macro causality. Wire
   source-backed national metrics and regional freight, energy, revenue, and
   spending dependencies before several-turn comparisons. Do not use synthetic
   jitter or neutral defaults as parity evidence.
5. Continue #94 subsidy and command-economy player levers through authoritative
   transaction and eligibility paths, coordinated with #93, #65, and #75.
6. Build #117's differential AHDGame-versus-Native phase/field harness and widen
   #120 drift gates. Keep legacy v42 limitations #116 separate from the current
   AHDClient save contract #122.

Secondary election inputs are #38 polls, #37 debate preparation, and #57
targeting. Counted votes are not forecasts. Do not close #67 or #68 until their
full UI and evidence criteria pass.

## Resolved legacy mechanics worktrees

The two explicitly preserved dirty mechanics worktrees were independently
archived, reconciled against current main, and removed after their archive
SHA-256 values matched the private manifests.

- PR #162 and `docs/CAMPAIGN-REMAINDER-AUDIT.md` record that #153, #154, and
  #157 already contain every acceptance-ready campaign/election delta. The
  remainder was stale, regressive, or incomplete. Missing primary scheduling,
  non-US inputs, targeting/manifesto/endorsement feeds, and real forecast
  evidence remain in their existing issues.
- PR #163 and `docs/TFP-REMAINDER-AUDIT.md` record that #155 and #156 already
  contain the accepted subsidy work. A proposed TFP integration was rejected
  after standards and issue-spec review because it used synthetic FNV seeds,
  national regional-spending stand-ins, zero freight/grid inputs, unrelated
  metric persistence changes, and premature schema v45 scope.

Private reports, patches, archives, and manifests for both are under
`/root/projects/AHDNative/artifacts/handoffs/2026-09-11/`. Recovery archives must
never be extracted over newer work. The rejected TFP proposal remains as clean
local commit `09e9332` in worktree `tfp-regional-inputs` for review evidence;
it is not pushed, merged, or shipped.

A separate hygiene audit found other older dirty worktrees containing source,
tests, or documentation. They were not part of these two preserved mechanics
slices and were not deleted. Treat them as user/agent work until individually
archived and semantically compared with main; never bulk-clean them.

## Validation and release rules

Use TDD at the public engine/session or real player-flow boundary, with expected
results grounded independently in immutable AHDGame source. Run focused tests
while iterating, then one meaningful combined checkpoint:

```text
npm run verify
SMOKE_PRODUCTION=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=<installed-chrome> npm run test:smoke
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
RUSTFLAGS='-D warnings' cargo xwin check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc --all-targets
```

The current production-browser suite contains 42 scenarios. A test count can
change; report the actual result rather than copying this number blindly.

Codemagic is iOS only, manual, private, and capped at 20 minutes per run from a
500-minute allowance. Never trigger automatic or unchanged retries. Signed
artifacts, identities, profiles, account identifiers, IPAs, and logs stay off
GitHub and away from subagents. Internal TestFlight comes first, with no automatic
external review or App Store submission.

Before another iOS build, confirm the exact candidate SHA, full local/hosted
behavioral evidence, the seven encrypted signing variables, available allowance,
and Account Holder export-compliance answers. A successful build still does not
clear #43, #44, or #124: record named-device worker boot, SP action/turn/save,
termination/reload, interrupted/corrupt recovery, safe areas, keyboard,
VoiceOver, touch/scrolling, auth lifecycle, and late-game p50/p95/worst/memory/
thermal evidence. The proposed turn target remains p95 below 500 ms on named
hardware. Do not initiate a Rust engine rewrite without that device profile.

File or update an issue for every finding. Close only after verified acceptance
and merge, then update checklists, labels, parent #28, and counts. The private Hub
remains blocked by LakesideHub #4; do not claim synchronization or edit its
database directly. Web and 1.0.0 remain separately gated.
