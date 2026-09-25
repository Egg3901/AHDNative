# Game behavior and display hierarchy

AHDNative ports A House Divided. Existing entry behavior, screen hierarchy,
conditional controls, action preconditions and outcomes are requirements. Mobile
layout and input may adapt to the device. Reusing engine numbers in a new
information dashboard does not satisfy this requirement.

Reference: AHDGame `e364c04954ed628beef73a993a8e9e156650a31e`.
Read source before each slice; record any intentional SP/MP differences. Missing
engine capabilities remain gaps to port, not permission to substitute a screen.

## Entry correction

`src/app/page.tsx` redirects character singleplayer worlds to `/profile` after
checking for an existing world and character. Signed-in multiplayer also opens
`/profile`. World simulation has a separate path; it is not character play.

Native now starts and resumes character games on Profile. The invented national
Overview landing is removed. Economy, Budget, Policy and other existing game
destinations remain in the drawer. The bottom controls are Profile, Actions,
Parties and Menu. End Turn, Save and Exit remain in the drawer as requested.

## Profile is still partial

AHDGame `src/app/profile/page.tsx` renders the following mobile document order:

1. Profile header with identity, party, office and home region; constituency selector.
2. Conditional onboarding, tutorial replay and stat-allocation reminder.
3. Political profile by default; Military tab only when conflicts are enabled
   (`src/components/profile/ProfileTabs.tsx`).
4. Political standing and conditional character stats.
5. Policy/demographics; conditional CEO corporation card; finances and portfolio link.
6. Conditional social information, career history and achievements.

Native now provides the portrait/name/party/home-region header, editable biography,
political standing and finances in that relative order. PFP upload/removal and
bio edits persist in the actual world save. Standing exposes the saved AP, state
influence, favorability and infamy; finances exposes cash, campaign funds,
savings, donor level and current regular/donor income. Party, region, country,
Campaign Office and Portfolio controls open their actual destinations.

Player national influence, party influence, Energy/RPG stats, policy axes and
career/achievement data still lack full engine support. Unavailable influence
values are not replaced with zeros or borrowed from NPC politicians. This remains
a partial profile port. The whole-game issue tracker is
[#28](https://github.com/Egg3901/AHDNative/issues/28).

## Conditional corporation card (#51, partial)

AHDGame `src/app/profile/page.tsx` renders `CeoCorporationCard` only when a
corporation records `ceoId === character._id` with `ceoVacant` not true, and
links `/corporation/[id]`. The card itself shows the logo, name, an optional
"national enterprise" note and the link; salary and dividend income live
elsewhere on the reference profile.

Native has no CEO relationship: corporations carry no `ceoId`/`ceoVacant` and
are NPC-run (`packages/engine/src/corporation/types.ts`). The only recorded
ownership is the #295 sector asset (`CorporateSectorAsset.owner === "player"`),
so the Profile card gates on that, labels the role "Sector owner" (never CEO),
copies its values verbatim from the Markets `MarketListing` the company detail
renders, and links that detail with a Back frame to Profile. Salary and
dividends render as unavailable notes because the engine has no CEO salary
flow and no dividend system; they are not zeros.

Evidence:

- `src/game/profileCorporation.test.ts`: projection, save/reload, owner
  reverted, removed corporation fails load.
- `src/ui/ProfileCorporationCard.test.tsx` and
  `src/ui/CorporationDetailReturn80.test.tsx`: panel and shell wiring, jsdom
  at 320/390/desktop.
- `smoke/profile-corporation-card.spec.ts`: rendered Chromium flow at 320px
  and 390px. The owner fixture is built from public actions (`buyShares`,
  `listSectorForSale`, `buySectorForSale`) plus test-only save setup
  (`player.cash` raised to the asking price; a second variant with
  `corporateSectors[*].owner` reverted, since no player action releases a
  sector), each re-validated through `GameSession.load` and then loaded via
  the #506 resume-path hook. Asserts card present, View company opens the
  detail, Back to profile, page reload keeps the card, reverted owner and
  ordinary player render no card. Run
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=$(which google-chrome) npx playwright test smoke/profile-corporation-card.spec.ts`;
  screenshots are regenerated under `artifacts/smoke/profile-corporation-*.png`
  (git-ignored, not committed).

Remaining before closure: a recorded CEO relationship and its vacancy rule,
CEO salary and dividend income from the corporation projection, the reference
logo/brand treatment, and physical-device validation. This layout slice fixes the
separate 320px presentation finding: the corporation card stacks label/value
rows at that width so `$21,285,000,774.00` stays on one line. A rendered
money-line assertion failed before the CSS change (two line fragments for
Corporate cash) and the 320px owner flow passed afterward, with the screenshot
inspected. The four-case local suite passed 3/4; the 390px owner case reached
company detail and timed out on `page.reload` at its 90-second limit on the
loaded shared host. The 390px screenshot showed the pre-existing two-column
layout; this local run does not claim a complete 390px resume pass.

## Saved profile identity

AHDGame `ProfilePictureUpload.tsx`, `api/upload/avatar/route.ts` and
`api/schemas/settings.ts` supply the reference behavior: raster portrait upload,
2 MB maximum and a trimmed biography of at most 500 characters. Native uses
JPEG/PNG/WebP input and decodes/downsizes large pictures to 256px locally; its
inline biography editor adapts the settings flow to mobile. No upload server or
remote portrait fetch is required for SP. Existing authentication is unchanged.

Optional `player.bio` and `player.avatarUrl` preserve the current JSON envelope.
Missing fields remain valid old saves; metadata does not alter time, AP or RNG.
The worker validates edits atomically and the app saves through its existing
repository. Failed saves keep the biography editor and draft available for retry.
Read-only profile queries keep image bytes out of routine action/turn responses.

## Cabinet ministerial-order player flow (#262)

Reference source: AHDGame `e364c0495`,
`src/app/country/[code]/executive/cabinet/[positionId]/office/page.tsx`
and its `components/MinisterialOrderPanel.tsx`. That player route keeps a
position-specific office open while issuing an order, gives one result message,
shows active orders and remaining ministerial actions, and lets the server
refresh the office. The US Treasury catalog at
`src/lib/countries/us/cabinet/orders.ts` defines Emergency Fiscal Stimulus as
24 turns with `economic.unemploymentRate` modifier `-0.03` nationwide.

Native's mobile cabinet selector adapts the position URL to the drawer. A
Head-of-State US player can sponsor their own Treasury nomination through the
public session command. The engine confirms the seat on turn 24; only then
does the drawer expose Cabinet office and its issue control. The focused
`src/ui/CabinetPlayerFlow262.test.tsx` suite passed 5/5: vacant-office
refusal, natural seat confirmation, valid/duplicate/unknown order results,
next-turn application, and exact office projection after save/reload. The
earlier acceptance tests that directly inserted cabinet rows are not used as
proof of player reachability.

`smoke/cabinet-player-flow.spec.ts` passed both 320px and 390px integrated
flows through the real app: open the drawer destination, issue the order,
save, reload, and reopen it. It generates the loaded save by those public
nomination and turn commands; it does not insert a cabinet member or order.
Screenshot inspection at both widths caught an office-selection reset after
issue and duplicate feedback. A failing browser assertion recorded the
duplicate result; the screen now keeps Treasury selected across the detail
refresh and shows one inline result. The final local two-width run passed,
including an assertion that the complete active-order card can scroll clear
of the fixed footer. Reproduce with
`npm run test:smoke -- smoke/cabinet-player-flow.spec.ts`; screenshots are
regenerated in ignored `artifacts/smoke/cabinet-player-*.png`.

This verifies the bounded order player flow and mobile rendering on Linux.
It does not claim the rest of AHDGame's cabinet office modules, exact
cross-engine turn outputs, or physical-device behavior; those remain tracked
under #105/#281 and #43/#44.

## Next acceptance slices

| Slice | Required evidence | Status |
|---|---|---|
| P01 Character entry | New game and real save/reload open Profile; national figures reached through Economy | Implemented, validation below |
| P02 Profile hierarchy | Header/PFP/bio, standing and finance implemented; remaining reference sections and underlying player mechanics still required | In progress |
| P03 Actions | Reference action categories, eligibility, costs, target selection and outcomes; not a flat list inferred from engine exports | Queued |
| P04 Conditional navigation | Country, home region, party, office, election, corporation and union conditions match reference builders | Queued |
| P05 Whole-game flow review | Trace each destination from entry through actions, resulting state and return navigation; mark all unsupported mechanics | Required throughout |

The source profile navigation builder `src/components/navbar/profileNavItems.ts`
keeps Profile and Actions distinct. My Corporation requires a corporation; My
Union requires enabled unions and membership. Rendering unconditional labels
without their behavior does not count as parity.

Each slice needs a source-backed expected player flow, meaningful behavioral
checks through the agreed session/UI boundaries, and mobile visual comparison.
Build success, label counts and tests of Native's own invented layout are not
reference parity evidence. Physical device and performance gates remain open.

## Profile port validation

The saved-session checks failed before the profile methods existed, then passed
with real metadata save/load, turn survival, atomic validation and unchanged
resources/RNG. The integrated verification batch passed the production build,
107 app/session tests, 153 UI tests and career fixture integrity. The browser
batch covered 15 scenarios; 14 passed initially and the portrait case passed
when it used the actual enabled upload button/file picker rather than setting a
disabled input while the prior save refreshed. Final 320px large-text and 390px
profile layout checks passed after inspecting and fixing cramped header labels.

The portrait/biography scenario verifies resized image display, unchanged AP/turn,
relaunch persistence and removal. Another scenario rejects an invalid image,
injects a storage failure, retains the draft and succeeds on retry. These are
local integrated browser checks, not phone lifecycle or whole-game parity.

A fresh world with both metadata fields also passed through the real pinned
AHDClient v43 (`568c0c0`) reader/writer and the v42 (`c501754`) reader/writer after
Native's v42 projection, then reopened in Native with both fields retained.
This is the fresh-world subset only; progressed political-state export remains
blocked as documented in SAVE-COMPATIBILITY.md. No paid builds or signing ran.
