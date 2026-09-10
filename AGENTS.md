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
