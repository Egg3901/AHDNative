# Bilateral commodity clearing source parity

This branch ports the pure AHDGame `clearCommodity` algorithm from immutable
source revision `cb66acdf0129616b8a09902727e9b58715c8bacb` to the Native engine
public package API. The exported `clearCommodity` result returns the bilateral
unit-flow matrix, each country's exports/imports/net/uncleared receipt, and
total cleared volume.

The final feasibility pass caps every exporter row at its national surplus and
every importer column at its national deficit after 40 IPF iterations. Pair
caps are applied during allocation. Structural-zero routes therefore leave
unreachable deficit in `uncleared` instead of fabricating exports from the sole
reachable supplier. Tests include the source's CS→CN regression vector, the
high-affinity small importer spillover, pair caps, short-side settlement, and a
whole-vector invariant over every national receipt. The new test imports from
the package index, so it verifies the public API boundary.

## Integration limit

This port deliberately does not claim a Native world-turn trade market.
`WorldState.commodityPrices` records global commodity supply and demand, while
Native does not record country-by-commodity supply/demand balances or a source
bilateral trade snapshot. The existing market screens expose trade-growth/FX
summaries, not executed commodity flows. Consequently there is no authoritative
Native national-balance input to run from the turn or display as a saved trade
receipt. Supplying an estimated country allocation from global totals would
invent ownership and demand. The public pure clearing API is source-backed and
testable now; a saved turn-level trade ledger remains open until those balance
inputs are ported.

## Verification

- Red-first targeted test failed before the clearing module existed.
- `TMPDIR=$PWD/node_modules/.cache/check-tmp npx vitest run
  src/trade/clearing.test.ts` — 5 passed, importing `clearCommodity` from the
  public engine index.
- `git diff --check` passed.
