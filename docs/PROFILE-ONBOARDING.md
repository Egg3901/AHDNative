# Profile onboarding, tutorial, and stats (#48)

Vertical slice: save-scoped onboarding and replay-tutorial prompts near the top
of Profile, with persisted completion/dismissal and a reachable tutorial flow.
Issue #48 stays open: allocation/reallocation mechanics are not implemented;
the exact gaps are listed at the end.

## Reference audit (pinned AHDGame)

Sources read at the pinned revision cited in #48:

- `src/app/profile/page.tsx` — banner order: `ProfileHeader`,
  `ConstituencySelector`, onboarding checklist or `NewPlayerBanner`,
  `ReplayTutorialButton`, `StatAllocationBanner`, tabs. Stats panel renders
  only when `rpgStatsEnabled && character.stats`; reallocation control only
  when `statsAllocated && !statsReallocationUsed`.
- `components/OnboardingCard.tsx` (`NewPlayerBanner`) — links to
  `/actions/suggestions`; dismissal persists via `PATCH /api/character/me`
  (`onboardingDismissed: true`).
- `components/OnboardingChecklist.tsx` — 9 canonical steps from
  `src/lib/onboarding/checklist.ts`; dismissal persists server-side; full
  completion pays an Anchor reward via `POST /api/onboarding/claim`.
- `components/StatAllocationBanner.tsx` — persistent reminder shown only when
  `statAllocationDismissed` was set without finishing; reopens the allocation gate.
- `components/CharacterStatsPanel.tsx` — read-only readout with per-stat
  `statBonus` label/detail plus `STAT_META` blurbs.
- `components/tutorial/ReplayTutorialButton.tsx` — always-visible entry to the
  `/tutorial` hub (chapter picker, resume, plan change).
- `src/lib/stats/featureFlag.ts` — `isRpgStatsEnabled` master gate; inert when off.
- `src/lib/onboarding/tutorialPlan.ts` — experience + interests plan driving
  chapters (`whats-new`, `core`, `office`, `invest`, `company`, `union`, `nation`).

Current Native state before this slice: creation writes the full seven-key
allocation (`STAT_POINT_BUDGET = 28`) and Profile rendered raw values whenever
present, with no onboarding/tutorial prompts and no dismissal state.

## What this slice implements

- Onboarding card (`Getting started`) directly after Constituency on Profile,
  mirroring the reference position. Four steps, each derived from live save
  state so completion persists with the save itself:
  `join-party` (partyId), `first-action` (player.actionCounts total),
  `file-for-race` (player candidacy), `grow-resources`
  (donorBaseLevel or savings). Every step links to a reachable Native route.
  Dismissal persists on `player.onboardingDismissed`.
- Tutorial card (`Tutorial`) next to it. `Open tutorial` navigates to the
  Help tutorial section; `Dismiss` persists `player.tutorialDismissed`. After
  dismissal a compact `Replay tutorial` link keeps the flow reachable, matching
  the always-available reference entry point.
- Help `Tutorial` section: six chapters, each ending on an existing screen
  (home region, parties, actions, elections, portfolio, news).
- Stats honesty: per-stat `statBonus` label/detail only for wired mechanics
  (charisma, debate, energy, fundraising, intellect); Business Acumen and
  Statecraft render `No local effect yet in this build.` No reallocation UI.
- Save impact is lazy: two optional booleans, absent on legacy saves (treated
  as not dismissed), validated as strict booleans at load. No schema bump, no
  migration, no hash-path change. Session applies updates through the existing
  validated `updateProfile` path, so rejections are atomic.

## Why #48 remains open (exact reallocation gaps)

1. No `statsAllocated` / `statAllocationDismissed` / `statsReallocationUsed` /
   `statXp` state and no validated allocation/reallocation action. The
   reference reallocation rewrites stats, clears stat XP and resets debate
   decay; Native cannot reproduce those prerequisites without the XP/action
   growth contract still blocked under #91.
2. No `rpgStatsEnabled` ruleset flag in the Native flag contract (#36); the
   stats section gates on presence of saved stats instead of a flag.
3. No completion reward (reference pays Anchors via a claim endpoint; inventing
   a funds grant would be an ungrounded economy change).
4. Tutorial chapters for company founding, union backing and wire reading are
   omitted: those destinations do not exist yet. Visit-tracked steps
   (scout-state, read-wire) are omitted: no visit tracking exists.
