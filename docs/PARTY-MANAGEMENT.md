# Party Management (N04)

Bounded party founding and charter surface on the existing public engine actions only. No rebalancing: the founding price stays 100k.

## What works

- `packages/engine/src/actions/execute.ts`: fixed foundParty accounting. The action preflights player-only plus `Membership.canFoundParty` before any shared mutation, skips the common catalog fund deduction for foundParty, and lets `Membership.foundParty` apply the sole 100k charge. Rejections (names, cooldown, funds) change nothing: no actions, funds, cooldown or actionCounts move.
- `packages/engine/src/actions/foundParty.test.ts` (7): public-boundary accounting on the genuine `career-elected-1953-US` fixture plus real turns. Founds inside the 100k-200k band and at exactly 100k with one 100k charge, actual action cost and exactly one success count; failures leave the world unchanged with no failed count increment.
- `src/game/partyManagement.ts`: founding eligibility (`projectPartyFounding` with `fundsRequired = 100_000` and max of catalog plus switch cooldowns), per-input world validation (`validatePartyFounding`), country charter roster (`projectPartyCharters`), combined view (`projectPartyManagement`). Display hints only; `executeAction` stays authoritative.
- `src/game/partyDraft.ts`: pure DTO-only draft validator (`validatePartyDraft`) for the React side. Type-only imports, no engine catalog, no worker queries.
- `src/ui/PartyManagementPanel.tsx`: founding form (name plus abbreviation), cost display, charter roster. Validates synchronously from the DTO; no validate callback prop.
- Proven on genuine state: the `career-elected-1953-US` fixture plus one real `advanceTurn` reaches an executable founding (fixture funds sit in the 100k-200k band), which creates the party, auto-joins the founder, records a ratified charter, and survives save/reload. Tests: `src/game/partyManagement.test.ts` (8), `src/ui/PartyManagementPanel.test.tsx` (3).

## Source evidence

- Imported engine founding: `packages/engine/src/membership.ts` (`canFoundParty`, `foundParty`, `FOUND_PARTY_FUND_COST = 100_000`, `FOUND_PARTY_ACTION_COST = 8`, `PARTY_SWITCH_COOLDOWN_TURNS = 24`, `CHARTER_DEADLINE_TURNS = 14`); catalog entry `foundParty` in `packages/engine/src/actions/catalog.ts` (8 AP, 100k funds, cooldown 0, status available); dispatch in `packages/engine/src/actions/execute.ts` (params `foundPartyName` plus `foundPartyAbbr` only).
- Reference: AHDGame at `e364c0495` founds parties through `src/lib/charters/draftCharter.ts` (exactly 3 unique human founder characters, proposer auto-signs, platform clamped) and `src/lib/charters/ratifyCharter.ts` (ratifies on 3-of-3 signatures). The public `foundParty` action keeps the immediate single-founder ratify adaptation; the engine helpers now also implement the full pending-founder lifecycle (see Charter draft lifecycle below), not yet wired to a public action.

## Blocked boundary (no platform controls)

The public `foundParty` action accepts name and abbreviation only (`ExecuteActionParams` has no platform fields; `execute.ts` forwards name plus abbreviation). Founded parties start at neutral positions (0, 0). The panel therefore offers no platform or color controls. Multi-founder charters with platform params now exist at the engine-helper level (`draftCharter` takes co-founders plus Overton axes); exposing them on the public action is the follow-up named above.

## Accounting fix (done) and remaining divergence

Fixed: `executeAction` used to deduct the catalog fundCost before dispatch and `Membership.foundParty` deducted `FOUND_PARTY_FUND_COST` again, refunding one copy only on success. Entry therefore required 200k available for a 100k price. The preflight plus single-charge fix removes the double check; `FOUND_PARTY_FUNDS_REQUIRED` is back to one 100k charge and other actions are untouched.

Remaining divergence, unchanged: single-founder immediate ratify versus the reference 3-founder draft and ratify flow; no platform or color params on the public action; charter expiry fields stay null on the ratified record. None of these block the founding surface.

## Charter draft lifecycle (engine slice, #95)

`packages/engine/src/membership.ts` now implements the pending-founder
lifecycle at the engine-helper level (no new public action yet; see follow-up
below): `canDraftCharter`/`draftCharter` (proposer auto-signs slot 0, single
100k charge at draft, `pending-signatures` with a 14-turn expiry),
`signCharter` (founder-only, idempotent repeat, 3-of-3 auto-ratifies with
platform axes converted /12 to party positions, charges nothing),
`rejectCharter` (unsigned founder only, enters `founder-replacement` with a
fresh 14-turn deadline), and inline fail-closed expiry mirroring the existing
`expireCharters` phase. Both `canFoundParty` and the draft path now reserve
proposed names/abbreviations against live parties AND in-flight charters
(reference F3). Ratification seats the player as first chair and moves all
three founders into the new party. Tests:
`packages/engine/src/charterLifecycle.test.ts` (13): draft success and
validation (counts, duplicates, unknown/foreign founders, taken names, funds),
full 3-of-3 ratification with converted positions and no second charge,
rejection and replacement-window expiry, draft expiry and late-signature
refusal, pending and ratified save/reload, and cross-seed determinism.

Explicit SP adaptations (no network, no fake invitations): co-founder slots
are same-country NPC politicians instead of human characters (no userId
ownership check); home-state adjacency, founding-cohort picks, NPP cohort
spawn, state-org provisioning, leadership-election bootstrap, and
notifications are not ported. The `foundParty` immediate path is unchanged.

Follow-up (issue stays open): public `executeAction` wiring for
draft/sign/reject plus UI (#59/#60, coordinated with #61 charge projection),
founder-replacement flow, and the unported ratification side effects above.

## Integrated player flow

The grouped Nation menu and Parties page open the founding form. The optional
`GameSession.partyManagement` query runs in the worker; typing validates the
detached roster locally. A successful action refreshes party membership,
resources and the charter list, then autosaves through the normal app flow.
No full WorldState is sent to React.

The session contract test loads the genuine elected save, advances once,
founds in the 100k-200k band, verifies the single charge and detached query,
then reloads and finds the new party through local search. The browser smoke
uses the same real save and checks founding, disabled repeat submission,
ratified charter, turn 99, app reload and persisted membership. Accounting
edge tests additionally set exact balances for boundary conditions; these are
not career playthrough evidence.

This surface completes the imported engine's founding action. The
three-founder charter lifecycle now exists at the engine-helper level (see
above); public-action wiring, founder replacement, and the unported
ratification side effects remain gaps and prevent a full party-parity claim.
