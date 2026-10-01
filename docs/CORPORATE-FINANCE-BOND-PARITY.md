# Corporate finance and bond issuance checkpoint

This checkpoint records the supported Native implementation for original
issue [#110](https://github.com/Egg3901/AHDNative/issues/110), plus the plant
and R&D portion of [#107](https://github.com/Egg3901/AHDNative/issues/107).
The immutable AHDGame reference is `01797b27082b098fdf3929bb498215c94c8dda24`.
Root review and the hosted full gate remain pending; no issue status change or
full-parity claim is made here.

## #110: corporate issuance and bond lifecycle

- The seated player CEO can request a quote and issue a local-currency
  corporate bond. The quote checks private/active issuer eligibility, currency
  and FX availability, finite balance-sheet values, the source 24-turn
  cooldown, the per-issue revenue cap, going-concern and exit-equity leverage,
  current credit rating, and term coupons. Issuance and issuer proceeds are an
  atomic engine action.
- Quotes use Native's recorded plant-sale receipts once the plant ledger has
  run. They never treat plant nameplate or produced capacity as sales. Native
  records those receipts in local currency per seven-day turn. For the source
  valuation, the recorded weekly receipt is divided by `DAYS_PER_TURN = 7` to
  obtain Game's daily sector revenue; Game then computes `dailyProfit /
  TURNS_PER_DAY(24) * TURNS_PER_YEAR(48)`, with growth cost omitted in plants
  mode. The source-discounted value is annual income divided by 15%.
- An independently executed Game `corporateCredit.ts` vector for a USD
  corporation with realized revenue $10,000/day, effective margin 20%, no
  growth deduction, and $100,000 cash gives per-turn income $83.3333, annual
  revenue $20,000, sector NPV $26,666.6667, and equity $126,666.6667. The
  equivalent Native ledger input is $70,000/week, since `DAYS_PER_TURN = 7`.
  The ordinary per-turn quote vector also matches the independent Game rating,
  coupon and issuance-window helpers.
- Listings preserve issuer names and show the actual issuer and bond
  denomination. The active CEO can retire only available public-float units.
  Live buybacks use the source local-currency bond-pool ask (not a market-price
  fallback), debit the issuer after USD-anchor FX conversion, credit the pool,
  and reduce face/public float atomically. A missing required FX quote refuses
  before mutation. The independently executed source pool vector at price
  `0.9786` and balanced cash returns ask `0.9982`; the cross-currency regression
  converts GBP bond cost into the issuer's USD cash.
- Coupon, maturity, default, and the #308 30-turn claimant settlement retain
  bond holder/float consequences across save and reload. Native keeps its
  RNG-safe tail cluster, while tests prove the supported consumer edges:
  corporate bond servicing precedes share-price recomputation and line-of-credit
  payment, so coupon proceeds can fund the same turn's scheduled payment.

## Evidence

- `packages/engine/src/bonds/corporateBondQuote.test.ts` — source-derived
  issuance/credit vector and the plants daily/weekly translation.
- `packages/engine/src/bonds/corporateBondServicing.test.ts` — coupon,
  maturity, default, pool ask, cross-currency conversion and atomic refusal.
- `packages/engine/src/save.v42Projection.test.ts` — unsupported active bond
  and pool state is refused at the historical export boundary.
- `src/game/corporateBondIssuance.test.ts` — issue, source-rate coupon,
  save/reload and next-turn issuer balance; CEO public-float retirement and
  save/reload.
- `src/ui/MarketsPanel.test.tsx` and `src/ui/BondMarketView.test.ts` — quote,
  issuer identity and CEO-gated controls.
- `smoke/corporate-bond-flow.spec.ts` — actual player CEO appointment, bond
  issuance, buyback, save/reload and responsive no-overflow checks at 320px and
  390px.
- Final focused results on Native `efc3f6799ebd1000a7ea6048104621472603cc34`:
  quote/servicing/plant production 30 tests passed; v42/plant save 23 passed;
  GameSession issuance and listing 9 passed; Markets/Bond UI 64 passed; the
  two-width Chromium player journey passed 2/2. `git diff --check` passed.

The registered full typecheck and root's combined hosted gate are still
pending. The source turn cluster remains in Native's tail to preserve its
RNG-safe append-only ordering; the relative writer/consumer behavior required
for this bond flow is asserted, but this is not a claim that Native's entire
absolute phase schedule matches Game.

## #107 remains partial

The merged corporation work adds recorded plant capital, depreciation and paid
book value, source-backed demand, produced and sold output, realized sales,
persisted R&D spend/score and SHA-256 innovation draws, plus CEO salary and
shareholder dividend settlement. Its plant-sale revenue is available to the
bond quote above. This is not closure of #107: the complete source corporate
modifier/P&L and management stack, wider CEO/NPP decision behavior, and full
command-economy plan/reform gravity remain unported. The R&D innovation stream
adds sector capacity only; no national TFP effect is claimed. Extraction R&D
still lacks the full source action, facility and regional prerequisite flow.
