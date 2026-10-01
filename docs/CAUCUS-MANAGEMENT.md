# Caucus management

The mobile Nation menu and Parties page open a party-scoped caucus roster.
Players can found a named caucus with a 0-5% tax, leave, and join another
active caucus in their party. Membership, treasury, tax and resolved member
names come from the real world. Successful actions refresh the query and use
the normal autosave path.

## Contract and accounting

`GameSession.caucusManagement()` returns a detached `CaucusManagementView`
through the worker. The query is requested only while its screen is visible.
`CaucusPanel` uses a type-only DTO import and `validateCaucusDraft`; no engine
runtime or per-keystroke worker requests enter React.

Actions use the existing public contract. Create, join, leave, tax-edit and
disband all charge 0 AP and 0 campaign funds, matching the source Game routes
at `954f1c21781e6e767455a15eed40f73993d89a8b` (empty diff vs `2480b4db`):

- `createCaucus`: `{ caucusName, caucusTaxRate }`. Source POST
  `src/app/api/country/[code]/parties/[id]/caucuses/route.ts` writes the
  caucus, chair membership and faction pointer with no personal debit.
- `joinCaucus`: `{ caucusId }`. Source POST
  `.../caucuses/[slug]/members/route.ts` writes membership and `factionId`
  with no debit. Join has no confirmation dialog.
- `leaveCaucus`: no parameters. Source DELETE
  `.../members/[memberId]/route.ts` closes membership with no debit. The
  recorded chair cannot self-leave (403: disband or hand over first). Native
  leave confirms with `Leave ${name}?`, matching
  `SelectedCaucus.tsx`.
- `setCaucusTaxRate`: `{ caucusId, caucusTaxRate }`. Source PATCH
  `.../caucuses/[slug]/route.ts` writes `taxRate` with no debit. Authority is
  the recorded `chairId`, never `memberIds[0]`.
- `disbandCaucus`: `{ caucusId }`. Source DELETE
  `.../caucuses/[slug]/route.ts` soft-disbands, clears memberships and
  vacates seats with no debit. Same `chairId` gate.

`quotePartyCaucusAction` is the one charge-plus-consequence projection the
dispatcher, session DTO and panel confirmation read. A declined or ineligible
action leaves the full serialized world unchanged. Invalid and non-finite tax
inputs reject before mutation.

Native `foundParty` stays the immediate single-founder / NPP cofounder proxy
at 8 AP + 100,000 funds. Source `draftCharter` / `ratifyCharter` is free but
requires 3 eligible human cofounders, a 14-turn expiry and adjacency/Overton
gates; that public draft action is not wired (#95). This slice does not
replace that gap with cheap immediate-party creation.

## Source evidence and remaining differences

Authority for this cost/quote slice is AHDGame
`954f1c21781e6e767455a15eed40f73993d89a8b`. A refresh through
`2480b4db3cde3a6210000833d88f0b53e7f07917` found no changes in these routes.
Native prices live in `packages/engine/src/actions/partyCaucusCosts.ts` and
are the only numbers the catalog, domain helpers and UI quote.

Source routes read for this slice:

- POST `src/app/api/country/[code]/parties/[id]/caucuses/route.ts`
- POST `src/app/api/country/[code]/parties/[id]/caucuses/[slug]/members/route.ts`
- DELETE `src/app/api/country/[code]/parties/[id]/caucuses/[slug]/members/[memberId]/route.ts`
- PATCH and DELETE `src/app/api/country/[code]/parties/[id]/caucuses/[slug]/route.ts`
- POST `src/app/api/country/[code]/parties/[id]/leave/route.ts` (clears caucus
  membership and may vacate chair/vice-chair; no personal debit)
- `src/app/country/[code]/parties/[id]/components/caucus/SelectedCaucus.tsx`
  (join has no confirm; leave confirms `Leave ${name}?`; disband confirms)

Delivered on #61 (partial): source-free create/join/leave; unified
create/join/leave/tax/disband quote through dispatcher, session projection
and UI confirmation; chair tax/disband authority on recorded `chairId`;
chair self-leave refusal; declined actions leave serialized state unchanged.

Still open on #61/#95: source charter draft/ratify as a public action (3
human cofounders, 14-turn expiry, adjacency/Overton). Native `foundParty`
remains the 8 AP + 100k immediate/NPP proxy and is not claimed as that gate.
Source names allow two characters; Native still requires three. Source
chair/vice-chair elections, whip, color, description, motto, health and NPP
recruitment remain absent from the public Native action catalog (#60
remainder). Do not treat this slice as closing #61 or #95.

## Chair controls (#60)

`setCaucusTaxRate` (`{ caucusId, caucusTaxRate }`) and `disbandCaucus`
(`{ caucusId }`) are now public, chair-only catalog actions. Both port
`src/app/api/country/[code]/parties/[id]/caucuses/[slug]/route.ts`: the PATCH
handles the 0-5 tax edit and the DELETE soft-disbands, and neither charges
action points or funds, so both catalog entries are `baseCost: 0`,
`fundCost: 0`. The engine helper now checks the chair seat (`caucus.chairId ===
"player"`), where the earlier helper allowed any member. Disband stamps
`caucus.disbandedAt`, empties the inline `memberIds`, vacates the chair seats
and clears the player's `caucusId`; the disbanded row is excluded from the tax
phase and from the roster, mirroring the reference's soft-delete and
membership-removal sweep.

`projectCaucusRoster` exposes `isPlayerChair`, `chairName`, `setTax` and
`disband`, each quoting the engine's own `canSetCaucusTaxRate` /
`canDisbandCaucus` verdict so a disabled reason matches the dispatcher's
rejection. Both engine checks now also require active affiliation (the
player's membership pointer plus roster entry): a bare `chairId` left behind
by a sweep or legacy save cannot tax or disband a caucus the player no longer
belongs to, and the projection quotes that verdict unchanged. `CaucusPanel`
shows the tax input and Disband button only for a caucus the player chairs.
Disband mirrors the reference confirmation guard:
`SelectedCaucus.tsx` calls `confirm` with the caucus name and total membership
count before issuing DELETE, so the panel warns with the caucus name and
projected member count and only dispatches on acceptance. Color, description,
motto, whip and chair elections remain open.

## Recorded roster/role/health slice (#60)

`projectCaucusRoster` now exposes the seats already present in the save, read
only: `chairName`/`chairState`, `viceChairName`/`viceChairState` and
`playerRole` (`chair`, `vice-chair`, `member`, `non-member`). A null seat
reads `vacant` (leave/disband vacated it); an absent seat (legacy saves never
stored `chairId`/`viceChairId`) or an id that resolves to no one reads
`unknown`, never a fabricated occupant. `CaucusPanel` renders one compact
seat/role line per caucus plus a roster note that health, whip, recruitment
and elections are not recorded in this save. No recruitment, elections, health
formulas or network actions were added: the persisted `Caucus` carries no
health fields, and there is still no public engine action to recruit, elect a
chair/vice-chair, set a whip, rename or edit color/description/motto. Chair
only tax-edit and disband behavior is unchanged.

Evidence: six scenarios in `src/game/caucusRosterState.test.ts` cover
populated seats, non-member role, legacy-missing and unresolvable seats,
save/reload plus next-turn stability (a same-party vice-chair with a recorded
NPP relationship survives the retention phase; a relationship-less NPC is
correctly dissolved by `nppRelationshipMaintenance`) and disbanded-state
stability. Three `src/ui/CaucusPanel.test.tsx` scenarios cover the recorded
role line with chair controls still present, the unknown copy and the
unrecorded-fields note. Commands: `npm test --
src/game/caucusRosterState.test.ts`, `npm run test:ui --
src/ui/CaucusPanel.test.tsx`.

## Evidence

- #61 cost/quote slice: `src/game/partyCaucusSourceParity.test.ts` covers
  free join, free non-chair leave with declined tax leaving the save
  byte-identical, chair tax/disband quoted and executed through the shared
  projection, and tax/disband refused when `chairId` is null even if
  `memberIds[0]` is the player. Original four GameSession/save tests remain.
  `src/game/caucusManagement.test.ts` and `packages/engine/src/actions/{partyCaucus,createCaucus,caucusChairActions}.test.ts`
  cover dispatcher charge, session projection and atomic refusals.
  `src/ui/CaucusPanel.test.tsx` covers Free create, 0-cost join/leave, leave
  confirm `Leave ${name}?` and cancel.
- Historical double-debit repair: the 25k and 40k cases failed before the
  earlier accounting fix; those prices are now 0. The NaN rejection also
  failed before its finite-value guard.
- Eight query/action/session scenarios and four component tests cover
  membership, tax, cross-party rejection, cost display and saved state.
- The genuine elected 1953 US fixture advances once to turn 99, founds Blue
  Dog Caucus, leaves, rejoins and reloads with membership and tax intact.
  That fixture is not rewritten. Exact-balance tests are separate accounting
  fixtures and are not presented as career-playthrough evidence.
- Chair controls (#60): nine engine scenarios in
  `packages/engine/src/actions/caucusChairActions.test.ts` cover chair-only tax
  edit, disband, non-chair rejection, out-of-range/invalid tax, missing
  caucusId, no AP/fund charge, save/reload and a turn after disband. Three
  game-layer scenarios in `src/game/caucusManagement.test.ts` cover the DTO
  chair flags and the session act/save boundary; six panel scenarios in
  `src/ui/CaucusPanel.test.tsx` cover chair dispatch, non-chair hiding, the
  disband warning text, cancellation not dispatching and acceptance
  dispatching exactly once.
- The integrated browser scenario `smoke/caucuses.spec.ts` now also founds a
  caucus, edits the tax to 4.5%, reloads to confirm it persisted, disbands, and
  relaunches to confirm the disbanded state survives. The genuine elected 1953
  US fixture is not rewritten.
- Commands: `npm test -- src/game/caucusManagement.test.ts`,
  `npm run test:ui -- src/ui/CaucusPanel.test.tsx`, and
  `npm exec --workspace @ahdclient/engine -- vitest run src/actions/caucusChairActions.test.ts --maxWorkers 1`.
