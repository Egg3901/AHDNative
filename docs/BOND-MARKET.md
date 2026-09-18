# Sovereign bond market

The Character menu opens Bonds. Players can inspect outstanding sovereign
issues, coupon rates, maturity, public float and their own units. Domestic
issues can be bought or sold through the existing `buyBond` and `sellBond`
actions. Successful trades update balances and holdings, retain the selected
issue, and autosave through the normal game flow. Settled issues without player
holdings are omitted from this inventory.

The optional worker query returns detached bond summaries, not the world.
The UI checks positive whole-unit quantities, cash, float, holdings, action
points, cooldown, maturity, default and the engine's domestic-only rule.
The engine remains authoritative. Foreign issues can be inspected but cannot
be traded; no unsupported FX settlement is invented.

## Source boundary

Native `actions/execute.ts` prices a neutral-fee order as
`round(units * faceValue * marketPrice * 100) / 100`, with a single rounding
of the entire order. Display quotes use the same contract. This slice changes
no engine formulas, pricing or issuance/coupon/maturity mechanics.

AHDGame `e364c0495`, `src/app/api/bonds/[bondId]/buy/route.ts` and the matching
sell route use bond quotes with dealer spreads and pool behavior. Native does
not implement that full market model, cross-currency settlement, corporate
servicing or sovereign default triggers. The interface exposes the current local
engine; it does not establish full bond-mechanics parity.

## Corporate issuer/state slice (#307)

The engine models corporate issuance identity only: `issuerType:
"corporation"` with `corporationId`, `CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS`
(96/240/336), home-currency denomination, full-float placement, and
issuer/owner invariant enforcement on issuance and on `buyBond`/`sellBond`.
Corporation records carry optional `countryOwnerId`/`ownershipState` (absent =
private). Corporate issues are inert in the turn pipeline until #308 (coupons,
maturity, buybacks, defaults) and #309 (phase timing). No save-envelope
migration: all new fields are optional and old saves round-trip byte-stable.
Focused evidence: `packages/engine/src/bonds/corporateBonds.test.ts`.

## Corporate servicing slice (#308)

`processCorporateBondTurn` (in `packages/engine/src/bonds/corporateBondServicing.ts`,
wired into `bondCouponMaturityPhase`) applies per-turn coupons in the bond
denomination (`couponRate x face / 48` per unit, source
`corpBondCashflows.ts`), debits the issuer for every outstanding unit
including the float, and settles face at `maturityTurn`. A private issuer that
cannot cover the turn defaults atomically with zero flows (paper stamped
`defaulted`, price 0.1, holdings frozen, trades already blocked); state-owned
issuers are coupon-waived but never default (source: national corporations
cannot be dissolved). `buybackCorporateBondUnits` retires float units at
market price from issuer cash, closing a fully retired unheld series at par
(source `buyback/route.ts`). Coupon/maturity flows are unrounded floats like
the sovereign seam; only buyback rounds (whole-order 2dp). Repeated servicing
at the same turn is idempotent (`lastCouponTurn` stamp plus
matured/defaulted guards). Restructure, refinance, dissolution, credit-rating
pricing, and any further phase reordering stay out (#309).
Focused evidence: `packages/engine/src/bonds/corporateBondServicing.test.ts`.

## Phase timing slice (#309)

Pinned source: AHDGame `e364c0495`,
`src/simulation/phases/turnPhaseNames.ts` —
`corporationTurn` (5) < `bondTurn` (18) < `recomputeSharePrices` (22), with
the central-bank cluster (~111-116) long after `bondTurn` (so the source
prices bonds off last turn's prime rate). Inside `bondTurn`
(`src/lib/turn/bondTurn.ts`): coupons (Ph1) -> maturity precompute (Ph1.5) ->
unified issuer debit (Ph2) -> default detection (Ph3) -> rollback (Ph3.5) ->
price/maturity/default marking (Ph4) -> settlement (Ph5).

### Writer/consumer inventory (Native `packages/engine/src/phases/registry.ts`)

| Native writer | Writes | Pinned counterpart |
|---|---|---|
| `sovereignIssuancePhase` | new bond docs, budget debt/principal/interest/surplus | `issueScheduledSovereignBondSeries` inside `bondTurn` |
| `bondCouponMaturityPhase` | player cash/balances, budget treasury+debt, corp `liquidCapital`, bond price/flags/holdings | `bondTurn` Ph1-5 (sovereign + corporate servicing) |
| `npcBondHolderPhase` | bond `publicFloat` drift only | no source counterpart (solo invention; reads `marketPrice`, so runs after servicing) |

| Native consumer | Reads | Order vs source |
|---|---|---|
| `recomputeSharePricesPhase` | corp `liquidCapital` (post-coupon, post-loan-service) | **moved by #309** to right after `npcBondHolderPhase`, matching `bondTurn` (18) < `recomputeSharePrices` (22); the source keeps a dedicated `recomputeSharePricesAfterBondTurn` for this edge |
| `recordWorldHistoryPhase`, `economicVitalSignsPhase`, achievements | bond holdings/prices/traces | already after the bond cluster; read-only, no move |
| `ledgerPreForexSnapshotPhase`/`forexTurnPhase` | player cash (incl. coupon flows) | already after the bond cluster, matching source order |

All moved phases are RNG-free (no `WorldRng` draws: bond phases and the
repricing declare `run(world)`), so the move shifts no shared RNG stream.
Relative order the move preserves: `corporationTurnPhase` <
`bankingTurnPhase` < bond cluster < `recomputeSharePricesPhase`, matching
mainline's `corporationTurn`/`bankingTurn`/`bondTurn`/`recomputeSharePrices`
chain. Buyback stays an action-seam operation (CEO float buyback), outside
the turn pipeline in both trees — no phase edge.

### Intentional Native adaptations (no move, documented)

- **Commodity/contract before bonds.** Native runs `commodityPricesPhase` /
  `contractSettlementPhase` before the bond cluster; mainline runs them after
  `bondTurn`. `commodityPrices` draws RNG, so reordering needs a re-golden,
  and contract settlement is W11 finance work — both out of #309 scope.
  One-turn lag on royalty-vs-coupon same-turn interaction; no bond-observation
  impact.
- **This-turn prime for bond pricing.** Native's central-bank cluster runs
  before the bond cluster; mainline's runs long after `bondTurn`, so the
  source prices off last turn's prime (one-turn lag). Moving the bank cluster
  is broader monetary work. Price direction vs prime is proven either way.
- **Fiscal year before bonds.** Native `fiscalYearPhase` /
  `regionalBudgetProcessingPhase` run before the bond cluster; mainline runs
  them after `bondTurn`, so source issuance debt lands before the fiscal
  read. Budget-phase reorder is broad finance work, out of scope.
- **Unified corporate servicing after sovereign settlement.** Native services
  each corporate bond atomically (coupon+maturity+default per bond) after the
  sovereign coupon/settle steps; the source interleaves both books through
  Ph1-5 with a unified issuer debit. Shared state (player cash) is additive
  so the order commutes, and issuer sides (budgets vs corp capital) are
  disjoint — unobservable, no move.
- **Bank solvency after repricing.** Native `bankSolvencyTurnPhase` runs
  immediately after `recomputeSharePricesPhase` (after the bond cluster),
  matching mainline, so the #328 prop-book mark lands on fresh prices. The
  retail-bank math reads charters/deposits untouched by servicing, so that
  leg is order-indifferent.
- **Corporate price stays at par.** No credit-rating repricing for corporate
  issues (price 1.0 while performing, 0.1 on default per source Ph4) —
  carried over from #308, pinned by test.

Focused evidence: `packages/engine/src/bonds/bondPhaseOrder.sim.test.ts`
(public-turn twin-world oracles: next-turn price via the published formula,
exact issuer-coupon twin delta, holder credits, once-per-turn accrual,
maturity settlement, zero-flow default, and the repricing edge that fails
with equal prices pre-#309 and passes post-#309).

## Validation boundary

The genuine elected 1953 US save contains `bond-60-US` with 1000 face value,
par price, 3.75% annual coupon and maturity turn 108. The public GameSession
test buys two units for 2000, sells one for 1000, verifies invalid fractional
orders leave the save unchanged, then reloads the remaining unit. Display
queries are detached. Component tests cover quantity validation, overselling,
selected-issue dispatch and foreign settlement restrictions.

The production browser scenario loads that same save, trades, relaunches and
verifies the remaining holding at turn 98. It uses actual worker actions and
IndexedDB storage. Native phone lifecycle and performance remain unproven.

## Market visual (issue #143)

The panel adds one offline code-native comparison visual plus a selected-issue
hero, both computed from the already-projected listing fields:

- Yield to maturity per issue from the engine's verbatim
  `calculateBondYieldToMaturityPercent` (AHDGame
  `src/lib/constants/bonds.ts`), with annual coupon per unit, price-vs-par
  label and Sovereign/Defaulted/Matured badges mirroring the reference
  `BondHeroPanel`. Defaulted and matured issues show a dash, never a plotted
  recovery artifact.
- A "Compare issues" card (two or more issues only) scales each outstanding
  yield to the market maximum as a touch-sized (44px) selection row,
  alongside coupon, price-vs-par, turns remaining and status text.
- An ownership strip splits outstanding units into exactly the two slices the
  solo engine tracks — player holdings and public float — with a text
  equivalent behind `role="img"`. No holder roster or price history is
  invented; trend charts stay tracked separately (#375).

Bars are percentage-width divs with visible text values, so the layout holds
at 320px and 390px with no horizontal overflow. Component coverage lives in
`src/ui/BondMarketPanel.test.tsx`; display-math goldens in
`src/game/bondYield.test.ts`.
