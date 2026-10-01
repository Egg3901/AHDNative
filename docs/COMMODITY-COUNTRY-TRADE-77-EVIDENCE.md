# Country commodity trade receipt evidence (#77, partial)

This slice gives the Markets route list a saved player-facing consequence for
trade cleared from recorded corporate production. It does not close #77.

## Source contract

The reference is AHDGame `163fec66518d7a09fa9fe6cfdc29b55d2c6ff6c4`. The source
tariff, proposal, affinity, and commodity-clearing files listed below are
unchanged from the earlier checked `cb66acdf0129616b8a09902727e9b58715c8bacb`
pin:

- `src/lib/turn/commodity/commodityPriceTurn.ts` builds state, country, and
  global commodity ledgers, resolves the demand legs, clears trade, and records
  trade flow snapshots.
- `src/lib/turn/commodity/demandLegs.ts` provides the corporate, household,
  government, and regional demand construction.
- `src/lib/turn/commodity/tradeContext.ts` supplies the recorded organization
  blocs and planned-economy curtain.
- `src/lib/trade/affinity.ts`, `src/lib/trade/tradeAffinity.ts`, and
  `src/lib/trade/constants.ts` define geographic, FTA, bloc, tariff, embargo,
  cap, and curtain affinity behavior.
- `src/lib/trade/clearing.ts` performs feasible bilateral commodity clearing.
- `src/lib/congress/billProposal.ts` requires tariff provisions to use the
  `trade` category, requires targets for sector/origin/corporation scopes, and
  clamps rates to 0–100. `proposeNationalBill.ts` requires an authorized
  elected-chamber official or source-approved HoS decree, charges 10 AP, gives
  tariff provisions no NPI charge, starts chamber bills active, and immediately
  enacts an eligible HoS decree. The bill-limit check rejects a second active
  tariff at the same scope.
- `src/lib/tariffs/tariffEffects.ts` upserts the tariff record and syncs the
  economy-wide budget tariff rate. `src/lib/tariffs/reconcileTariffs.ts`
  replays signed provisions. `src/lib/trade/tariffDrag.ts` sums the importer's
  applicable economy-wide, sector, and origin tariffs (capped at 100%);
  `src/lib/trade/affinity.ts` applies `1 / (1 + 3 × rate)` and exempts active
  FTAs.

## Implemented behavior

- Corporate plant offers and corporate intermediate-input demand are rebuilt
  from recorded assets, then retained by country. Where an asset carries an
  actual region id, its supply and input legs are also retained at that region
  before country aggregation.
- Government demand uses recorded federal spending, country FX, source rates,
  and the source 48-turn year. Healthcare and defense demand is distributed by
  positive recorded regional GDP; planned-economy education demand enters the
  entertainment-services national leg. Missing regional GDP receives no
  invented allocation.
- The household basket uses the source basket weights, wealth-tier slopes,
  price elasticities, and plants supply cap. It reads only regions with
  recorded population and GDP. Native does not store the household employment,
  confidence, or median-income signals consumed by Game, so those optional
  modulators take Game's neutral missing-signal path. It does not distribute
  national population to absent regional rows.
- Bilateral clearing uses the source IPF/feasibility algorithm. Current source
  geographic weights, active Native organization FTAs, shared recorded
  organization memberships, organization embargo blocks, and scheduled
  planned-economy curtains (including Yugoslavia's exemption) are honored.
- Receipt values use the actual Native global commodity price written by the
  current price phase, saved per commodity beside the units. This preserves
  the existing Native valuation without presenting a synthetic country price
  as Game parity.
- Game national prices use `effBaseFor(country)` (nominal base × country
  reachable-scarcity × lagged cost pass-through) before applying the country
  supply/demand curve and planned-economy pricing. Native has no country
  scarcity or cost pass-through state, and its global price already contains
  global pressure and drift. Therefore source-national pricing cannot be
  computed from current Native state; this slice does not claim to port it.
- The separate public `category="trade"` tariff action records source-style
  economy-wide tariff rows and applies Game's importer affinity drag, including
  the active-FTA exemption. Native still lacks sector/origin/corporation tariff
  scopes, embargo cap rows, and naval blockade closure. An ordinary customs
  tax-law bill remains separate from the trade tariff provision.
- The engine saves country receipts and bilateral commodity quantities/values;
  Markets projects exports, imports, net, partner, and up to three commodity
  flows per country. Imports stay visible for countries without a listed
  corporation. The rendered values are explicitly labeled in anchor units.

## Verification

- `packages/engine/src/trade/corporateTrade.test.ts`: independent two-country
  clearing/value-conservation vector using the recorded Native global price;
  embargo and planned-economy curtain behavior; federal healthcare, planned
  media, and household source vectors.
- `packages/engine/src/trade/clearing.test.ts`: source feasibility caps and
  conservation after structural-zero constraints.
- `packages/engine/src/trade/tariffs.test.ts`: source economy-wide records,
  signed-bill reconciliation, 3× affinity drag, and FTA exemption.
- `packages/engine/src/corporation/plantProduction.test.ts`: physical regional
  supply/input legs conserve into their country rows.
- `src/game/corporateTradeFlow.test.ts`: actual `GameSession` turn, persisted
  country/commodity flows, route projection, save/reload, and bilateral value
  conservation across all countries.
- `src/game/tradeRoutes.test.ts`: trade-only country stays visible without a
  listed issuer and persists the customs tariff record.
- `src/game/tradeTariff77.test.ts`: public trade-bill authority, HoS decree,
  source action cost/refund, tariffed-vs-control imports from the same saved
  world, ordinary CN customs-tax phase-in, and Markets save/reload projection.
- `src/ui/MarketsPanel.test.tsx`: the actual read-only route receipt and
  commodity context render in Markets.
- Engine typecheck job `20261001T201905Z-8d824bde` failed on diagnostics in
  unions, referendum, and other engine modules. No diagnostics remained in
  `src/trade/clearing.ts` or `src/trade/corporateTrade.ts` after the strict-safe
  fix. This result does not establish those remaining diagnostics are baseline
  errors relative to `main`.

## Original #77 acceptance disposition

1. **FX wallets, quotes, settlement, spreads, order books, and transaction
   history:** not implemented by this slice.
2. **Trade routes with bilateral/market settlement, restrictions, and commodity
  context:** corporate output is cleared bilaterally with supported source
  restrictions and persisted commodity context. Receipt valuation uses Native
  global prices; country-scoped Game pricing is unavailable. Household demand
  is available only for represented regions; non-corporate/state supply and
  absent-country household rows are not apportioned. Economy-wide tariff rows
  and affinity effects are implemented; sector/origin/corporation tariffs,
  tariff-paid settlement, national-price history, embargo caps, and blockade
  closure remain absent.
3. **Corporate issuance, dealer pools, and default/restructuring lifecycle UI:**
   not implemented by this slice.
4. **Atomicity and save/reload/turn verification:** verified for this corporate
   trade receipt path only. FX transactions, order-book trades, issuance, and
   default/restructuring workflows remain unverified/unimplemented.

The original full acceptance remains open. No issue state is changed here.
