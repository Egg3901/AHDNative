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
Native Profile includes portraits, biographies, standing and finances; the
remaining reference interactions stay tracked in the behavioral inventory.

For each ported screen, record the reference route, section order, conditional
controls, action preconditions and resulting navigation/state. Validate those
flows through the integrated app. A test based only on Native's own layout cannot
prove parity. See [behavioral parity](BEHAVIORAL-PARITY.md) for the next slices.

## Landing globe (issue #142)

Native home is now globe-led: a canvas orthographic dot globe anchors the hero,
with the existing entry actions (New game, saves/continue, import, deletion
confirmation, Help/Settings, return to game, build label, loading/error flows)
unchanged and still owned by App state. Starting or loading still enters
Profile. Implementation: `src/ui/LandingScreen.tsx` (presentation only),
`src/ui/LandingGlobe.tsx` (imperative canvas, DPR capped at 2, ~30fps, pauses
when hidden/offscreen, static frame under reduced motion), landing styles in
`src/ui/ui.css`. Behavioral tests: `src/ui/LandingScreen.test.tsx`.

Provenance (read-only `git show`, no runtime/ops material copied):

- Composition and display typography follow AHDGame at
  `d4baf899fd8bd529099f03d7410807143604e2e5`: `src/components/LandingGlobe.tsx`,
  `src/app/_landing-v2/SandboxHome.tsx`, `src/components/landing/`
  `globeEnhancements.ts`, `eraThemes.ts`, `src/app/world/worldConstants.ts`.
  Game geography loads from a remote CDN GeoJSON, so no Game geometry is
  bundled or fetched; arcs, hotspots, tier colors, showcase rotation and
  marketing CTAs were deliberately not ported (offline app cannot support
  server/auth/marketing flows).
- Geography is the bundled AHDClient dot set at `378126dc`
  (`apps/desktop/src/landDots.ts`, commit `05b2832`, copied verbatim to
  `src/ui/landDots.ts` with header): 2210 factual lon/lat pairs, same rights
  holder (Lakeside Games), no remote dependency. Canvas structure, frame
  budget and reduced-motion handling follow Client's
  `apps/desktop/src/launcher/CommandGlobe.tsx`. The owner requested a quieter
  ethereal space treatment: cool atmospheric lighting, faint graticule and
  no capital labels. No generated or arbitrary geography.
- No `.env`, credentials, signing, download URLs, server auth or marketing
  copy were read or copied. Only the files named above were inspected.

Rendered browser review covers 320x568, 390x844 and 1280x800. New game stays
in the initial viewport, there is no horizontal overflow, real geography
rotates locally and reduced motion stops it. The final polish replaces the
hard halo with a soft atmosphere, styles the import control, aligns desktop
actions and adds a sparse full-page starfield. The desktop window opens at
1100x760; narrower windows retain the mobile layout.

The globe remains decorative. Per-era selection, nation detail and drag/zoom
are outside this landing slice. Physical WebView frame pacing and battery
use remain device checks. Cross-screen imagery remains #143.

## Route-level visual inventory (issue #143, compact)

Full destination/conditional-menu inventory lives in
[navigation parity](NAVIGATION-PARITY.md); this table only maps each Native
entry surface to its reference source so follow-up styling stays grounded. No
redesign beyond landing is attempted here.

| Native surface | Native source | Reference source (AHDGame) |
|---|---|---|
| Landing/home | `src/ui/LandingScreen.tsx`, `src/ui/LandingGlobe.tsx` | `src/app/_landing-v2/SandboxHome.tsx`, `src/components/LandingGlobe.tsx` |
| New game | `src/ui/NewGameScreen.tsx` | `src/app/singleplayer/SingleplayerHome.tsx` |
| Game chrome/nav/footer | `src/ui/GameScreen.tsx`, `src/ui/MobileNavigation.tsx` | `src/components/Navbar.tsx`, `src/components/navbar/*` |
| Profile (entry target) | `src/ui/ProfilePanel.tsx`, `src/ui/ProfileRoute.tsx` | `src/app/page.tsx` routing to `/profile` |
| Nation/Economy | `src/ui/NationPanel.tsx`, `src/ui/FinancePanel.tsx` | `src/components/national/tabs/*` |
| Politics/legislature | `src/ui/PoliticsPanel.tsx`, `src/ui/LegislaturePanel.tsx`, `src/ui/LegislationDetailsPanel.tsx` | nav inventory sections 1-3 in [navigation parity](NAVIGATION-PARITY.md) |
| Markets/bonds/regions/world/search | `src/ui/MarketsPanel.tsx`, `BondMarketPanel.tsx`, `RegionsPanel.tsx`, `WorldPanel.tsx`, `SearchPanel.tsx` | world menu section 3 in [navigation parity](NAVIGATION-PARITY.md) |
| Help/Settings | `src/ui/HelpPanel.tsx`, `src/ui/SettingsPanel.tsx` | app-local surfaces, tokens from `src/app/globals.css` |

Root visual review restored the reference Fraunces display face (Game
`src/app/layout.tsx` and `font-display` hero). The unchanged 600 face is bundled
from AHDClient `378126dc`, `apps/desktop/src/assets/fonts/fraunces-600.ttf`.
Fraunces is by the Fraunces Project Authors under SIL OFL 1.1; the full license
is shipped in `public/licenses/fraunces-OFL.txt`, sourced from
[Google Fonts](https://github.com/google/fonts/blob/main/ofl/fraunces/OFL.txt).
The globe and font need no runtime network request. Era badges use the playable
pack years rather than exposing seed implementation labels in the launcher.
