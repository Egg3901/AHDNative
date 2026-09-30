# Feature flag parity audit

Issue #36 compares Native at `eb72daab63201f76674ed54dab4ff83404b9cee9`
with AHDGame at `e364c04954ed628beef73a993a8e9e156650a31e`.

Native has 26 offline phase-family kill switches and the RPG character gate.
AHDGame's live server
normally runs the full turn and most of its flags gate narrower rollouts or
policy variants. Five system gates are direct counterparts. The remaining
related names below are audit context, not aliases. Native must reject AHDGame
names if supplied in a Native save or cheat because the save schemas remain
distinct.

Every Native key defaults on. AHDGame defaults below come only from
`src/lib/seeds/reference/featureFlagDefaults.ts`. `UNVERIFIED` means that file
does not establish a fresh-world default. It is not an assertion that the
server flag is wrong or off. `eurozoneEnabled` is era-derived rather than a
fixed default.

| Native key | AHDGame counterpart | Related AHDGame controls and fresh-world defaults |
|---|---|---|
| economy | none | `macroGrowthV1` (UNVERIFIED) |
| politics | none | `nppAutonomyLevel` (v4), `nppEntryViabilityMode` (observe), `nppForeignPolicyMode` (active), `nppForeignPolicyStage` (votes) |
| elections | none | `redistrictingEnabled` (on), `liveElectionResultsEnabled` (on) |
| campaigns | none | none |
| legislation | none | `legislationDemographicEffectsV2Enabled` (on), `crisisAidBillsEnabled` (on) |
| governments | none | none |
| demographics | none | `demographicsLayer1PositionsEnabled` (on), `granularElectorateEnabled` (on) |
| budgets | none | none |
| centralBanks | none | none |
| corporations | none | `autoSectorSeedEnabled` (off), `sectorTechTreesEnabled` (on), `subsidiaryCorporationsEnabled` (on), `corpDealsEnabled` (on), `nppCorpStrategyEnabled` (on) |
| commodities | none | none |
| markets | none | `marketSystemMode` (UNVERIFIED) |
| events | none | `playerRandomEventsEnabled` (on), `worldEventsEnabled` (on), `crisisInteractionEnabled` (on), `autoDisastersEnabled` (on) |
| banking | none | `privateBankingEnabled`, `bankPropTradingEnabled`, `bankContagionEnabled` (all UNVERIFIED) |
| governors | none | none |
| unions | none | `labourSystemMode` (UNVERIFIED) |
| bonds | none | none |
| foreignExchange | `forexEnabled` | `forexEnabled` (on), `eurozoneEnabled` (era-derived) |
| commandEconomy | `commandEconomyEnabled` | `commandEconomyEnabled` (UNVERIFIED) |
| devolution | none | none |
| metrics | none | none |
| coldWar | `coldWarEnabled` | `coldWarEnabled` (on) |
| conflicts | `conflictsEnabled` | `conflictsEnabled` (on), `livingConflictsEnabled` (on), `nppOffensiveInitiationEnabled` (off), `nppOffensiveJoinEnabled` (off) |
| policyEffects | none | `legislationDemographicEffectsV2Enabled` (on) |
| extraction | none | `extractionAutoStrategyEnabled` (on), `prospectingEnabled` (UNVERIFIED), `contractIssuanceEnabled` (UNVERIFIED) |
| achievements | none | none |
| rpgStats | `rpgStatsEnabled` | `rpgStatsEnabled` (on) |

The RPG gate was added for #48 on 2026-09-30. Allocation routes, UI and seeded
default were checked at AHDGame `6ed11a3d41f6dbc82b4cb81ab9d6fc90438208b9`;
refreshing to `f77a426f769a10cae59c17511053f076dacec0a0` found no changes in
those source paths. The original audit pin above still applies to the other rows.

## Runtime contract

- `createWorld` with no override enables every Native key.
- A partial Native override changes named keys and leaves every omitted key on.
- Unknown names throw. There is no AHDGame alias table because no server flag
  alias is part of the Native save contract.
- The complete Native flag object survives save and reload.
- Disabling a family skips only phases already assigned to that family. It does
  not reorder the pipeline. Core calendar, action refresh, era crossing,
  history, and news maintenance remain unswitchable.
- `rpgStats` gates creation, Profile, allocation/reset commands, current player
  stat readers and Debate training immediately. Turning it off preserves the
  saved stat block and reset eligibility. Missing flags in older Native saves
  restore the historically enabled behavior. Historical v42 exports omit the
  enabled flag and refuse an RPG-off ruleset. See [allocation parity](STAT-ALLOCATION-PARITY.md).

The exhaustive contract test is
`packages/engine/src/featureFlagParity.test.ts`. Existing phase classification
and disabled-family execution tests remain in
`packages/engine/src/cheatsAndOverrides.sim.test.ts`.

## Sources

- AHDGame `src/lib/seeds/reference/featureFlagDefaults.ts` at the pinned SHA:
  fresh-world defaults and the deliberate off and era-derived exceptions.
- AHDGame `src/app/api/admin/feature-gates/route.ts` at the pinned SHA: admin
  boolean names and read semantics.
- AHDGame `src/simulation/phases/turnPhaseRegistry.ts` and
  `src/simulation/phases/simTurnProfiles.ts` at the pinned SHA: the live full
  turn and headless-simulation profile boundary.
- Native `packages/engine/src/featureFlags.ts`: definitions, audit map, strict
  resolver, and phase-family mapping.


## Banking policy refresh (#109, 2026-10-01)

Game `595a3b8` `banking/rules/policy.ts` establishes a different read-default
source than the original seed audit: private banking is off unless explicitly
true; prop trading and contagion are on when banking is enabled unless false.
Native retains its historically enabled `banking` family default. It now gates
bank commands and the window phase as well as banking/solvency. The optional
world-level `bankPropTradingEnabled` policy defaults on when absent and controls
interbank, margin and the prop desk independently of window servicing. It is
separate from the strict 27-key Native `featureFlags` object, so supplying server
aliases in that object still refuses. This is a save policy projection with no
new admin or player charter console. See [banking evidence](BANKING-LIFECYCLE.md).
