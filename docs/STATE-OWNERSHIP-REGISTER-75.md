# State ownership register and executive cash settlement

Partial #75. Reference only #298, #211, #510 and #122. The complete original
nationalization, command-economy and court scope remains open.

The current Game National Budget treasury link opens the country's primary
National Corporation with its Register tab selected. `state-ownership/page.tsx`
falls back to an existing state issuer; its ledger is country-wide. Native
preserves that budget entry, company hero and actual Register/Overview selection
using its existing company detail. Native represents national issuers per sector,
so the register resolves the first recorded issuer and aggregates the country's
action history across issuers. Holding links open real company data, with Back
restoring Register and then National Budget. Plain state-owned company visits
also expose Register; private corporations do not.

An actual supported executive distress seizure now records source acquisition
identity, country, issuer, firm, sectors, trigger, method, tier, turn, compensation,
unmatured assumed bond principal and shareholder count. The register shows real
totals and current holdings. It performs no turn, RNG draw or save mutation.

The source `ownershipTransition.ts` also distributes the dissolved shell's cash.
A seizure pays no compensation or CEO surplus: positive cash goes to the national
treasury. A new National Corporation starts with zero cash; an existing issuer
keeps its own cash. Native now preserves this cash settlement for both taking
paths rather than leaving or destroying donor cash. Native's supported taking
is domestic, with corporate cash and treasury in the same home currency.
Missing national treasury refuses before mutation. Broader compensation and
foreign-owner paths remain unfinished.

Independent execution uses actual Game `registerView.ts`, `bondPrincipalSum.ts`
and `treasury.ts`, pinned at `96831835fb6b28983aa14fe66cb6eae9ecfde84c` and
checked unchanged against canonical main
`cb66acdf0129616b8a09902727e9b58715c8bacb`. Its seizure vector has zero
compensation rendered as absent, one firm, two shareholders and debt 12,500.
The bond calculator converts USD 10,000 at rate 1 plus EUR 5,000 at rate 2 to
anchor 12,500. Native's public action fixture uses two home-currency bonds
totaling 12,500, with matured principal excluded. The actual treasury helper
credits 12,346 local units for 12,345.6 and changes only treasuryBalance, without
changing bond principal. The existing Game seizure orchestration test timed out at both 15 and
60 seconds during this run; it is not passing evidence. The direct treasury
helper and register/bond vectors passed independently. No live database or
whole production turn was used.

Public boundaries: `src/game/stateOwnership75.test.ts` covers real public taking,
source treasury settlement, repeated taking into an existing issuer, country
isolation, newest-first history, ordinary turn, save/reload and query immutability.
`src/ui/StateOwnership75.test.tsx` covers the real budget entry, company/Register
context, source action fields and company/register/budget return. Tests failed
first at the missing query, missing budget link, missing Register context,
missing rendered Back and incorrect treasury settlement, then passed after their
corrections. `save.stateOwnership.test.ts` covers four public save checks.

Schema 52 is the first reader that records new ownership actions. Older saves
retain absent history rather than reconstructing past events. Malformed,
unsupported, duplicate and wrong-country records reject before continuation.
Current and authentic 42-label exports refuse any present ledger, including an
explicit empty one. The actual prior Native reader at accepted `1fe80981` loads
its 51 save but rejects the 52 continuation with `schema 52 > 51`; the current
reader migrates 51 while preserving absent history. This is a Native boundary,
not current Client/Game save interchange.

Still required for #75: full register political standing, acquisition political
effects, concentration/confidence and assumed-bond surfaces; nationalization hub,
source ownership triggers and 72-turn player financial-distress grace,
notice/cure/compensation paths; privatization auctions and settlement; complete
national planning/state-enterprise/Gosbank dashboard; special-court journeys and
country/role gating. The delivered ledger and routes do not close those groups.
Physical-device, complete MP gameplay and current Client interchange remain open.

Focused checks on this slice passed: two public session cases, four engine save
cases, and seven UI cases including the existing company-to-region flow. The
actual browser worker action, Register entry, company/Back, ordinary turn and
two normal save/relaunch flows passed at 320px and 390px. Both phone screenshots
were inspected; they preserve the existing company hero and compact footer,
without horizontal overflow or page errors. Application typechecking caught
an incorrect currency field before integration; the query now uses the real
country budget currency code and asserts both USD and GBP country contexts.
The corrected application typecheck passed, followed by the final seven UI
cases. This remains Linux browser evidence.

Reproduce the focused checks from the repository root:

```sh
npx vitest run --config vitest.config.ts src/game/stateOwnership75.test.ts --maxWorkers=1
npx vitest run --config vitest.ui.config.ts src/ui/StateOwnership75.test.tsx src/ui/MarketsRegionLink510.test.tsx --maxWorkers=1
npm exec --workspace @ahdclient/engine -- vitest run src/save.stateOwnership.test.ts --maxWorkers=1
npx playwright test smoke/state-ownership-register.spec.ts
npm run typecheck
```
