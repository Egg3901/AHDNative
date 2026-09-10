# Standing implementation rules

Read README.md before changing product scope or architecture.

- Build AHDNative as one mobile/desktop app for SP and MP, with iOS SP first.
- SP uses a local offline engine. MP uses the existing authoritative AHDGame server. Preserve existing authentication.
- Share the React UI across modes through explicit data/action adapters. Do not introduce a replacement UI stack or route players through a separate AHDClient app.
- Continue through the complete roadmap: gameplay and action depth, mechanics and save parity, mobile lifecycle, performance, and release readiness. Navigation/footer priority does not narrow the scope to those controls.
- Priority one is feature parity with AHDGame MP/SP navigation and the persistent footer status bar. Inventory destinations, nested menus, conditional role/country entries, resource details and linked actions. Mobile-first layout may differ; matching pixels is not required. Labels or placeholder pages alone do not count as completed features.
- AHDNative is a port of the existing game. Preserve entry behavior, screen and section hierarchy, action flows, labels, and country/role conditions as requirements. Shared numbers or working data cards do not establish game parity. Mobile adaptations may change layout and input mechanics, not invent a new player journey.
- Start and resume character games on Profile, as AHDGame does. Keep national statistics under the existing national destinations. Before changing a screen, inspect its reference source and record the expected flow; test against that expectation. Missing reference behavior stays an explicit gap, never silently replaced by a dashboard.
- Use actual MP/SP screens as the visual baseline. Device polish means responsive layouts, touch controls, navigation, accessibility, and lifecycle reliability. Require visual comparison from the first playable slice.
- Prioritize an iOS slice with a real game screen, local turns, and save/load; complete and harden SP before adding MP integration. Android and desktop follow. Web requires separate approval.
- Keep mechanics aligned with AHDGame. Performance changes must preserve behavior and be validated with replay evidence. Repository bootstrap does not satisfy the physical-device performance gate.
- This repository is public. Audit source and asset rights before import; never commit credentials, private operational material, or proprietary source without authorization to publish it.
- Report actual build and validation results. Never describe bootstrap checks as an iOS build or claim playable features before they exist.
- Keep issue status and roadmap rows current as part of finishing each batch. Link affected issues in every implementation PR, mark verified completed substeps with source/test evidence, and state the remaining acceptance criteria. Use `Closes #N` only when all criteria are met; partial work keeps the issue open with a `status: partial` label. Update parent tracker counts after closures. Do not report an open issue count as the amount of untouched work.

## Build budget and signing privacy

- Codemagic is for iOS only. Prepare Windows and Android builds locally or through a separately authorized private build route.
- Codemagic allowance is 500 minutes. Run checks locally first; use Codemagic sparingly for deliberate private signed iOS builds. No push/PR/scheduled Codemagic triggers, automatic retry loops, or parallel duplicate builds.
- Keep the Codemagic workflow capped at 20 minutes. Review failure logs and minute usage before retrying; do not raise the cap without owner agreement.
- Signed binaries, archives, signing identities, profiles, Apple account identifiers and signing logs stay off GitHub. Never publish them as GitHub releases, Actions artifacts, PR attachments, or committed files.
- Keep Codemagic dashboards/artifact sharing private. Apple credentials belong in encrypted Codemagic app variables or integrations/signing identities, never in source. Do not send them to subagents.
- Use internal TestFlight distribution first. Do not automatically submit to external beta review, the App Store, or invite testers.
- Use Muse Spark and Grok for bounded independent implementation and research tasks. They must not trigger paid builds or access signing credentials.

## AHDNative 1.0.0 candidate gate

- The owner authorized the first private feedback preview after local behavioral tests and integrated smoke evidence pass. Use development versioning and record remaining mechanics/save gaps; this does not approve a public or 1.0.0 release. Codemagic is iOS only, within the existing 20-minute cap. Signing readiness, a placeholder screen, compilation, or an empty test suite do not satisfy the review gate.
- Develop behavior using TDD: demonstrate a failing test through the agreed public contract or player flow, implement the smallest working slice, then demonstrate it passes. Expected mechanics results come from independent reference-engine evidence.
- Use the already established engine contract, save interchange and actual player flows as test boundaries. Record the specific boundary and expected behavior for each slice; do not invent internal-only tests to inflate coverage.
- Before a paid candidate build, demonstrate the real SP loop locally: create a world, select a playable country, perform meaningful actions, advance turns, save, close/relaunch and reload, then continue. Include corrupt-save failure behavior, deterministic replay, supported content coverage and visual comparison with actual MP/SP screens.
- Attach reproducible commands, source commit, results and remaining limitations to the candidate readiness record. Smoke tests must exercise the actual integrated implementation, not a mock world or placeholder screen.
- The first candidate is for owner review, not an automatic 1.0.0 release. Physical iOS signing, phone lifecycle and device performance validation occur after the first eligible private build; never claim those were proven on Linux.
- Continue local development and testing while paid builds are held. The existing budget, privacy and platform rules remain binding.

## Mobile navigation correction

- The owner rejected the desktop-style top banner, exposed turn/save/exit row,
  and scrolling top tabs. Do not restore them on iOS or Android.
- Use a side navigation drawer for the full destination hierarchy and turn,
  save and exit controls, with primary navigation at the bottom.
- Keep the persistent resource/turn footer compact. Resource details remain
  reachable without a wall of large pills or hiding content behind the footer.
- Preserve all existing features through the new navigation. Validate the real
  player flows and inspect 320px/390px screens before calling the layout ready.
- The shared React/Tauri stack remains. Native-feeling navigation is not proof
  of a UIKit/SwiftUI implementation or physical-device gesture validation.
