# Standing implementation rules

Read README.md before changing product scope or architecture.

- Build AHDNative as one mobile/desktop app for SP and MP, with iOS SP first.
- SP uses a local offline engine. MP uses the existing authoritative AHDGame server. Preserve existing authentication.
- Share the React UI across modes through explicit data/action adapters. Do not introduce a replacement UI stack or route players through a separate AHDClient app.
- Use actual MP/SP screens as the visual baseline. Device polish means responsive layouts, touch controls, navigation, accessibility, and lifecycle reliability. Require visual comparison from the first playable slice.
- Prioritize an iOS slice with a real game screen, local turns, and save/load; complete and harden SP before adding MP integration. Android and desktop follow. Web requires separate approval.
- Keep mechanics aligned with AHDGame. Performance changes must preserve behavior and be validated with replay evidence. Repository bootstrap does not satisfy the physical-device performance gate.
- This repository is public. Audit source and asset rights before import; never commit credentials, private operational material, or proprietary source without authorization to publish it.
- Report actual build and validation results. Never describe bootstrap checks as an iOS build or claim playable features before they exist.

## Build budget and signing privacy

- Codemagic allowance is 500 minutes. Run checks locally first; use Codemagic sparingly for deliberate private signed iOS builds. No push/PR/scheduled Codemagic triggers, automatic retry loops, or parallel duplicate builds.
- Keep the Codemagic workflow capped at 20 minutes. Review failure logs and minute usage before retrying; do not raise the cap without owner agreement.
- Signed binaries, archives, signing identities, profiles, Apple account identifiers and signing logs stay off GitHub. Never publish them as GitHub releases, Actions artifacts, PR attachments, or committed files.
- Keep Codemagic dashboards/artifact sharing private. Apple credentials belong in Codemagic integrations and signing identities, never in source. Do not send them to subagents.
- Use internal TestFlight distribution first. Do not automatically submit to external beta review, the App Store, or invite testers.
- Use Muse Spark and Grok for bounded independent implementation and research tasks. They must not trigger paid builds or access signing credentials.
