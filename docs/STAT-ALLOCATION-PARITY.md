# Profile allocation and tutorial acceptance (#48)

The local Profile now combines the existing persisted onboarding/tutorial flow
with the reference RPG gate, deferred legacy allocation and single free reset.

## Reference and expected player flow

Allocation/reset behavior was read from AHDGame
`6ed11a3d41f6dbc82b4cb81ab9d6fc90438208b9`. A fresh reference check at
`f77a426f769a10cae59c17511053f076dacec0a0` found no changes in these paths:

- `src/app/api/character/allocate-stats/route.ts`
- `src/app/api/character/reallocate-stats/route.ts`
- `src/lib/stats/` and `src/components/stats/`
- `src/lib/seeds/reference/featureFlagDefaults.ts`

The reference gate defaults on. A character without an allocation receives a
suggested build and can choose Maybe later. The saved dismissal leaves a Profile
reminder with Return to stats. Lock In Stats accepts exactly seven integer
values, each 1 through 10, totaling 28. A recorded allocation cannot be repeated.

An allocated character has Reallocate (1 free) until it is used. The reset
starts at the one-point floor, requires all 21 free points to be assigned and
warns that earned growth will be erased. Confirmation replaces the whole
spread, clears recorded stat XP, resets the Debate decay anchor and permanently
consumes the single reset. Cancel and Escape preserve eligibility. Neither
command spends cash, campaign funds or AP.

Native uses its saved game date for the offline decay anchor. Older Native
creation saves with a complete seven-key block count as allocated; an explicit
allocation marker takes precedence. Partial legacy blocks stay in the save and
request a complete allocation. The Profile readout waits for that allocation.

Suggested-build weights and integer distribution follow the reference helper.
Recorded donor network, campaign funds, favorability, influence, office and
resolved career wins supply the input. Native has no CEO relationship (#51),
so corporate-sector ownership is not presented as a CEO signal. The independently
executed reference input (donor level 0, funds 50,000, favorability 50, influence
0, no office or career entries) yields this literal spread:

| Charisma | Debate | Energy | Fundraising | Business Acumen | Statecraft | Intellect |
|---|---|---|---|---|---|---|
| 10 | 3 | 6 | 3 | 2 | 2 | 2 |

## Ruleset and persistence

The Native `rpgStats` gate is the local counterpart of `rpgStatsEnabled`.
Creation omits Stats and its saved block when disabled; Review follows Party.
Profile hides both stats and allocation controls. Commands refuse without
mutating resources or RNG. Existing stat-dependent action quotes and execution
use baseline effects, action cap 200 and bank threshold 100; Debate training is
unavailable. Re-enabling restores the saved spread and prior reset eligibility.
Playerless spectator saves show no character prompts or allocation controls,
and refuse both allocation commands, matching the source worldsim boundary.

Allocation, dismissal, reset use, XP and decay anchor cross the normal session,
worker and save boundary. Invalid saved marker types, incomplete explicitly
allocated blocks, invalid XP and malformed anchors are refused without replacing
the current session. Missing RPG flags in older saves restore the enabled default.

The historical v42 export preserves its original flag shape and golden hashes.
It omits the enabled gate and refuses RPG-off worlds because that historical
engine always applies stats. This is historical Native save compatibility;
current Client/Game SP interchange remains #122.

## Acceptance evidence

Tests use the agreed public saved-session, engine export and actual player-flow
boundaries. New allocation, ruleset and corrupt-state cases were demonstrated
failing before implementation.

| #48 criterion | Evidence |
|---|---|
| Applicable onboarding/replay prompts and saved completion/dismissal | Existing `src/game/profileOnboarding.test.ts` and `src/ui/ProfileOnboarding.test.tsx`, including real session save/reload and resolved/inapplicable prompts |
| Ruleset-gated independent stats and readable effects | `src/game/statAllocation.test.ts`, `src/ui/ProfileOnboarding.test.tsx`, RPG-off creation case in `src/ui/CharacterCreationScreen.test.tsx`, browser settings toggle and resume |
| Validated allocation/reset with reference prerequisites and costs | `src/game/statAllocation.test.ts` and `src/ui/StatAllocationFlow.test.tsx`: point validation, initial-allocation prerequisite, duplicate refusal, one free reset, XP reset, no cash/funds/AP spend |
| Saved prompts, values, eligibility and costs remain consistent | Public session reload and continued turn; integrated `smoke/stat-allocation.spec.ts` creation/reset/turn/resume plus legacy defer/resume/allocate/resume |

Reproducible focused commands:

```sh
npm test -- src/game/statAllocation.test.ts src/game/profileOnboarding.test.ts src/game/profileSession.test.ts src/game/profileValidation.test.ts --maxWorkers 1
npm run test:ui -- src/ui/StatAllocationFlow.test.tsx src/ui/ProfileOnboarding.test.tsx src/ui/CharacterCreationScreen.test.tsx --maxWorkers 1
npm run test:ci --workspace @ahdclient/engine -- src/save.v42Projection.test.ts src/featureFlagParity.test.ts src/stats/characterStats.test.ts src/stats/debatePrep.test.ts src/actions/debatePrep.test.ts --maxWorkers 1
VITE_AHD_SMOKE_FIXTURES=1 npx playwright test smoke/stat-allocation.spec.ts
```

The browser cases cover 320px, 390px and 1280px layouts, readable scrollable
dialogs, no horizontal overflow, Escape cancellation, worker-confirmed settings
and persisted reloads. The legacy browser case loads an engine-created Native
save through the normal fixture bridge; it is not a current Game SP export.

## Issue dispositions and limits

#48 is the closure target for this completed local Profile flow. #91 remains
partial: complete production stat XP producers, decay and wider action-context
parity require their own evidence. This change does not claim that every displayed
reference stat effect is consumed by every unported mechanic. MP stat APIs/profile
depth remain #510. Current Game/Client played-save interchange remains #122;
physical iOS lifecycle and performance remain their existing device gates.
No paid build or physical-device proof is part of these Linux checks.
