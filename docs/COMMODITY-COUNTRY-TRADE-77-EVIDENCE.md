# Country commodity trade receipt evidence (#77, partial)

This slice gives the Markets route list a saved player-facing consequence for
trade cleared from recorded corporate production. It does not close #77.

## Source contract

The reference is AHDGame `cb66acdf0129616b8a09902727e9b58715c8bacb`:

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
- National route values use the source `computeMarketPrice` pressure curve and
  the source 500-unit national stabilizer on each represented country's
  recorded output and demand. Planned and dual-track countries use the source
  administered 12% turnover markup and `plannedShare`; the resulting per-turn
  country prices are saved beside the trade receipt. Flow values use the
  exporter's national price, matching Game `valueTradeSnapshot`.
- Native has no Game tariff rows, embargo cap rows, naval blockade closure, or
  per-country commodity-price history/scarcity inputs. The national-price
  calculation therefore uses the recorded global price as its effective-base
  anchor and represented country balances only. It leaves tariff/cap/blockade
  mechanics unavailable and does not substitute the budget's economy-wide
  tariff rate for Game's importer/sector/origin tariff.
- The engine saves country receipts and bilateral commodity quantities/values;
  Markets projects exports, imports, net, partner, and up to three commodity
  flows per country. Imports stay visible for countries without a listed
  corporation. The rendered values are explicitly labeled in anchor units.

## Verification

- `packages/engine/src/trade/corporateTrade.test.ts`: independent two-country
  source-clearing/value-conservation vector; embargo and planned-economy curtain
  behavior; national-price/turnover-markup vector; federal healthcare, planned
  media, and household source vectors.
- `packages/engine/src/corporation/plantProduction.test.ts`: physical regional
  supply/input legs conserve into their country rows.
- `src/game/corporateTradeFlow.test.ts`: actual `GameSession` turn, persisted
  country/commodity flows, route projection, save/reload, and bilateral value
  conservation across all countries.
- `src/game/tradeRoutes.test.ts`: trade-only country stays visible without a
  listed issuer.
- `src/ui/MarketsPanel.test.tsx`: the actual read-only route receipt and
  commodity context render in Markets.
- Engine typecheck is queued through the shared check scheduler; its final
  result is not yet recorded here.

## Original #77 acceptance disposition

1. **FX wallets, quotes, settlement, spreads, order books, and transaction
   history:** not implemented by this slice.
2. **Trade routes with bilateral/market settlement, restrictions, and commodity
   context:** corporate output is cleared bilaterally with supported source
   restrictions and persisted commodity context. Household demand is available
   only for represented regions; non-corporate/state supply and absent-country
  household rows are not apportioned. Trade cash settlement, ongoing national-
  price history, tariff rows, embargo caps, and blockade closure remain absent.
3. **Corporate issuance, dealer pools, and default/restructuring lifecycle UI:**
   not implemented by this slice.
4. **Atomicity and save/reload/turn verification:** verified for this corporate
   trade receipt path only. FX transactions, order-book trades, issuance, and
   default/restructuring workflows remain unverified/unimplemented.

The original full acceptance remains open. No issue state is changed here.
