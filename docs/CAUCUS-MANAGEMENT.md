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
whips, color, description, motto, health, disbanding, NPP recruitment and
post-create tax editing are absent from the public Native action catalog.
The helper-only tax setter is not exposed as an invented action. Native's
full caucus mechanics and source cost parity remain open.

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
- Commands: `npm test -- src/game/caucusManagement.test.ts`,
  `npm run test:ui -- src/ui/CaucusPanel.test.tsx`, and
  `npm exec --workspace @ahdclient/engine -- vitest run src/actions/createCaucus.test.ts --maxWorkers 1`.
  The integrated browser scenario is `smoke/caucuses.spec.ts`.
