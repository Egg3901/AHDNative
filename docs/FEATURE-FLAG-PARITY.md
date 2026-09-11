# Feature flag parity audit

Issue #36 compares Native at `eb72daab63201f76674ed54dab4ff83404b9cee9`
with AHDGame at `e364c04954ed628beef73a993a8e9e156650a31e`.

Native's 26 flags are offline phase-family kill switches. AHDGame's live server
normally runs the full turn and most of its flags gate narrower rollouts or
policy variants. Four system gates are direct counterparts. The remaining
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

## Runtime contract

- `createWorld` with no override enables every Native key.
- A partial Native override changes named keys and leaves every omitted key on.
- Unknown names throw. There is no AHDGame alias table because no server flag
  has equivalent Native semantics.
- The complete Native flag object survives save and reload.
- Disabling a family skips only phases already assigned to that family. It does
  not reorder the pipeline. Core calendar, action refresh, era crossing,
  history, and news maintenance remain unswitchable.

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
