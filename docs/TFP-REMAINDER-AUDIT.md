# TFP remainder audit

Issue [#40](https://github.com/Egg3901/AHDNative/issues/40) remains open. This note separates the accepted subsidy work from the rejected TFP runtime proposal.

## Already integrated

PR [#155](https://github.com/Egg3901/AHDNative/pull/155) wires live corporation revenue into annual subsidy budget costs. PR [#156](https://github.com/Egg3901/AHDNative/pull/156) adds the schema v44 migration, save projection rules, and state-scope coverage. Those changes satisfy issue #39 and are already on `main`; they must not be recovered again from `p0-subsidy-tfp`.

## Reviewed but not accepted

Commit `09e9332` on `feat/tfp-regional-inputs` was reviewed as a possible partial #40 extraction. Its tests pass, but it is not accepted for runtime integration:

- It replaces AHDGame seed-time `Math.random()` with a synthetic FNV value. That is reproducible Native data, not a captured AHDGame world or reference-parity seed.
- It applies national education and infrastructure spending to every region as a stand-in. AHDGame combines state and federal inputs, while Native lacks the required regional channel.
- Freight logistics and grid energy adequacy remain zero because Native has no per-region `sectorRevenueTax` payload. Zero is a disclosed missing input, not implemented parity.
- `computeNationalMetrics` restores every prior metric omitted by the current rebuild, not only the TFP slice. That changes persistence semantics for unrelated national metrics.
- It allocates schema v45 to two new runtime stores plus projection and migration policy before the missing inputs and interchange evidence are complete.

Passing deterministic tests do not resolve those source and model gaps.

## Source-backed prerequisites for #40

Before integrating regional TFP inputs:

1. Capture an authoritative AHDGame seed fixture or define an approved shared randomness contract for the six TFP leaves. Do not substitute a Native-only pseudo-random seed and call it parity.
2. Port a real per-region sector revenue payload matching AHDGame's `sectorRevenueTax` input so freight logistics and grid energy adequacy use source data.
3. Wire regional education and infrastructure spending, including the state contribution and cabinet infrastructure mix used by AHDGame. Do not copy one national per-capita value into every region.
4. Port the required metric-registry dependency chain, including literacy, GCSE or equivalent education inputs, war road damage, water, envelope caps, circuit breakers, and cabinet target nudges.
5. Define how legislation, policy effects, and ministerial orders write regional metrics. National policy-root values must not silently diverge from regional state or be overwritten by aggregation.
6. Provide source-backed region coverage for every claimed era and country, including 2019 Brazil, or explicitly keep unsupported combinations outside the feature gate.
7. Validate the downstream TFP effects on potential growth, inflation shocks, and corporation revenue at the public turn, save, and replay boundaries.
8. Design the schema migration and v42 projection only after the runtime state is settled. Run fresh interchange evidence and retain historical oracle hashes as historical evidence.
9. Restrict any preservation logic to the named TFP fields. Add regression tests proving unrelated `nationalMetrics` keys retain their existing rebuild semantics.

Until these prerequisites land, keep the current baseline fallback and describe #40 as partial. Do not merge `09e9332` or the original dirty `p0-subsidy-tfp` worktree as a completed TFP fix.
