/**
 * M02: reference-exact deterministic referendum variance.
 *
 * Verbatim port of `seededVariance` from AHDGame
 * `src/lib/referendum/processReferendumLifecycle.ts` (FNV-1a 32-bit hash over
 * `${id}:${turn}`, mapped to [-1, 1]). Mainline chose a per-record hash
 * specifically to avoid `Math.random` so a re-run or resumed turn produces the
 * same result; it deliberately does NOT draw from the shared world RNG.
 *
 * RNG policy (verified, see docs/REFERENDUM-PARITY.md): this phase is now
 * rng-free. Worlds with no `polling` referendum never drew here anyway, so
 * they are bit-identical before and after this change. Worlds WITH a polling
 * referendum intentionally shift downstream phases' RNG draws relative to the
 * old `rng.next()` behavior; the old draw was the divergence, not the
 * baseline. Do not reintroduce a world-RNG draw here to "preserve" the old
 * stream: the old stream was reference-divergent by construction.
 */
export function seededVariance(id: string, turn: number): number {
  let h = 2166136261;
  const s = `${id}:${turn}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}
