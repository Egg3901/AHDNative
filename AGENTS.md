# Standing implementation rules

Read README.md before changing product scope or architecture.

- Build AHDNative as one mobile/desktop app for SP and MP, with iOS SP first.
- SP uses a local offline engine. MP uses the existing authoritative AHDGame server. Preserve existing authentication.
- Share the React UI across modes through explicit data/action adapters. Do not introduce a replacement UI stack or route players through a separate AHDClient app.
- Continue through the complete roadmap: gameplay and action depth, mechanics and save parity, mobile lifecycle, performance, and release readiness. Navigation/footer priority does not narrow the scope to those controls.
- Priority one is feature parity with AHDGame MP/SP navigation and the persistent footer status bar. Inventory destinations, nested menus, conditional role/country entries, resource details and linked actions. Mobile-first layout may differ; matching pixels is not required. Labels or placeholder pages alone do not count as completed features.
- Use actual MP/SP screens as the visual baseline. Device polish means responsive layouts, touch controls, navigation, accessibility, and lifecycle reliability. Require visual comparison from the first playable slice.
- Prioritize an iOS slice with a real game screen, local turns, and save/load; complete and harden SP before adding MP integration. Android and desktop follow. Web requires separate approval.
- Keep mechanics aligned with AHDGame. Performance changes must preserve behavior and be validated with replay evidence. Repository bootstrap does not satisfy the physical-device performance gate.
- This repository is public. Audit source and asset rights before import; never commit credentials, private operational material, or proprietary source without authorization to publish it.
- Report actual build and validation results. Never describe bootstrap checks as an iOS build or claim playable features before they exist.

## Build budget and signing privacy

- Codemagic allowance is 500 minutes. Run checks locally first; use Codemagic sparingly for deliberate private signed iOS builds. No push/PR/scheduled Codemagic triggers, automatic retry loops, or parallel duplicate builds.
- Keep the Codemagic workflow capped at 20 minutes. Review failure logs and minute usage before retrying; do not raise the cap without owner agreement.
- Signed binaries, archives, signing identities, profiles, Apple account identifiers and signing logs stay off GitHub. Never publish them as GitHub releases, Actions artifacts, PR attachments, or committed files.
- Keep Codemagic dashboards/artifact sharing private. Apple credentials belong in encrypted Codemagic app variables or integrations/signing identities, never in source. Do not send them to subagents.
- Use internal TestFlight distribution first. Do not automatically submit to external beta review, the App Store, or invite testers.
- Use Muse Spark and Grok for bounded independent implementation and research tasks. They must not trigger paid builds or access signing credentials.

## AHDNative 1.0.0 candidate gate

- Paid Codemagic and signed distribution builds are on hold until a solid 1.0.0 candidate has real passing behavioral tests and smoke evidence. Signing readiness, a placeholder screen, compilation, or an empty test suite do not satisfy this gate.
- Develop behavior using TDD: demonstrate a failing test through the agreed public contract or player flow, implement the smallest working slice, then demonstrate it passes. Expected mechanics results come from independent reference-engine evidence.
- Use the already established engine contract, save interchange and actual player flows as test boundaries. Record the specific boundary and expected behavior for each slice; do not invent internal-only tests to inflate coverage.
- Before a paid candidate build, demonstrate the real SP loop locally: create a world, select a playable country, perform meaningful actions, advance turns, save, close/relaunch and reload, then continue. Include corrupt-save failure behavior, deterministic replay, supported content coverage and visual comparison with actual MP/SP screens.
- Attach reproducible commands, source commit, results and remaining limitations to the candidate readiness record. Smoke tests must exercise the actual integrated implementation, not a mock world or placeholder screen.
- The first candidate is for owner review, not an automatic 1.0.0 release. Physical iOS signing, phone lifecycle and device performance validation occur after the first eligible private build; never claim those were proven on Linux.
- Continue local development and testing while paid builds are held. The existing budget, privacy and platform rules remain binding.
