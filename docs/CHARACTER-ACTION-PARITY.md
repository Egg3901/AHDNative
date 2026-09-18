# Character action parity - ActionsHub catalogue vs AHDGame

Static source audit for [#91](https://github.com/Egg3901/AHDNative/issues/91).
Read-only. No runtime, schema, save, formula or test change accompanies this
document. It records what is ported, what is only a helper, and what is wrong
or blocked before any formula is changed.

## Scope boundary (explicit)

"Character actions" here means **exactly the 11 entries in the ActionsHub
catalogue** declared at `src/game/session.ts:38-50` (the `ACTIONS` array):

`campaign`, `advertise`, `canvass`, `joinParty`, `leaveParty`, `fundraise`,
`buildDonorBase`, `convertCash`, `poll`, `pollLarge`, `debatePrep`.

Explicitly **out of scope** for this audit: bonds, markets (shares/order flow),
legislation (sponsor/vote/repeal/filibuster), campaign-management verbs
(`campaignUpgrade`/`Rally`/`RallyTour`/`Retarget`/`Manager`/`campaignCanvass`/
`TargetedAd`/`Contribute`), caucus management, referendums, candidacy,
head-of-state fiscal levers, savings/wire transfer, wars, and the full action
catalog (`packages/engine/src/actions/catalog.ts` has 60+ ids). Those are
tracked by other issues and are not audited or changed here.

## Revisions pinned

| Role | Revision | Notes |
| --- | --- | --- |
| Native baseline (this worktree) | `cd99794f5917935ca706fde803a42aeab93baa77` | branch `issue-91-action-parity-audit`. Audit read at this commit; the doc itself is the only change. |
| AHDGame authority | `e364c04954ed628beef73a993a8e9e156650a31e` | `src/lib/actions.ts`, `src/lib/actions/commands/executeAction.ts`, `src/lib/db/types/gameState.ts`, `src/app/actions/actionsConstants.ts`, `src/app/api/canvassing/route.ts`, party join/leave routes. |
| Shared Fundraise source | `d4baf899fd8bd529099f03d7410807143604e2e5` | `packages/game-rules/provenance.json`; the only action formula currently shared rather than re-implemented. |

Paths below are repo-relative at those revisions. This is not runtime or
differential evidence; see [MECHANICS-PARITY.md](MECHANICS-PARITY.md) for why a
static audit cannot establish parity.

## Money model: personal funds vs campaign funds

Two distinct player balances, never to be conflated:

- **PlayerCharacter personal cash** - `player.cash`, "personal cash on hand,
  local currency" (`packages/engine/src/types.ts:600-608`, `:696`). In AHDGame
  this is `currencyBalances.personal[homeCurrency]` with a legacy
  `cashOnHand` fallback; savings sit behind it and must be withdrawn first.
- **Campaign funds** - `player.funds`, "Campaign funds (local) for player"
  (`packages/engine/src/types.ts:703-704`). AHDGame stores
  `currencyBalances.campaign` (or legacy `funds`), in **local** currency, and
  campaign funds are deliberately decoupled from live forex.

`convertCash` is the only audited action that moves money from personal cash
into campaign funds. Fundraise/campaign/advertise/poll/buildDonorBase all debit
or credit **campaign funds**. Native already mirrors this split in
`packages/engine/src/actions/execute.ts:453-460` (cash down, funds up) and in
the session diff fields (`src/game/session.ts:299-304`).

**Frozen campaign currency semantics.** AHDGame converts action
`effect.fundsChange` (anchor units) to local at the persistence boundary using
the **frozen** world base rate, never live forex:
`src/lib/actions/commands/executeAction.ts:242-250` uses
`campaignRate`/`campaignLocalRate`; the formatter comment at `:130-133` is
explicit that campaign funds never surface anchor. Native has the ported helper
`campaignAnchorToLocal`/`campaignLocalRate`
(`packages/engine/src/campaigns/campaignCurrency.ts:41-45`, frozen INITIAL_RATES
table) but **none of the 11 hub actions call it** - they debit/credit
`player.funds` as if it were already anchor. For a non-US country the credited
local amount therefore diverges from the reference. This is a live gap, not a
helper shortage.

## RPG stat inputs (reference)

The reference applies `statMultiplier` (gentle ±20%):
`packages/game-rules/stats/statMultiplier.ts:14-16`,
`1 + (clamp(stat,1,10) - 5.5) * 0.04` → stat 1 = 0.82x, 5-6 = ~1.0x,
10 = 1.18x. Per-action stat wiring at `e364c049`:

| Action | Stat(s) | Where in reference |
| --- | --- | --- |
| campaign | charisma (gain), intellect (cost) | `src/lib/actions.ts:406,410-413` |
| advertise | charisma (gain) | `src/lib/actions.ts:432-433` |
| fundraise | fundraising (yield) | `src/lib/actions.ts:108-113` |
| buildDonorBase | fundraising (cost discount) | `src/lib/actions.ts:468` |
| poll / pollLarge | intellect (cost) | `src/lib/actions.ts:488,506` |
| convertCash | none | `src/lib/actions.ts:522-537` |
| canvass / joinParty / leaveParty | none | route-level, see per-action rows |
| debatePrep | writes debate | `src/lib/actions.ts:554-567` |

Native's player supports only `stats.energy?` and `stats.debate?`
(`packages/engine/src/types.ts:715-720`); charisma, fundraising, intellect and
the rest do not exist as player state and there is no allocation UI. Therefore
**no multiplier can be applied without inventing state**, and unsupported RPG
fields must stay unavailable (issue acceptance criterion 2). The only present
stat multiplier in Native is the shared `fundraiseYieldAnchor`, which uses the
neutral fallback because `player.stats.fundraising` is undefined.

## Per-action parity table

Columns: Native AP / Native cost & yield / Native state inputs & results /
AHDGame reference AP / reference cost & yield / RPG stat inputs / currency
semantics / status & blocker. "AP" is action points.

### 1. `campaign`

| Field | Native (`cd99794`) | AHDGame (`e364c049`) |
| --- | --- | --- |
| AP | dynamic `campaignActionCost(politicalInfluence)`: 1 at <20, 2 at >=20, 3 at >=40, 4 at >=60, 5 at >=80 (`catalog.ts:137-144,201`) | `getCampaignActionCost` identical tiers (`actions.ts:150-157`) |
| Monetary | fundCost 20,000 base; `execute.ts:314-319` computes `round(20_000 * tier * mult / 1000)*1000`, `mult = 1 + (tier-1)*0.2`, **gdpScalar collapsed to 1.0**; session quote duplicates this in `src/game/session.ts:57-60` | `getCampaignFundCost = round(20000*tier*getFundMultiplier(tier-1, state.gdp, state.population, countryId))`; `getFundMultiplier = (1+tier*0.2)*clamp(gdpPerCapita/baseline, 0.85, 2.0)` (`actions.ts:164-173,245-255`) |
| State in/out | reads `player.politicalInfluence`, `player.funds`; result `politicalInfluence += max(0.1, 1 - (cur-50)/75)` (`execute.ts:422-440`) | `campaignInfluenceGain` same curve, then charisma scales it (`actions.ts:358-364,410-413`) |
| RPG | none applied | charisma (gain), intellect (cost) |
| Currency | none; debits `player.funds` direct | anchor effect -> frozen `campaignRate` at boundary |
| Status | **partial** | - |

Blocker: gdpScalar, intellect cost discount, charisma gain and frozen-currency conversion are all missing. AP tier and base gain curve match.

### 2. `advertise`

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | `advertiseActionCost(favorability)`: 5/6/7/8/9 by >=0/30/50/70/85 (`favorability.ts:42-53`, `catalog.ts:212`) | `getAdvertiseActionCost` identical (`actions.ts:213-220`) |
| Monetary | fundCost 100,000; `execute.ts:320-324` `round(100_000*(1+tierIdx*0.2)/1000)*1000`, gdpScalar 1.0; session quote `src/game/session.ts:61-64` | `getAdvertiseFundCost = round(100000*getFundMultiplier(tier, state.gdp, state.population, countryId))` (`actions.ts:179-188`) |
| State in/out | reads `player.favorability`; result `+= max(1, floor(3 - (cur>70 ? (cur-70)*0.1 : 0)))` (`execute.ts:441-448`) | `advertiseFavorabilityGain` same base/floor, charisma multiplier (`actions.ts:264-271,432-433`) |
| RPG | none | charisma |
| Currency | direct `player.funds` | frozen `campaignRate` |
| Status | **partial** | - |

Blocker: gdpScalar, charisma and currency missing; tier/AP/base gain match.

### 3. `canvass` (hub entry "Canvass Voters")

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | flat 3 (`catalog.ts:282`) | `COST_ACTIONS = 1` (`src/app/api/canvassing/route.ts:36`); hub card actionCost 1 (`actionsConstants.ts:138`) |
| Monetary | flat 15,000 campaign funds (`catalog.ts:283`) | `COST_FUNDS = 100` anchor (`canvassing/route.ts:35`); card fundCost 100 (`actionsConstants.ts:139`) |
| State in/out | requires `regionId`; mutates `regionTurnouts[regionId].modifiers` with a fixed `(15_000/DOLLARS_PER_TURNOUT_POINT)*alignment` boost (`execute.ts:343,488-507`) | demographic-targeted turnout boost via `/actions/canvass` -> `/api/canvassing`, 2x in the final four turns (`actionsConstants.ts:141`) |
| RPG | none | none (uses policy axis ideology-fit targeting) |
| Currency | none | anchor cost -> frozen `campaignLocalRate` (`canvassing/route.ts:142-143,235-243`) |
| Status | **divergent / wrong values** | - |

Blocker: the ActionsHub `canvass` verb is a neutral proxy, not a port. The real
ported reference logic exists at `packages/engine/src/actions/campaignCanvass.ts`
(1 action, 100 campaign funds, ideology-fit turnout modifier, closing-window 2x)
and **is wired** - but only through the campaign-management panel
(`src/game/politics.ts:694-723,952`, `PoliticsPanel`), not through the
ActionsHub `canvass` entry. Two problems: the hub entry's 3 AP/15k are invented,
and the correct helper is reachable from a different surface. Not changed here.

### 4. `joinParty`

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | 2 (`partyCaucusCosts.ts:21`, `catalog.ts:324`) | not an AP-priced action; no ActionsHub card |
| Monetary | 0 | 0 |
| State in/out | `membership.joinParty`; 24-turn switch cooldown (`membership.ts:17,89-90`) | `src/app/api/country/[code]/parties/[id]/join/route.ts`: 24h switch cooldown, free-move/admin bypass, no AP charge |
| RPG | none | none |
| Currency | none | none |
| Status | **unverified / Native-only pricing** | - |

Blocker: AHDGame has no `joinParty` `ActionType` (`gameState.ts:706-715` lists
only 9) and no hub card; joining is an API route. Native's 2 AP is its own
action-economy decision, not a reference value, and is not flagged as such in
the catalog the way `declareCandidacy` is (`catalog.ts:461-463`). Reference
cooldown is wall-clock 24h; Native uses 24 turns. Needs an explicit
Native-convention note or alignment decision, not a formula port.

### 5. `leaveParty`

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | 1 (`partyCaucusCosts.ts:23`, `catalog.ts:333`) | not AP-priced |
| Monetary | 0 | 0 |
| State in/out | `membership.leaveParty`; ends caucus membership and conflicting endorsements | `src/app/api/country/[code]/parties/[id]/leave/route.ts`: clears membership/caucus, join-cooldown anchor retained |
| RPG | none | none |
| Currency | none | none |
| Status | **unverified / Native-only pricing** | - |

Blocker: same class as `joinParty`. AP is Native-invented.

### 6. `fundraise`

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | 3 shared (`FUNDRAISE_ACTION_COST` from `@ahd/game-rules/actions`, `catalog.ts:184`) | `FUNDRAISE_ACTION_COST = 3` (`packages/game-rules/actions/rules.ts`) |
| Monetary yield | `fundraiseYield` -> `fundraiseYieldAnchor({donorBaseLevel, politicalInfluence})` with **neutral stat** (`fundGeneration.ts:96-98`) | `fundraiseYieldAnchor` with `stats.fundraising` multiplier; then frozen anchor->local (`actions.ts:108-133`) |
| State in/out | requires donorBaseLevel != 0; `player.funds += yield` (`execute.ts:335-337,417-421`) | same eligibility (`isFundraiseEligible`), funds credit at frozen rate |
| RPG | not applied | fundraising |
| Currency | direct `player.funds`, no conversion | frozen `campaignRate` |
| Status | **partial (shared source)** | - |

Blocker: AP, donor eligibility and anchor-yield source are shared and tested
([SHARED-RULES.md](SHARED-RULES.md)); fundraising stat multiplier and frozen
currency context remain missing. This is the one action with a generated,
immutable formula package. Tracked open in #91.

### 7. `buildDonorBase` (hub "Build Donor Network")

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | `donorActionCost`: `min(20, round(4 + (lvl/75)^1.4*16))` (`catalog.ts:146-149,223`) | `getDonorActionCost` identical (`actions.ts:231-237`) |
| Monetary | fundCost 3,000 base; `execute.ts:325-327` `round((3000 + lvl*1500)/1000)*1000`, **gdpScalar 1.0** | `getBuildDonorBaseFundCost = round((3000+lvl*1500)*clamp(gdpPerCapita/baseline,0.85,2.0)/1000)*1000`, then divided by fundraising statMultiplier (`actions.ts:196-207,468`) |
| State in/out | `player.donorBaseLevel += 1` (`execute.ts:449-452`) | same (`actions.ts:451-477`) |
| RPG | none | fundraising (discounts cost, and drives use-growth) |
| Currency | direct `player.funds` | frozen `campaignRate` |
| Status | **partial** | - |

Blocker: gdpScalar, fundraising discount and currency missing; AP curve and base formula match. Native card copy/static baseCost 6 is a stale UI label the dynamic helper overrides, same as reference (`actions.ts:455`).

### 8. `convertCash` (hub "Personal Campaign Donation")

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | 2 (`catalog.ts:251`) | baseCost 2 (`actions.ts:520`) |
| Monetary | `amount` from params/cash; personal `cash -= amount`, campaign `funds += floor(amount*0.5)`, `infamy += min(100, round(15*(amount/1e6)^0.564))` (`execute.ts:453-460`) | same 50% conversion and `calculateConvertCashInfamy` (`actions.ts:80-84,528-529`; `executeAction.ts:224-234`) |
| State in/out | requires `actor.cash >= amount`; personal-vs-campaign split explicit | same; reads `currencyBalances.personal[home]` with `cashOnHand` fallback |
| RPG | none | none |
| Currency | single `cash`/`funds`, no per-currency wallet; funds credit not converted | personal local debit; funds credit pre-divided so frozen `campaignRate` round-trips |
| Status | **formula aligned, currency context missing** | - |

Blocker: conversion rate, rounding and infamy curve match. The per-currency
wallet and frozen-rate round-trip do not; Native's single-currency projection is
a disclosed simplification (same class as savings). Distinguish personal cash
(input) from campaign funds (output) when comparing.

### 9. `poll` (hub "Quick Poll")

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | 2 (`catalog.ts:230`) | baseCost 2 (`actions.ts:484`) |
| Monetary | flat 25,000 (`catalog.ts:231`) | `round(25_000 / statMultiplier(intellect))` (`actions.ts:486-488`) |
| State in/out | **unavailable**: `status: "unavailable"`, blockingSystem `polling/election polling` (`catalog.ts:232-235`); `execute.ts:273-275` rejects | available; produces topline + best/worst group result via `/api/actions/poll` |
| RPG | none | intellect |
| Currency | none | frozen `campaignRate` |
| Status | **blocked, honestly surfaced** | - |

Blocker: the result substrate (polling breakdown) is not ported. Native correctly
keeps it unavailable with a named reason; AP and base fund cost match but
intellect and the poll output do not exist. Tracked by the polling issue
referenced in the hub docstring (`session.ts:30-37`).

### 10. `pollLarge` (hub "Full Demographic Poll")

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | 6 (`catalog.ts:242`) | baseCost 6 (`actions.ts:502`) |
| Monetary | flat 75,000 (`catalog.ts:243`) | `round(75_000 / statMultiplier(intellect))` (`actions.ts:504-506`) |
| State in/out | unavailable, same blockingSystem (`catalog.ts:244-245`) | available; full demographic breakdown |
| RPG | none | intellect |
| Currency | none | frozen `campaignRate` |
| Status | **blocked, honestly surfaced** | - |

Blocker: same as `poll`; full breakdown substrate absent.

### 11. `debatePrep`

| Field | Native | AHDGame |
| --- | --- | --- |
| AP | 1 (`DEBATE_PREP_ACTION_COST`, `catalog.ts:271`) | 1 (`game-rules/stats/statsConstants.ts:96`) |
| Monetary | 0 | 0 |
| State in/out | requires allocated `player.stats.debate`; `rollDebatePrep` 15% -> `stats.debate +1` capped 10; deterministic via `world.meta.rng` (`execute.ts:390-395,465-487`; `debatePrep.ts:17-33`) | same coded 15% (`executeAction.ts:197-215`), writes `stats.debate` |
| RPG | debate only | debate; gated behind RPG-stats flag |
| Currency | none | none |
| Status | **ported at coded values** | - |

Note: reference hub copy says "10%" (`actionsConstants.ts:170`) while the coded
chance is 15%; Native states the coded 15% (`catalog.ts:270`). The session
outcome history records the AP debit and the Debate before/after (`session.ts`
`snapshotActionFields`, Intelligence hub card + recent-outcomes list). Remaining
gaps: Debate decay/practice rolls and full stat allocation (see
[ENGINE-ADAPTATIONS.md](ENGINE-ADAPTATIONS.md)).

## Existing helper presence vs actual wiring

A helper existing in the engine does not mean the hub action uses it. Current
dispositions:

| Helper | Present at | Wired to the ActionsHub entry? |
| --- | --- | --- |
| `fundraiseYieldAnchor` (shared) | `packages/game-rules/actions/rules.ts` | yes (`fundGeneration.ts:96-98`) |
| `advertiseActionCost` | `packages/engine/src/actions/favorability.ts:51` | yes (`catalog.ts:212`) |
| `rollDebatePrep` | `packages/engine/src/stats/debatePrep.ts:30` | yes (`execute.ts:480`) |
| `campaignActionCost` / `donorActionCost` | `catalog.ts:137-149` | yes |
| `campaignCanvass` | `packages/engine/src/actions/campaignCanvass.ts:42` | **no** - reachable only via `politics.ts:694-723` campaign management |
| `campaignAnchorToLocal` / `campaignLocalRate` | `packages/engine/src/campaigns/campaignCurrency.ts:41-45` | **no** for all 11 hub actions (used by campaign-upgrade only) |
| `statMultiplier` | `packages/game-rules/stats/statMultiplier.ts` | **no** - no player stat state to feed it |

## Summary

- AP tiers and the base gain/conversion curves for campaign, advertise,
  buildDonorBase, fundraise and convertCash already match the reference.
- The dominant cross-cutting gaps are: **gdpScalar** (reference clamps
  GDP-per-capita against a country baseline, 0.85-2.0; Native hardcodes 1.0),
  **RPG stat multipliers** (charisma/intellect/fundraising absent from Native
  player state), and **frozen campaign-currency conversion** (helper exists,
  unwired).
- `canvass` is the worst case: a neutral proxy under a reference label, with
  the correct port living on a different surface.
- `joinParty`/`leaveParty` carry Native-invented AP and turn-based cooldowns
  against a reference that prices neither in AP and uses wall-clock time.
- `poll`/`pollLarge` are correctly unavailable with named blockers.
- `debatePrep` is ported at coded values.

No formulas were changed. This satisfies #91 acceptance criterion 1 (the
per-action table). Criteria 2-4 (port only field-backed multipliers, atomic AP
and funds, and createWorld/executeAction/save/reload/turn verification) remain
open, as do the RPG and currency contexts.

Related: [MECHANICS-PARITY.md](MECHANICS-PARITY.md), [SHARED-RULES.md](SHARED-RULES.md),
[ENGINE-ADAPTATIONS.md](ENGINE-ADAPTATIONS.md), [ROADMAP.md](ROADMAP.md) M07.
