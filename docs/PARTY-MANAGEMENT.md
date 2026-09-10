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
- Reference: AHDGame at `e364c0495` founds parties through `src/lib/charters/draftCharter.ts` (exactly 3 unique human founder characters, proposer auto-signs, platform clamped) and `src/lib/charters/ratifyCharter.ts` (ratifies on 3-of-3 signatures). The imported engine collapses this to an immediate single-founder ratify. The action is usable but materially divergent from the reference flow.

## Blocked boundary (no platform controls)

The public `foundParty` action accepts name and abbreviation only (`ExecuteActionParams` has no platform fields; `execute.ts` forwards name plus abbreviation). Founded parties start at neutral positions (0, 0). The panel therefore offers no platform or color controls. A deeper engine change (multi-founder charters, platform params) requires a separate source-backed engine slice and is not implemented here.

## Accounting fix (done) and remaining divergence

Fixed: `executeAction` used to deduct the catalog fundCost before dispatch and `Membership.foundParty` deducted `FOUND_PARTY_FUND_COST` again, refunding one copy only on success. Entry therefore required 200k available for a 100k price. The preflight plus single-charge fix removes the double check; `FOUND_PARTY_FUNDS_REQUIRED` is back to one 100k charge and other actions are untouched.

Remaining divergence, unchanged: single-founder immediate ratify versus the reference 3-founder draft and ratify flow; no platform or color params on the public action; charter expiry fields stay null on the ratified record. None of these block the founding surface.

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

This surface completes the imported engine's founding action. The source's
three-founder charter lifecycle remains a mechanics gap and prevents a full
party-parity claim.
