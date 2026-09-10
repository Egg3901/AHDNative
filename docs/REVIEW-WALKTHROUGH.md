# Review walkthrough (private feedback build)

Singleplayer slice only. No full mechanics parity is claimed; the
[whole-game audit](https://github.com/Egg3901/AHDNative/issues/28) remains open. This note covers what to try, what
works, and what is known-unproven on this build.

## Fresh-world flow (2 minutes)

1. Launch: home shows New game, Help, Settings, Import saved game, Saved games.
2. New game: pick an era card, a country, enter a name (1-80 chars), leave seed
   empty for random or set one for a reproducible world. Start opens Profile.
3. Profile (entry screen for every start and resume): portrait upload or
   initials fallback, party chip linking to party details, home-region and
   country links, office label, editable biography (500 chars), political
   standing (actions with cap and per-turn rate, state and national influence,
   favorability, infamy, party influence when in a party), finances (donor
   network level, cash, campaign funds, savings, regular and donor income).
   Unsimulated metrics render as unavailable, never as zeros.
4. Bottom bar: Profile, Actions, Parties, Menu. Menu (side drawer) holds the
   full destination list plus End turn, Save, Exit, Close.
5. Actions tab: real action cards with cost badges, amount/party/region fields
   where required, disabled reasons shown inline. Success messages appear as
   status; rejections stay out of the saved state.
6. End turn from the drawer, then Exit (auto-saves first). Home lists the save;
   Continue resumes on Profile. Delete asks for confirmation first.

## Supported controls on this build

- Character: Profile, Actions, Portfolio, Stock market, Bonds.
- State: Home region, Regions (browse region details).
- Nation: Parties (join/leave with candidacy warning), Start a party,
  Caucuses, Legislature (vote, sponsor), Bills and proposals (incl. tax-rate
  sponsorship), Elections (run/withdraw, race details), Politicians, Economy,
  Budget, Policy.
- World: Nations, Banking (deposit/withdraw), News.
- Help: Search (offline saved-entity search with links), Help, Settings
  (text size, reduced motion; device-local only, persist across relaunch).
- Footer: compact Turn/date line plus AP, Funds, Cash, Influence,
  Favorability buttons. Each opens details with linked Go to
  Actions/Profile/Portfolio shortcuts. National figures (GDP etc.) live under
  Economy, not on Profile.
- Portrait upload accepts JPEG/PNG/WebP under 2 MB, downscaled to 256 px.

## Known limitations (do not file these as new)

- Mechanics: many systems are still being brought to reference parity; see
  MECHANICS-PARITY.md and the whole-game audit. Corporation management,
  unions, maps, country switching, regional legislative actions and several
  advanced country systems are unavailable.
- Saves: interchange coverage is whatever SAVE-COMPATIBILITY.md validates;
  unlisted schemas are not promised. Import cap is 256 MB.
- Native proof outstanding (IOS-RUNTIME-VALIDATION.md): bundled worker in
  WKWebView, Rust store round-trip with terminate/reopen, background/lock
  during turn and during save, phone turn timings, VoiceOver and keyboard
  passes, and MP/SP screen comparison on device. Browser smoke covers phone-size new game, actions, turn, save, reload,
  resume and corrupt import. Rust storage and engine tests provide separate
  evidence, but do not establish a working native webview or physical device.
- Appearance settings do not change world rules, actions, saves, or accounts.

## If something breaks

Note the screen, the last action or turn, and the exact message text. Saves
stay listed on home; a failed import leaves the current session open. Reload
and Continue from the preceding save.

## Feedback details

Include the Preview version and source revision shown on Home or Settings, your
OS/device, era/country, and the steps that led to the result. Prefer the 1953 US
fresh-world flow first. TestFlight feedback stays private; do not attach saves
with personal profile content to public issues.

The iOS preview requires iOS 16.4 or newer. Windows needs a current WebView2
runtime, and Android needs a current Android System WebView. Native device
launch and lifecycle checks remain part of this first review.
