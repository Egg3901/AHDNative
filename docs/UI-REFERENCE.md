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

## Canonical logo (issue #148)

The launcher now uses the established AHD identity. The temporary letter-A
mark (`app-icon.svg`) is removed; nothing is generated or redrawn.

Provenance (public sources, byte-identical copy):

- AHDGame `d4baf899fd8bd529099f03d7410807143604e2e5`, `public/ahd-logo.png`.
- AHDClient `378126dcb6c5b3366d182b442c6395d548b5edf5`,
  `apps/desktop/src/assets/ahd-logo.png`.
- Both are the same 500x500 RGBA asset, SHA-256
  `1a7fe54f33c781d6b7741277a20a9e800ca5525a0fbea790a7109c3e119f66a9`.
- Bundled offline at `public/ahd-logo.png` (same hash); no CDN or remote fetch.
- Rights: "A House Divided" and the logo are trademarks of Lakeside Games
  (see LICENSE.md). Same rights holder as the bundled Fraunces face above.

Launcher integration (`src/ui/LandingScreen.tsx`, `.ahd-landing-logo` in
`src/ui/ui.css`): the mark sits above the eyebrow in the hero intro, centered
on phones and left-aligned on desktop through the existing intro alignment.
It is decorative (`alt=""`) because the h1 already names the game, matching
the AHDClient launcher (`launcher-logo`, 88px desktop down to 58px at 390px
widths). Displayed size clamps from 4.5rem up to 6rem with a locked 1:1 aspect
ratio and a soft indigo drop shadow for contrast on the ethereal background.
The globe, background, entry/continue flows and accessibility tree are
unchanged. Behavioral test: decorative-identity case in
`src/ui/LandingScreen.test.tsx`.

Platform icons: generated locally with the existing Tauri workflow
(`tauri icon ../public/ahd-logo.png` from `src-tauri/`, Tauri CLI 2.x) into
`src-tauri/icons/` (Windows `.ico`, macOS `.icns`, PNG set, iOS set, Android
mipmaps, Store logos); `tauri.conf.json` needed no change. iOS icons carry the
opaque white fill the platform requires; all other outputs keep transparency.
Crops inspected at 32px, 48px, 180px and 512px: the bell badge stays
recognizable, with fine bell detail naturally softening at favicon sizes. The
next authorized package confirms the installed icon; no paid build was
triggered for this asset update.

Help/Settings remain unbranded app-local surfaces; there is no separate
identity backend and no auth surface yet (see #149, independent).

Rendered browser review covers 320x568, 390x844 and 1280x800. New game stays
in the initial viewport, there is no horizontal overflow, real geography
rotates locally and reduced motion stops it. The final polish replaces the
hard halo with a soft atmosphere, styles the import control, aligns desktop
actions and adds a sparse full-page starfield. The desktop window opens at
1100x760; narrower windows retain the mobile layout.

Responsive identity acceptance was repeated against the production bundle.
`smoke/landing-review.spec.ts` verifies at all three viewports that the
bundled image loads at its canonical 500x500 dimensions, renders square with
`object-fit: contain`, stays inside the viewport, remains decorative beside the
accessible product heading, and makes no external asset request. The check
exposed the HTML height attribute holding the phone render at 96px while its
responsive width shrank; `.ahd-landing-logo` now uses `height: auto`. All seven
landing scenarios pass after that correction, including the three pre-existing
entry-flow checks. Screenshots show the navy bell and white field remaining
distinct from the ethereal background without clipping at 320x568, 390x844 and
1280x800.

Representative generated resources were inspected directly: transparent 32px
desktop PNG, transparent 192px Android launcher, 432px Android foreground and
opaque 180px iOS icon. The mark remains centered and recognizable in each;
the Windows ICO contains six sizes and the macOS ICNS is readable. This is
asset and browser evidence only. Installed launcher treatment, OS masking and
device accessibility remain package/device acceptance.

Linux re-verification, 2026-09-15 (issue stays open, `status: partial`).
SHA-256 `1a7fe54f...f66a9`, 500x500 RGBA, offline decorative square launcher
render and full desktop/iOS/Android/ICO dimension declarations are pinned in
`src/ui/logoIconAcceptance.test.tsx` (8 cases, TDD red-to-green). Two concrete
defects were fixed: Android `mipmap-hdpi` legacy and round launchers were
49px instead of the 72px density size (corrected by downsampling the
same-pipeline xhdpi pair, so the canonical artwork is unchanged and nothing
is substituted or redrawn), and three byte-identical iOS `*-1.png` duplicates
were removed. No paid build was triggered, no signing material was accessed,
and no physical-device acceptance is claimed. Remaining: installed
icon/launcher confirmation in the next authorized package on each platform;
0.1.5 build 1.9 (or later) already contains the canonical families.

The globe remains decorative. Per-era selection, nation detail and drag/zoom
are outside this landing slice. Physical WebView frame pacing and battery
use remain device checks. Cross-screen imagery remains #143.

## Multiplayer account entry (issue #149)

Native follows AHDClient at
`378126dcb6c5b3366d182b442c6395d548b5edf5`. The launcher exposes Enter
multiplayer, then hands the player to the live AHDGame site. AHDGame owns sign
in, provider callbacks, account identity, logout and expiry. Native stores no
credentials, tokens or duplicate account record. Offline singleplayer remains
available without a network or account, and a saved character is not an
authenticated account.

Desktop opens or focuses one persistent in-app multiplayer WebView. Only the
exact HTTPS game and www origins plus the existing Discord and Google provider
hosts stay in that WebView; insecure, custom-port, deceptive-subdomain and
unrelated navigation opens externally. Every new-window request also opens
externally. The multiplayer WebView has an explicit empty capability grant, so
remote content cannot invoke Native saves or other IPC. On mobile the trusted
launcher command navigates the main WebView to the same live site, preserving
the platform's normal persistent cookie and storage profile.

Local tests cover launcher reachability, recoverable open failure, exact-host
classification and the explicit capability boundary. Real provider callbacks,
cookie restoration across relaunch, logout/expiry, cancellation, network
failure presentation and desktop/mobile lifecycle remain runtime acceptance
checks. Source and unit evidence alone do not complete #149.

## Route-level visual inventory (issue #143, compact)

### 0.1.6 route hero and identity checkpoint (#244)

Actions, Parties, character creation and Head of State now use the exact public
AHDGame WebP hero assets from `public/static/heroes` at the repository revision
used for the parity audit. They are copied into Native under the same public
path and load entirely offline. `RouteHero` ports the reference image-error
gradient fallback and adapts its crop from 172px on phones to 220px on wider
screens. HoS resolves White House, Downing Street, Reichstag and Zhongnanhai
art by country, with Actions as the explicit fallback for countries whose
executive image is not yet bundled. Party cards render `PartyMark` scoped by
country+party id with the reference error fallback: the engine `Party.logoUrl`
(reference `PoliticalParty.logoUrl`, chair-uploaded custom art) is carried
through every projection (`listCreationParties`, `rulingPartyForCountry`,
`projectPartyManagement`, politics detail, `projectWorld`, creation choices),
and the image renders only when that chain yields a real authored URL. All
authored packs carry none today, so marks resolve to the deterministic
initials+color fallback seeded from the storage-prefix-shaped
`country-party-` key (numeric ids canonicalized as in
`src/lib/partyLogoStorage.ts`). The preset-stable default-lookup key
`country:abbreviation` (reference `PARTY_LOGOS` keying, mirrored by engine
`partyLogoKey`) is carried as identity only: remote defaults are never
substituted. Coalition identity uses the new `CoalitionMark`, which follows
`CoalitionLogo`: an image renders only with both an explicit `logoUrl` and
a coalition id, otherwise the same deterministic fallback applies; the engine
surfaces no coalition roster DTO, so `CoalitionMark` stays reusable but
unbound. No logo route, upload pipeline, remote fetch, or proprietary art is
bundled; the reference resize/quality limits (`partyLogo` 256x256 q85) apply
upstream if a URL is ever produced. Marks reuse the fixed-size `.ahd-mark`
tile so roster rows hold at 320px and 390px with no overflow. Rendered tests:
`src/ui/PartyMark.test.tsx`, `src/ui/CoalitionMark.test.tsx`,
`src/ui/PartyManagementPanel.test.tsx`.

Party platform comparison (#143 visual, N04 detail): the Parties detail now
opens with a code-native comparison drawn from the saved projection. The
shared `PolicyCompass` SVG plots one marker per party at its real authored
`economicPosition`/`socialPosition` (-5..+5), a compact table repeats the same
numbers as text with bucket labels matching the detail card, and one-tap
party chips drive the same selection state as the existing dropdown, so both
controls select the detail card below. No logo URL is invented, no
vote/share/strength figures are added, and everything renders offline from
the projection. Source: `src/ui/PartyPlatformComparison.tsx` wired in
`src/ui/PoliticsPanel.tsx` (`PartiesSection`); tests:
`src/ui/PartyPlatformComparison.test.tsx`,
`src/ui/PoliticsPanel.test.tsx`. Read-only: editable platform actions stay
open under #59.

Provenance (read-only inspection of the public AHDGame checkout, no assets
copied): `src/components/PartyLogo.tsx` (route lookup + `logoUrl` override
+ error fallback), `src/components/CoalitionLogo.tsx`,
`src/lib/partyLogoStorage.ts` (country+party scoped keys),
`src/lib/imageOptimize.ts` (`partyLogo` 256x256 q85),
`src/lib/constants.ts` (`PARTY_LOGOS` country:abbreviation defaults),
`src/lib/db/types/party.ts` (`PoliticalParty.logoUrl`),
`src/lib/db/types/coalition.ts` (`Coalition` name/abbreviation/color/logoUrl),
`src/app/api/logos/parties/[partyId]/route.ts` (custom upload, then
`PARTY_LOGOS` default, then fallback) and
`src/app/country/[code]/parties/page.tsx` (party/coalition composition).

Actual-logo audit (no static assets bundled): upstream keeps no checked-in
party/coalition image files (`public/` carries none; `PARTY_LOGOS` values are
remote URLs). The remote defaults are not legally bundlable as a complete
offline set: most entries are Wikimedia Commons files (per-file license
review and attribution still required), while `UK:UUP`, `IE:WP` and `BR:PSB`
are English-Wikipedia fair-use files and `UK:LAB` is a proprietary CDN jpg,
so those four can never ship in an offline bundle. Coalition defaults do not
exist at all (the coalition logo route falls back to `/ahd-logo.png`). No
logos were fabricated: until a real authored URL flows through `logoUrl`,
marks intentionally render initials. Unblocks, in order: (1) an
owner-authorized authored/chair-upload equivalent for Native offline use,
(2) per-file rights clearance plus SHA-256 provenance for any Commons subset,
(3) a source-backed coalition roster DTO before `CoalitionMark` binding.

SHA-256 provenance: `actions.webp`
`cad398e81644f9ea924c511c649487bd139bf7612a391502205ebea6be86ed80`;
`parties.webp` `479100f4624ed7b5ae14444ce12651f21bb849839ae7757961e00ebbbbe4024f`;
`politicians.webp` `bb3078558687f426d939f74672e339033147e241b21495b269b59cc12acb7a00`;
`white-house.webp` `78ea4a19c80ff93c503d41bfcff6e6d9143cd1107d813c6fec4e329bcb41e0d5`;
`downing-street.webp` `78e8cdb21d695a0e421c114f843ce9ffb7defd1ada1f9454d57003854836233c`;
`reichstag.webp` `6d98a5dc27b9ac609df7b03200f95d4a928aff29924772262cf5acf616acd085`;
`zhongnanhai.webp` `b897df8cd2047021d42abc441b0f4a0c8a38531b03919cccf3a8d417bccafcbc`.

`smoke/route-heroes.spec.ts` renders and screenshots creation, career Actions,
HoS Actions and Parties
at 320x700, 390x844 and 1280x800, proves each image decodes from the local
bundle, detects horizontal overflow and rejects external image requests.
Remaining route assets stay explicit under #143; this checkpoint does not
claim whole-application image parity.

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
