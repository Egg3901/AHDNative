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

### United States nation overview hero (issue #143)

- Native bundles `public/static/heroes/us-overview-mount-rushmore.webp`, a
  byte-identical copy of AHDGame's file at source revision `e364c04954ed628beef73a993a8e9e156650a31e`.
- SHA-256: `208e3eadeb480c0e5d26673c1e34db3af29e25e3906b1b91b9e8a44aa90e3a19`.
- Original: James Trotter, "HDR Mount Rushmore", 13 August 2017,
  https://commons.wikimedia.org/wiki/File:HDR_Mount_Rushmore.jpg.
- License: Creative Commons Attribution-ShareAlike 4.0 International,
  https://creativecommons.org/licenses/by-sa/4.0/. Native converts and crops
  the image for responsive presentation; this attribution and license are
  retained. No remote request is made at runtime.

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
with the existing entry actions (New game, saves/continue, deletion
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
hard halo with a soft atmosphere, removes the import control, aligns desktop
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
classification and the explicit capability boundary. Unlink runs through the
real server contract (POST /api/auth/logout, empty body): the server clears
the cookie and revokes issued tokens, Native drops every authed view and
returns to the sign-in card, and mobile additionally evicts the recognized
session cookie names from the platform jar since the relay cannot receive
the server's Set-Cookie expiry. Failed unlink keeps the signed-in session
with retry. Real provider callbacks, cookie restoration across relaunch,
logout/expiry, cancellation, network failure presentation and
desktop/mobile lifecycle remain runtime acceptance checks. Source and unit
evidence alone do not complete #149.

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

### Profile route hero and identity composition (issue #371)

Profile now opens on a route hero like Actions and Parties instead of a dense
text/card surface. `src/ui/ProfilePanel.tsx` renders a `RouteHero` whose
image is `profileHeroImage(profile.profileHeaderUrl)`
(`src/ui/RouteHero.tsx`): the saved custom header when set, otherwise the
bundled offline `politicians.webp` above (same SHA-256, no remote request).
Below the fold, one overlap identity row carries the projected portrait (or
initials fallback), party and office chips, and home-region/country links —
the same composition as the reference, without duplicating any editable
field (picture/header uploads and the biography editor stay in the Character
card body). Phone-first density: compact overlap at 320px
(`max-width: 360px`), base phone column at 390px, roomier overlap beside the
220px crop on desktop; chips and links keep 44px targets.

Provenance (read-only inspection of the public AHDGame checkout at the
revision above, no assets copied): `src/app/profile/components/ProfileHeader.tsx`
(banner strip with custom header or accent-gradient fallback, overlap
identity row, party/region/country/office chips), and
`src/lib/constants/profileHeroLayout.ts` (`PROFILE_HERO_OVERLAP_CLASSES`
negative-margin overlap). Deliberate adaptations: the reference gradient
fallback is the bundled politicians art, and server-only elements are
omitted — Patreon/admin/moderator badges, copy-link, wiki link,
member-since, and `CountryFlag` (no lawful flag asset is bundled; offline
play has no supporter tiers). No office, portrait, or lean is fabricated:
missing values render the existing honest unavailable states.

Rendered tests: `src/ui/ProfileHero.test.tsx` (hero imagery and fallback,
identity composition and destinations, edit-control boundaries, responsive
rules). Existing `src/ui/ProfilePanel.test.tsx` still protects every
profile edit, constituency, finance, and navigation behavior unchanged.

### 0.1.7 commodity hero subset (#378)

Fourteen of the 28 reference commodity heroes ship offline, byte-identical
copies from AHDGame `e364c04954ed628beef73a993a8e9e156650a31e`
(`public/static/heroes/`) under the same public path, wired through
`RouteHero` via `commodityHero()` (`src/ui/RouteHero.tsx`) with the reference
image-error gradient fallback. Unported and unknown commodity keys fall back
to Actions art, never a broken image or remote fetch. Reference slug source:
`COMMODITY_HERO_SLUGS` in AHDGame `src/lib/constants/commodities.ts`;
upstream files are served remotely through `/api/images/hero/[slug]`, whose
redirect targets (Wikimedia Commons) are the rights source below. Alt source
is `COMMODITY_HERO_ALTS` except for three entries where the reference wording
contradicts the inspected bundled bytes: `energy` reads "Anacortes oil
refinery" (reference claims power lines; the bytes show refinery towers with
a steam plume), `freight` reads "Maersk Sealand container ship at sea"
(reference claims a "Sovereign Maersk" vessel name found in neither the bytes
nor the route manifest; the hull reads MAERSK SEALAND), and
`pharmaceuticals` reads "Blister packs of assorted pills" (reference claims
a manufacturing line; the bytes show blister packs, File:Pill 3.jpg). Each
correction was grounded in the rendered local WebP plus the upstream file
identity in the hero route before wording. Alt resolution goes through the
total typed `commodityHeroAlt()` helper: exact-key lookup with no case
folding or trimming, and the nonempty `COMMODITY_HERO_FALLBACK_ALT`
("Commodity hero image") for every unported or unknown key. All 14 are public
domain or free CC licences, each verified against the Commons API; no
fair-use or proprietary entry is bundled. CC attribution is recorded here.
Files are 1280px-wide VP8 WebP (portrait to wide); `RouteHero` crops with
`object-fit: cover` at the shared 172px phone / 220px wider crop, so no new
CSS was needed. Focused tests: `src/ui/CommodityHeroImagery.test.tsx`
(resolver, total alt helper with exact-key and fallback behavior, the three
corrected alts, fallback accessible name, local webp container bytes,
rendered local decode, error fallback, crop CSS) and
`src/ui/MarketsPanel.test.tsx` (company-detail hero for a bundled sector and
the Actions fallback with the fallback accessible name).

SHA-256 provenance (left) and upstream Commons rights (right):

- `commodity-steel.webp` `95b743fc5a83f3c4b4859029fac76684e161ac3aac27fb48c858e1d26d95f797` - File:Showa Steel Works.JPG, public domain (Kokusho-kankoukai, pre-1945)
- `commodity-electronics.webp` `2ab2e8d292a92aea697c6a72544233952e4f2be0aaff3b88e83d0dafb2847844` - File:TSMC Fab5.JPG, CC BY-SA 3.0 (Peellden)
- `commodity-energy.webp` `9b7675fc0464d07537e182db1cb6090198f1fca1c10d0daef0b4a9904c76e561` - File:Anacortes Refinery 31911.JPG, CC BY 2.5 (Walter Siegmund)
- `commodity-chemicals.webp` `3465abc91483b813c730feaa410dcd98373c44b3c937d4112f1d3e5ba91f7d7b` - File:BASF Werk Ludwigshafen 1881.JPG, public domain (Robert Stieler, BASF-Archiv)
- `commodity-pharmaceuticals.webp` `3a6c1df192a21fb07c8a84b6cd1f00a689a04a0638b372877a2615ae71a5dc8b` - File:Pill 3.jpg, CC0 (freestocks.org via Pexels)
- `commodity-food.webp` `4b60e5a0e27a746114c53e4f80f9b8fa6bef3f264d77bd4cba57483bd304641f` - File:CSIRO ScienceImage 4486 Harvesting wheat.jpg, CC BY 3.0 (John Coppi, CSIRO)
- `commodity-building-materials.webp` `f1d5e6544f80effbe8fb411fe945899a0924188782f04f1abf0ab7be4c1f26a2` - File:HK Central Piers construction site building material steel.JPG, CC BY-SA 3.0 (Tosirog)
- `commodity-software.webp` `8073897067857099eb5795576cf1cd85ca1003d6f87bc9419b04b41260a72034` - File:Wikimedia Foundation Servers-8055 14.jpg, CC BY-SA 3.0 (Victorgrigas)
- `commodity-financial-services.webp` `452dc1ee7c85da1287041cb1011fa7e6426f1445565b727df64dd06d04b68ee3` - File:USA-NYC-New York Stock Exchange.JPG, CC BY-SA 3.0 (Ingfbruno)
- `commodity-advertising.webp` `2d1a53cbcd90630895c9fb17d3e07720fb5a8776c7f2b5cb39ac7b49bb6dd489` - File:Broadway and Times Square by night.jpg, CC BY-SA 2.0 (Willem van Bergen, via Flickr)
- `commodity-vehicles.webp` `ecce4279c4f062ea2329bd7851551b2ccb3877775ef44d1e243561429a636348` - File:Hyundai car assembly line.jpg, CC BY 2.5 (Anonyme)
- `commodity-retail.webp` `28c1ac96456d2f4cbd8a1a9fe9317705709c7cc47bdaa436906dc3491654832b` - File:Macys dep store.JPG, CC BY 3.0 (Mike Strand)
- `commodity-freight.webp` `1e2069e615d4144df1dde2d5f862ce821e356401d9115e7def9e61447e04bd9f` - File:Maersk container ship 002.JPG, CC BY-SA 3.0 (Yennen-Gas)
- `commodity-consulting-services.webp` `23f8a6ee7030709e1e22f464cb699b4bf0051b044936d1f22e876097934a944d` - File:Booz Allen Hamilton in Washington D.C..jpg, CC BY 2.0 (Tony Webster, via Flickr)

Explicitly not bundled: the other 14 reference commodity slugs have no local
file upstream (remote-only; the offline app cannot fetch them). The 11
`sector-*.webp` files carry no upstream source manifest (no credit, URL, or
licence recorded in AHDGame), so rights cannot be audited and they stay out
per the issue's fair-use/proprietary exclusion. `cabinet`, `imf` and
`imf-logo` have recorded Commons sources in the hero route but no Native
consumer surface yet (Native has no IMF, cabinet, or commodity destination;
corporation model and market lifecycles stay with #80/#211/#77), so they
are staged with the surface rather than shipped as dead weight. (The
`bank-of-england`, `bank-of-japan`, and `federal-reserve` bank heroes
formerly in this waiting list have since shipped on `main` via the
central-bank slice #386 with a Native banking consumer; see the banking
hero section below.) One Native surface consumes the
commodity set: Markets company detail (`CompanyDetail` in
`src/ui/MarketsPanel.tsx`) renders a `RouteHero` keyed by the listing's
recorded `sectorType` with `commodityHero()` / `commodityHeroAlt()`. Only
the `energy` and `retail` Native sectors hit bundled art (the 17
`CorporationType` sector keys otherwise miss the 14 commodity keys and take
the Actions fallback with the fallback accessible name); no route, mechanic,
or sector mapping was invented. Partial: the corporation, IMF, and cabinet
surfaces from #378 stay open (no Native consumer or rights manifest yet;
central-bank has since shipped via #386), the other 14 commodity slugs stay
remote-only, and the reference commodity browse surface has no Native
equivalent. The issue stays open with `status: partial`.

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
| Politics/legislature | `src/ui/PoliticsPanel.tsx`, `src/ui/LegislaturePanel.tsx`, `src/ui/LegislationDetailsPanel.tsx` | nav inventory sections 1-3 in [navigation parity](NAVIGATION-PARITY.md); Elections hub band in `src/ui/PoliticsPanel.tsx` via shared `RouteHero` (see below) |
| Markets/bonds/regions/world/search | `src/ui/MarketsPanel.tsx`, `BondMarketPanel.tsx`, `RegionsPanel.tsx`, `WorldPanel.tsx`, `SearchPanel.tsx` | world menu section 3 in [navigation parity](NAVIGATION-PARITY.md) |
| Help/Settings | `src/ui/HelpPanel.tsx`, `src/ui/SettingsPanel.tsx` | app-local surfaces, tokens from `src/app/globals.css` |

### Elections hub hero (issue #377)

Native Elections opens with a hero band plus a Races/Contested/Next-to-close
stat strip above the unchanged race lists. Composition (image band, title,
tagline, Contested prominent so zero candidates reads as open ground) follows
AHDGame at `e364c04954ed628beef73a993a8e9e156650a31e`:
`src/app/country/[code]/elections/components/ElectionsHero.tsx`
(`HeroImage`, `HeroStatsStrip`), tagline "Pick an office, find your seat, and
file to stand." The band reuses the already-bundled offline
`public/static/heroes/politicians.webp` (byte-identical to AHDGame, SHA-256
`bb3078558687f426d939f74672e339033147e241b21495b269b59cc12acb7a00`); the
reference remote Wikimedia voting photo is never copied or hotlinked. The
strip is pure composition over the projected race list
(`summarizeElectionRaces` in `src/ui/PoliticsPanel.tsx`): Contested counts
races with at least one declared candidate, Next to close is the soonest
filing deadline among unresolved races on the reference calendar, and no
tally or forecast is invented. Rendered tests:
`src/ui/ElectionsHero.test.tsx`. Remaining: primaries/results tabs,
candidate-directory page, per-race detail page.

### Banking hero subset (issue #386)

Three of the reference central-bank heroes ship offline, byte-identical
copies from AHDGame `e364c04954ed628beef73a993a8e9e156650a31e`
(`public/static/heroes/`) under the same public path, wired through
`RouteHero` via `bankingHero()` (`src/ui/RouteHero.tsx`) with the reference
image-error gradient fallback. Reference keying source:
`centralBank.heroImage` per country in AHDGame
`src/lib/constants/countries.ts` (US `federal-reserve`, GB plus SCO/WAL
which share the record `bank-of-england`, JP `bank-of-japan`), served
remotely through `/api/images/hero/[slug]`; Native ids use UK for Britain
so the Native map is US/UK/JP. Only these three slugs have a local file
upstream, so every other Native country (DD, CN, DE, IE and the rest,
including the ECB-shared records with no local file) falls back to Actions
art, never a broken image or remote fetch. The reference BankingHub hero
itself (`BankingHero` in AHDGame `src/app/banking/BankingHubClient.tsx`)
is an icon/gradient composition with no photo asset, so the photo surface
follows the central-bank detail pattern instead (`InstitutionMasthead`
in `src/components/national/InstitutionMasthead.tsx`: hero photo,
gradient, identity band).
US/UK alts repeat the reference `centralBank.heroAlt` verbatim. JP
carries no reference alt, so its alt follows the upstream file identity
recorded in the hero-route manifest (File:Bank of Japan 2010.jpg,
"Bank of Japan, Chuo-ku Tokyo Japan"): the head office building, not the
surrounding towers. Alt resolution goes through the total
`bankingHeroAlt()` helper: exact-key lookup with no case folding
or trimming, and the nonempty `BANKING_HERO_FALLBACK_ALT` ("Banking hero
image") for every unbundled or unknown key. All 3 are free CC licences
per the upstream hero-route manifest (`src/app/api/images/hero/[slug]/route.ts`,
which records the Commons file identity per slug); no fair-use or
proprietary entry is bundled. CC attribution is recorded here. Files are
VP8 WebP;
`RouteHero` crops with `object-fit: cover` at the shared 172px phone /
220px wider crop (120px short-landscape cap), so no new CSS was needed.
One Native surface consumes the set: Banking (`BankingSection` in
`src/ui/FinancePanel.tsx`) renders a `RouteHero` keyed by the world's
country id (new optional `countryId` prop, wired from `GameScreen`;
omitted ids take the Actions fallback with the fallback accessible name)
with cash/savings balances and the savings holder as hero content.
Deposit/withdraw validation, limits, busy/unavailable states and action
payloads are unchanged. The hero also ports the BankingHub primary-card
pattern with only Native-known data: a "Savings holder · {currency}"
label over the verbatim holder from `FinanceView`, which gives unbundled
countries a truthful identity band on fallback art. Prime/APY rates are
omitted (no Native DTO carries them) and the title stays "Banking" (no
Native credit surface). Focused tests:
`src/ui/BankingHeroImagery.test.tsx` (resolver, total alt helper
with exact-key and fallback behavior, the three grounded alts, fallback
accessible name, local webp container bytes, rendered local decode,
error fallback, Banking-surface hero with balances and transfer
controls, deposit/withdraw mechanics preserved, crop CSS, holder/currency
label on bundled and fallback art, 320px shrink/wrap and control-wrap
rules).

SHA-256 provenance (left) and upstream Commons rights (right):

- `federal-reserve.webp` `81acea8e60eb4194fd6c9b34b72b08b8776525f21605a271ae8ad99509a934fa` - File:Federal Reserve.jpg, CC BY-SA 2.5 (Dan Smith)
- `bank-of-england.webp` `3ccd1b258347ee7970eefb9a0a4ff5df1f8b51943ceb04a56f4b05770e0ec61d` - File:Bank of England Building, London, UK - Diliff.jpg, CC BY-SA 3.0 (David Iliff)
- `bank-of-japan.webp` `8ca60d078ac75eb58d6004f054ffb8e18862b73ed42e09da956414075b19b7a3` - File:Bank of Japan 2010.jpg, CC BY-SA 3.0 (Wiiii)

Explicitly not bundled: the other reference central-bank slugs (`ecb`,
`peoples-bank-of-china`, `banco-central-do-brasil`) have no local file
upstream (remote-only; the offline app cannot fetch them). DD's
Staatsbank record keys a flag URL (`getCountryFlagUrl("DD")`, no photo
hero), so bundling executive art such as reichstag/zhongnanhai for
DD/CN/DE/IE would misattribute the surface and stays out. Partial:
DD/CN/DE/IE and every other unbundled Native country take the Actions
fallback (honest generic art, not their real central bank), the
BankingHub icon/gradient composition itself is not ported, and no
physical-device run was performed. `smoke/route-heroes.spec.ts` covers
the Banking hero at 320/390/desktop.

Root visual review restored the reference Fraunces display face (Game
`src/app/layout.tsx` and `font-display` hero). The unchanged 600 face is bundled
from AHDClient `378126dc`, `apps/desktop/src/assets/fonts/fraunces-600.ttf`.
Fraunces is by the Fraunces Project Authors under SIL OFL 1.1; the full license
is shipped in `public/licenses/fraunces-OFL.txt`, sourced from
[Google Fonts](https://github.com/google/fonts/blob/main/ofl/fraunces/OFL.txt).
The globe and font need no runtime network request. Era badges use the playable
pack years rather than exposing seed implementation labels in the launcher.

## Glass material system (issue #437, partial)

Restrained glass-inspired hierarchy on the default theme tokens above
(bg #14141c, card #1d1d2a, elevated #26263a, border #2a2a3d). Contract:
`src/ui/materials.ts`; values: `src/ui/ui.css` material markers; tests:
`src/ui/materials.test.ts`. Inspiration only; no proprietary assets.

| Level | Surfaces | Treatment |
|---|---|---|
| Chrome | Persistent footer + bottom nav, navigation drawer, creation sticky action bar | App-bg tint 78%, 16px backdrop blur, translucent fg-18% outer edge + depth shadow on the footer |
| Elevated | Resource detail cards (nested inside the modal popover only, rendered as a flat transparent single-surface section: no own blur, edge, or depth); drawer disclosures (blur-free elevated tint over the already-blurred drawer, no nested backdrop cost) | Elevated tint 72%, 22px blur, translucent edge highlight on detail cards |
| Modal | Resource/notification popover dialogs | Elevated tint 68%, 28px blur, edge highlight, modal shadow |
| Content | All `.ahd-card` surfaces, `.ahd-empty` placeholders | Opaque, never blurred |

The drawer quick bar is transparent so drawer chrome shows through; the
drawer scrim stays an unblurred dim layer by design (a full-screen scrim blur
costs GPU for no hierarchy gain). Chrome inner dividers (bottom nav, quick
bar) use a fainter fg-10% hairline so they read subordinate to the outer
chrome edge instead of stacking a double rule.

Reduced transparency: Settings Transparency group (`system/on/off`) drives
`data-reduced-transparency`; explicit choice wins, otherwise
`prefers-reduced-transparency` applies; forced-colors also resolves solid.
Every level falls back to an opaque token (chrome surfaces footer, drawer,
and creation bar to app bg; elevated/modal surfaces resource details,
disclosures, and popovers to elevated card) with no blur. Solid-token contrast: body 12.1-15.4,
secondary 4.6-5.2, primary-action label 4.8. No new transitions or animations;
the existing reduced-motion takeover covers drawer/backdrop keyframes.
Layout geometry (insets, widths, heights, positioning) is unchanged and stays
owned by #436. Rendered acceptance:
`smoke/material-visual-acceptance.spec.ts` (320/390px portrait: chrome,
drawer, footer, resource overlay, opaque cards, dark appearance, reduced
transparency, forced-colors, large text, reduced motion; screenshots local
under `artifacts/smoke/material-*`). Remaining before release claims: named
physical-device performance evidence only.
