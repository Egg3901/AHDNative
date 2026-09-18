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

Actions use the existing public contract:

- `createCaucus`: `{ caucusName, caucusTaxRate }`, 4 AP and 25,000 funds.
- `joinCaucus`: `{ caucusId }`, 2 AP.
- `leaveCaucus`: no parameters, 1 AP.

The dispatcher previously debited 25,000 before the domain helper checked
and debited another 25,000, then refunded the first debit on success. The net
charge was correct but players needed 50,000 on hand. Preflight now runs
before shared accounting and the domain helper owns the single charge.
Funds of 25,000, 40,000 and 50,000 all succeed at the advertised price.
Insufficient funds reject without changing the serialized world. Invalid
and non-finite tax inputs also reject before mutation; previously NaN could
enter the saved caucus.

## Source evidence and remaining differences

The imported `packages/engine/src/caucus.ts` and action catalog define the
prices, 3-character minimum name, party membership and 0-5% tax range. This
slice repairs the imported cost contract; it does not certify reference costs.

AHDGame `e364c04954ed628beef73a993a8e9e156650a31e` references:

- `src/app/api/country/[code]/parties/[id]/caucuses/route.ts`: membership,
  unique slug, founding, chair record and initial tax validation.
- `.../caucuses/[slug]/members/route.ts`: membership lifecycle.
- `src/app/country/[code]/parties/[id]/components/CaucusesTab.tsx`,
  `caucus/FoundCaucusForm.tsx` and `caucus/SelectedCaucus.tsx`: visual hierarchy,
  founding form, roster and membership controls.

The pinned source founding route does not debit funds or AP. Native retains
its existing catalog charges in this bounded repair. Source names allow two
characters; Native still requires three. Source chair/vice-chair elections,
whips, color, description, motto, health and NPP recruitment remain absent
from the public Native action catalog. Native's full caucus mechanics and
source cost parity remain open.

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
rejection. `CaucusPanel` shows the tax input and Disband button only for a
caucus the player chairs. Disband mirrors the reference confirmation guard:
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

- Public engine regression: the 25k and 40k cases failed before the repair;
  all eight accounting/invalid-tax cases pass afterward. The NaN rejection
  also failed before its finite-value guard.
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
