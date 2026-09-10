# UI Reference — AHDNative Game Screens

Baseline: public AHDGame multiplayer/singleplayer React interface (Egg3901/AHDGame, public).

- Source commit inspected: e364c04954ed628beef73a993a8e9e156650a31e (2026-09-10)
- Files referenced (public):
  - `src/app/singleplayer/SingleplayerHome.tsx` — era preset cards, card-muted/border, primary CTA, overwrite confirm
  - `src/components/Navbar.tsx` and `src/components/navbar/*` — sticky header, tab density, safe-area insets
  - `src/components/national/tabs/*` — Nation tabs compact pattern
  - `src/app/globals.css` — default theme tokens: bg #14141c, fg #e8e8ee, primary #dc2626, card #1d1d2a, border #2a2a3d, muted #8f8f9d

Adaptation: tokens and card/border density reused for parity; layout is original responsive Tauri web (touch 44px, `env(safe-area-inset-*)`, sticky header, tablist accessibility). No proprietary assets or internal operational files copied. Attribution preserved in `src/ui/NewGameScreen.tsx` and `src/ui/GameScreen.tsx` headers.

Visual notes:
- Dense compact chrome, red accents, no decorative dashboard.
- Header: sticky backdrop-blur, turn/date/era/country + End turn/Save always reachable on small screens (flex wrap).
- Tabs: Overview, Character, Parties, Elections, News — all backed by real props, explicit empty states, no disabled fake pages.
- NewGame: era radio cards, country select filtered by era, name/seed validation, busy/error reflection.

No server paths, user data, or secrets committed.
