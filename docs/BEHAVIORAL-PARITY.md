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
