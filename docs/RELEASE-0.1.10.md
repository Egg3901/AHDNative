# 0.1.10 private game-menu preview

A new title screen and game menu for the next internal TestFlight preview.
The existing bell, offline globe and Fraunces title stay part of the game identity.

- Continue game opens the most recently saved world. An active world instead offers Return to game.
- New game, multiplayer, saved worlds, Ask, Help and Settings remain reachable.
- The navigation drawer keeps the complete existing hierarchy, role conditions, turn, save and exit controls, with a compact bell and character header.
- The title screen scales from a 320px phone to desktop, retaining safe-area floors, keyboard focus and reduced-motion behavior.

This is a development preview for internal review. Full mechanics and MP/SP parity, bidirectional save compatibility, physical-device lifecycle and late-game performance remain open. See the [roadmap](ROADMAP.md), [mode parity](NATIVE-MODE-PARITY.md) and [iOS validation](IOS-RUNTIME-VALIDATION.md).

The candidate starts from accepted main and does not include the unqualified schema65 work. The next paid build requires actual integrated create/action/turn/save/relaunch/continue and failure-recovery evidence on its reviewed commit. Signing uses the existing manual iOS workflow with a 20-minute cap, exact source pin and internal TestFlight distribution. Delivery and Apple processing are recorded after they complete.
