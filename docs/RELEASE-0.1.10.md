# 0.1.10 private game-menu preview

A new title screen and game menu, delivered privately as internal iOS **0.1.10 (1.23)**.
The existing bell, offline globe and Fraunces title stay part of the game identity.

- Continue game opens the most recently saved world. An active world instead offers Return to game.
- New game, multiplayer, saved worlds, Ask, Help and Settings remain reachable.
- The navigation drawer keeps the complete existing hierarchy, role conditions, turn, save and exit controls, with a compact bell and character header.
- The title screen scales from a 320px phone to desktop, retaining safe-area floors, keyboard focus and reduced-motion behavior.
- The two-line title keeps whole words at 200% text size on a 320px phone.
- Delayed multiplayer navigation leaves focus in a mail field when the player has already begun typing. Drafts survive an embedded Ask visit.
- Source-supported parliamentary appointments use country-specific offices and validate their saved votes. The original CN/DE career tax checks must earn a party chair and complete the real appointment calendar before sponsoring legislation.

This is a development preview for internal review. Full mechanics and MP/SP parity, bidirectional save compatibility, physical-device lifecycle and late-game performance remain open. See the [roadmap](ROADMAP.md), [mode parity](NATIVE-MODE-PARITY.md) and [iOS validation](IOS-RUNTIME-VALIDATION.md).

The candidate starts from accepted main and retains schema 54. It does not include the unqualified schema 65 work. The [save compatibility record](SAVE-COMPATIBILITY.md) explains older-reader refusal of newly supported PM votes.

Focused validation has passed the real SP create/action/turn/save/relaunch/Continue/next-turn browser loop, nine landing/mobile-drawer browser cases, 66 landing/drawer UI cases, 20 multiplayer navigation cases, six appointment/save unit cases and deterministic session replay. The browser cases cover 320px, 390px and desktop entry, offline identity, reduced motion, 200% title text and actual drawer navigation followed by a turn. Appointment unit cases use eligibility and calendar fixtures; they do not establish an earned political career. The source career helpers retain actual chair and PM deadlines, with a disclosed 100 AP resource fixture. The complete application, engine, content, browser and Rust [verification](https://github.com/Egg3901/AHDNative/actions/runs/37084742443) passed on runtime source `d43ebc84ccb2113b95fe49d4b01cc83bbf2effbd`, including the earned CN/DE government and tax-law career journeys. The delivered commit changes only the Mac certificate bootstrap, workflow guard and iOS testing documentation; app, engine, dependencies and Rust sources are identical. All 48 rules/workflow guards and the exact delivered-source SP/recovery browser loop passed 3/3. The repeated full head [verification](https://github.com/Egg3901/AHDNative/actions/runs/37088728120) passed every step; [PR #738](https://github.com/Egg3901/AHDNative/pull/738) merged as `15a6aa690800ccbe8c1c508df2e2d4d28afbff3f`.

Signing used the existing manual iOS workflow with a 20-minute cap and exact source pin. The first attempt failed before IPA generation during Homebrew dependency setup; its private log was reviewed and an explicit certificate-package reinstall added before one deliberate retry. The successful build took 5.41 elapsed minutes; both attempts used 6.90 elapsed minutes combined. These are elapsed build durations, not an account billing statement.

The actual private IPA reports marketing version `0.1.10`, build `1.23`, minimum iOS `16.4`, with approved iPhone/iPad icon pixels verified. Apple reports `VALID`, `INTERNAL_ONLY`, `IN_BETA_TESTING`; assignment to the existing Owner review group and English test notes were confirmed by a fresh API read. Source is `52f4860db4d8f500d20f6cbbb1b6c43bc30dff0c`, tag `preview/0.1.10-2`. Signed artifacts, checksum, account identifiers and signing logs remain private. No new Windows or Android build is claimed.

Review the new main menu, continue an existing save, perform an action and turn, save, close the app and resume. This delivery does not establish a physical-iPhone launch, lifecycle or performance result. #124 and #510 remain partial and open; no broader issue closes from this menu pass.
