# Corporate finance and bond issuance checkpoint

This checkpoint records the supported Native implementation for original
issue [#110](https://github.com/Egg3901/AHDNative/issues/110), plus the plant
and R&D portion of [#107](https://github.com/Egg3901/AHDNative/issues/107).
The immutable mechanics reference is `01797b27082b098fdf3929bb498215c94c8dda24`.
Current Game main refreshed to `96831835fb6b28983aa14fe66cb6eae9ecfde84c`;
active savings, LOC, law and corporate-turn mechanics are unchanged from the
immutable vectors. New upstream fund settlement batching remains separate from
Native's disabled-by-default index-fund consumer.
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
- `src/ui/MarketsPanel.test.tsx` and `src/game/bondMarketView.test.ts` — quote,
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

## Finance and macro integration

Source savings/bank deposit accrual now runs after corporation/union writes and
before pension/macro; central-bank decisions run after settled inflation and
price the next turn. Accrual reads the prior settled budget inflation, the same
value Game snapshots into its central-bank inflation history. The saved eight-turn
pricing rollout reaches +0.25 percentage points on central-bank savings and +2
points on credit spread. An actual normal turn uses the pre-turn prime/inflation
inputs while later macro and inflation still advance.

The source 25% interest eligibility cap now reads the persisted prior national
savings pool. A missing/zero prior pool follows Game's full-balance fallback;
the next snapshot records the pre-interest, pre-quarterly-credit account total.
Only source active issuing banks receive snapshots. Saved active pool state
cannot be exported to the historical v42 engine that never simulates it.
Source current-FX LOC servicing uses the obligation currency first, then other
personal wallets ranked by balance times current rate, with source cent rounding.
Independent Game vectors at USD1/GBP2 give payment USD4.07, GBP debit2.04,
interest2.08 and remaining principal998.01; the next payment is USD4.06,
GBP debit2.03 and principal996.03. A USD1/GBP2/SUR4 vector consumes SUR1.02
before GBP. Invalid account/FX state refuses before pricing or wallet mutation.
Public normal-turn/save/reload/twin cases are added; combined final verification
is pending. Original #111 stays open until all four acceptance rows pass.
Wires transfer the selected currency unchanged, with no fee; source FX is used
only for the sender's anchor-denominated quota. Adding a transfer conversion or
fee would diverge from Game's actual route.

Integrated supplemental LOC, wire and subsidy suites pass 55 tests. Invalid
foreign personal wallets now fail at load as well as servicing. An independently
executed Game `quoteLocService` at USD1/GBP2.01 debits GBP2.02, pays USD4.06
of the USD4.07 schedule and freezes further draws despite a funded foreign wallet;
Native preserves this source cent-rounding behavior. Current Game `cb66acdf`
leaves these servicing rules unchanged from `96831835`.

Physical sales also exposed Native's stale output-gap clamp. Independently
executed current Game vectors now constrain both persisted gap and headline
growth together: with previous gap 0, potential 2%, sector signal +100%/-100%
and 48 turns/year, the saved gaps are 13/48 and -17/48 and the reported growth
is +15%/-15%. Three regressions fail before this correction and pass after.
Source growth ceilings can hide a strict difference in the next headline rate
while preserving different saved gaps; strike throttles physical output once,
and market clearing need not reduce realized receipts by the same fraction.
These bounded corrections are reference only #106 and #40.

After main's subsidy controls are integrated, the six finance/banking/subsidy/
Gosbank suites pass 33 tests. The source macro/physical regressions pass 22 tests
across focused reruns. Fresh combined hosted verification remains required.

## Sector acquisition integration (#299)

The active buyer CEO authorizes payment from corporate cash, seller receives its
local-currency credit at recorded anchor FX, and host-region ownership transfers.
When the buyer already owns the same-region/type asset, merging now conserves
capital stock, capital book, produced/sold units and realized receipts before
removing the incoming asset. Sales and commodity fill ratios use output weights;
unknown optional values remain absent. The independent regression uses
stock700+300=1000, book2100+900=3000, output100+300=400, sold75+150=225,
receipts300+500=800 and weighted sold fraction .375. Six public acquisition
cases and two source/RNG phase-order checks pass on the combined branch.
The earlier actual 320px/390px corporate buyer/list/reprice/transfer/unlist/two
resume journeys are retained; the combined hosted gate must verify this head.
PR #713's implementation is included here, so its separate failed gate is not
presented as merge evidence.

The first SP relaunch smoke now awaits the same real worker readiness as other
resume journeys. Its unchanged diagnostic player flow passed in 3.9 minutes on
a busy host; the resume Profile assertion took 19.09 seconds against a 20-second
expectation. The profile picture test allows the documented 60-second worker
boundary for creation and two resumes. Failed synthetic CI browser traces are
retained for diagnosis. These test changes do not establish device performance.
