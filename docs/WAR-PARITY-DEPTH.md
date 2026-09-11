# War mechanics depth

Reference: AHDGame `e364c04954ed628beef73a993a8e9e156650a31e`.
Native baseline before this correction: `c0195b8`.

## Current correction: occupation mobilization

The imported control-track formula omitted the reference's early-war
mobilization ramp. `src/lib/military/occupation.ts` applies
`mobilizationFactor(currentTurn - startTurn)` to the occupation shift.
`src/lib/military/config.ts` supplies a 50-turn span and a 0.4 floor.
The reference `src/lib/turn/battleResolution.ts` passes the war age.

Native now threads `world.meta.turn - conflict.startedAtTurn` from its
`warsTurn` phase. The same formula applies:

```text
unknown or non-finite age: 1
otherwise: min(1, 0.4 + (1 - 0.4) * (max(0, age) / 50))
```

The existing positional `occupationShift` and `stepConflictControl` callers
can omit the new optional age argument and retain their prior full-factor
results. No save fields, actions, RNG calls or phase positions changed.

Source-worked example: a decisive win with a retreating loser has an
undamped shift of `5 * 0.7 = 3.5`. Starting at control 50, side B reaches
51.4 at age 0, 52.45 at age 25 and 53.5 at age 50. Negative ages use the
turn-zero floor. Unknown ages retain 53.5. The public phase test uses a
crafted decisive GDP-proxy conflict and checks those exact values, including
the clock increment before `warsTurn`. It separately confirms that the
other enabled phases have not invalidated the decisive fixture.

The age 0, 25 and negative-age cases failed before the correction. Save/load
mid-ramp then another full turn produces an identical complete serialized
world and RNG state. Exact-balance fixtures are mechanics checks, not a war
playthrough or proof of authentic combat.

## Remaining model differences

Native `packages/engine/src/wars/types.ts` explicitly marks unit combat as
unported. `wars/settlement.ts` still derives margin from coalition GDP and
uses a Native retreat threshold. Worlds start with no conflicts, and the
public action catalog has no available declaration, deployment or peace controls.
The mobilization correction does not make that proxy authoritative combat.

The current phase advances this control track, then applies simplified pole
and terms-window rules. It records a 240-turn truce date, but there is no
public declaration path enforcing that date. The current lapse result is a
`dictated` winner settlement; the reference peace-window fallback stamps
white peace as a zero-indemnity term using a `dictated` path. Negotiated terms and their downstream effects remain absent.

## Current action boundary

The catalog now names the three source-backed player verbs as unavailable:
`declareWar`, `offerPeace`, and `acceptPeace`. `executeAction` rejects each
before action-point, fund, cooldown, or save-state mutation, with a named
blocker for the missing source system. The public boundary is covered by
`packages/engine/src/actions/warActions.test.ts`.

This is deliberate. A declaration that immediately creates a war over the
GDP-margin proxy would present a player-facing shortcut as if it were the
reference's executive and legislative declaration flow. The same would be true
of accepting peace without the source offer, term-application, and truce
collections. The verbs can become available only after those source-backed
systems and the unit combat slice are ported. Until then, `advanceTurn` keeps
the existing GDP-margin behavior and does not claim combat parity.

Reference dependencies include:

| Dependency | Reference source | Native gap |
|---|---|---|
| Conflict and host model | `src/lib/db/types/conflict.ts`, `military/createConflict.ts`, `hostEntities.ts`, `conflictRegions.ts` | Non-playable hosts, extended regions, join ledgers, supply baselines and full terms records |
| Units and battle resolution | `military/combat.ts`, `battle.ts`, `battleSides.ts`, `coalition.ts`, `turn/battleResolution.ts` | Unit rosters, actual resolved margins, retreat and casualty effects |
| Supply and command | `military/occupation.ts`, `battle.ts` (`supplyState`), `readinessDrift.ts`, `doctrineTree.ts`, `generals.ts` | Logistics, readiness, doctrine, generals and command assignments |
| Air/naval and phase inputs | `src/lib/navair`, `src/simulation/phases/turnPhaseNames.ts` | Current naval/air support and correct same-turn causal order |
| Declaration and entry | `military/declareWar.ts`, `findWarBetween.ts`, `warEntryPolicy.ts`, `treatyDefence.ts` | Legislative authorization, host/pair reuse and treaty enrollment |
| Peace and consequences | `military/peaceOffer.ts`, `acceptPeace.ts`, `applyPeaceTerm.ts`, `peaceTerm.ts` | Negotiation, terms application, truce enforcement and source lapse behavior |

At enactment, the reference `declareWar` reuses an existing war between the
pair and returns `joined: true`; proposal-time duplicate rejection is a
different boundary. A future port must preserve that distinction.

## Dependency order for the next slices

1. Map the reference conflict, unit and roster fields to the offline world,
   including explicit defaults and save migration. Existing empty-conflict
   worlds and old save fields must remain intact.
2. Port independently testable combat inputs and their source fixtures:
   unit value, frontage, terrain, support, doctrine and command modifiers.
   Forecasts are display estimates and cannot stand in for battle outcomes.
3. Wire actual resolved battle outcomes, retreat and casualties through
   `advanceTurn` with source-seeded fixtures and per-phase comparisons.
   Trace supply, readiness and naval/air inputs before changing phase order.
4. Add legislative declaration and treaty entry only when the battle path
   is source-backed. Validate authorization, idempotent enactment, host reuse,
   and all truce gates through the public action/turn/save boundary.
5. Port negotiation, imposed terms, lapse outcomes and downstream effects,
   then event-driven conflicts and the player-facing war screens.

There is no approved shortcut that exposes a new declaration button over
the GDP proxy. This is a mechanics port, and full war parity remains a
release blocker.
