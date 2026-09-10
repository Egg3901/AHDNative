# UI Reference - AHDNative Game Screens

Baseline: public AHDGame multiplayer/singleplayer React interface (Egg3901/AHDGame, public).

- Source commit inspected: e364c04954ed628beef73a993a8e9e156650a31e (2026-09-10)
- Files referenced (public):
  - `src/app/singleplayer/SingleplayerHome.tsx` - era preset cards, card-muted/border, primary CTA, overwrite confirm
  - `src/components/Navbar.tsx` and `src/components/navbar/*` - sticky header, tab density, safe-area insets
  - `src/components/national/tabs/*` - Nation tabs compact pattern
  - `src/app/globals.css` - default theme tokens: bg #14141c, fg #e8e8ee, primary #dc2626, card #1d1d2a, border #2a2a3d, muted #8f8f9d

Adaptation: preserve the reference game behavior and section hierarchy; adapt layout and input for responsive Tauri web (touch 44px, `env(safe-area-inset-*)`, modal side drawer, labeled bottom navigation). No proprietary assets or internal operational files copied. Attribution preserved in `src/ui/NewGameScreen.tsx` and `src/ui/GameScreen.tsx` headers.

Visual notes:
- Dense compact chrome, red accents, no decorative dashboard.
- Navigation: side drawer contains the destination hierarchy, player identity and End Turn/Save/Exit. Four labeled primary controls stay at the bottom; page content begins without a top banner.
- Drawer destinations use real screens and explicit empty states. Background content is inert while open; Escape, Close or backdrop dismisses it. Focus follows navigation. See [mobile navigation](MOBILE-NAVIGATION.md).
- NewGame: era radio cards with focus-visible ring, country select filtered by era, name 1 to 80 any unicode, seed optional up to 256 any unicode (empty means root generates UUID), form submit via Enter.
- Game: percent metrics are fractions multiplied by 100, money absolute, action buttons labeled with action name, amount validates positive integer before invoke, party/region validates selection exists, tap targets 44px, no horizontal overflow.
- CSP: style-src allows inline styles for React, script-src stays self, worker-src self blob.

No server paths, user data, or secrets committed.

Priority one is functional navigation and persistent status-bar parity, with mobile-first layouts rather than pixel matching. The [navigation inventory](NAVIGATION-PARITY.md) enumerates source destinations, conditional menus, resource details and gaps. A styled tab is not proof that its reference feature set is complete.

## Behavioral acceptance, not just visual tokens

AHDGame at the revision above routes established character SP and signed-in MP
players from `src/app/page.tsx` to `/profile`. Native now starts and resumes on
Profile, removing the invented national Overview landing. GDP remains in Economy.
The current Native Profile is only a basic identity/resource summary; that entry
correction does not complete the reference profile or its gameplay interactions.

For each ported screen, record the reference route, section order, conditional
controls, action preconditions and resulting navigation/state. Validate those
flows through the integrated app. A test based only on Native's own layout cannot
prove parity. See [behavioral parity](BEHAVIORAL-PARITY.md) for the next slices.
