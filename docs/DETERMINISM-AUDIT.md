# G04 determinism audit

Read-only audit of ambient nondeterminism in current non-test engine and content. No engine formulas were changed. No tests, builds, or sims were added.

## Source revision

- Worktree: `docs/determinism-audit`
- Commit: `f61c28f9aea02e856301a1995a41eff7e4c485fb` (`fix(engine): run corporationTurn before macroCountryTurn (#17)`, 2026-09-10)
- Import baseline (manifest, not current tree): AHDClient `568c0c039efcca2db17c52b2920747ff05fbd794`
- AHDGame pin cited by later adaptations: `e364c04954ed628beef73a993a8e9e156650a31e`

This Native repository is public. Source is published for inspection and evaluation under the proprietary source-available license. That is authorization to read the imported engine/content here. It is not a grant to reuse, modify, or relicense the code.

## Method

Scope: `packages/engine/src`, `packages/content/src`, `packages/content/scripts`. Test files matching `*.test.ts` / `*.sim.test.ts` / `*.spec.ts` excluded.

Scanner: TypeScript compiler API (AST). Comments and string literals are not call sites. Inspected:

- `Math.random`, `Date.now`, zero-arg `Date()` / `new Date()` / `new Date(undefined)`
- `crypto.getRandomValues`, `randomUUID`, `randomBytes`, `randomInt`, `randomFill` / `randomFillSync`
- `performance.now`
- Identifier aliases of those methods, and identifier aliases of `Math` / `Date` / `crypto` / `performance` (including `globalThis` / `window` / `global` / `self` prefixes)
- Computed access with string literals (`Math["random"]`). Non-literal `Math[x]` / `Date[x]` / `crypto[x]` reported as unresolved
- `import` / `require` of `crypto`, `node:crypto`, `uuid`, `nanoid`, `seedrandom`, `chance`, `faker`, `@faker-js/faker`, `random`, `pure-rand`, and similar generators

Positive control: parsing `packages/engine/src/electionEngine/candidateEnrichment.test.ts` still finds two `Math.random()` calls. The production pass excludes that file.

Secret scan: pattern grep inside `packages/engine` and `packages/content` only. Signing stores, Codemagic variables, and private ops paths were not opened.

Limits of the AST pass: no `eval` / `with` / WASM; no proof against an arbitrary runtime property graph after several hops; string-literal computed keys only.

## Production scan result

363 non-test TypeScript files scanned; 121 test files skipped.

| Ambient API | Production call sites |
|---|---|
| `Math.random` | none |
| `Date.now` | none |
| zero-arg `Date()` / `new Date()` / `new Date(undefined)` | none |
| crypto random APIs above | none |
| `performance.now` | none |
| imports of unseeded generators / `node:crypto` | none |
| unresolved computed access on `Math` / `Date` / `crypto` | none |

Direct `Math` transcendentals (not RNG): `pow` 19, `sqrt` 12, `log` 7, `exp` 3, `hypot` 5, `log10` 2, `log1p` 2. A follow-up source scan also found `tanh` 2 (`corporation/constants.ts` and `referendum/cohort.ts`).

18 `new Date(...)` production sites, all with an explicit argument from world date, stored timestamps, `Date.UTC`, or epoch `0`. Examples: `calendar.ts:9,15,16`, `elections/orchestration.ts:60`, `content/src/validate.ts:9`. None are wall-clock.

`createWorld` requires `options.seed: string` and calls `rngFromSeed`. `serializeSave(world, savedAt)` takes the timestamp from the host; it does not call `Date.now`.

Seeded engines in production:

- `packages/engine/src/rng.ts`: xmur3 + sfc32 `WorldRng`. File hash still matches the import manifest.
- `packages/engine/src/referendum/seededVariance.ts`: FNV-1a over `${id}:${turn}` (post-import; see adaptations). No world-RNG draw.
- `packages/engine/src/cabinet/nominationLifecycle.ts:105-117`: local draw from `world.meta.turn`, index, and `world.meta.rng[0]`. Seeded and serializable. It does not advance the shared `WorldRng` stream. Not `Math.random`.

`packages/engine/src/elections/presidentialElectoralCollege.ts` documents an alphabetical tie-break instead of mainline `node:crypto` sha256, to keep the engine free of that module.

Comment and catalog text that names `Math.random` / `Date.now` (for example `nominationLifecycle.ts:10,24`, `achievements/catalog.ts:95,518`, `phases/eraCrossing.ts:11`) is not a call site.

Tests (excluded) do use `Math.random` and zero-arg `new Date()` as fixture helpers, and `createHash` from `node:crypto` for hashing. Those are not production runtime.

## Manifest vs current tree

`docs/engine-source-manifest.json` records SHA-256 hashes at import from AHDClient `568c0c03`. It is a baseline, not a claim that the current engine is unmodified. `nativeAdjustments` at import: `packages/engine/src/intraparty/statePartyElections.ts` (type-assertion cleanup; documented as no runtime behavior change).

478 manifest entries: 464 hashes still match, 13 differ, 1 manifest path is gone (`packages/engine/src/referendum/lifecycle.sim.test.ts`, replaced by `lifecycle.test.ts`).

Production files whose bytes no longer match the baseline hash, all listed in [ENGINE-ADAPTATIONS.md](ENGINE-ADAPTATIONS.md) or that import `nativeAdjustments` note:

- `packages/engine/src/index.ts`
- `packages/engine/src/save.ts`
- `packages/engine/src/world.ts`
- `packages/engine/src/actions/execute.ts`
- `packages/engine/src/corporation/corporationTurn.ts`
- `packages/engine/src/demographics/laborForce.ts`
- `packages/engine/src/phases/macroCountryTurn.ts`
- `packages/engine/src/phases/registry.ts`
- `packages/engine/src/referendum/lifecycle.ts`
- `packages/engine/src/referendum/phases.ts`
- `packages/engine/src/referendum/types.ts`
- `packages/engine/src/intraparty/statePartyElections.ts`

Production files present now and absent from the baseline manifest, all recorded as intentional post-import work:

- `packages/engine/src/referendum/seededVariance.ts`
- `packages/engine/src/referendum/cohort.ts`
- `packages/engine/src/initialization/ukHistorical.ts`

`packages/engine/src/engine.sim.test.ts` also drifted (phase-order assertion). Test-only.

## Secrets and publication

The scoped pattern scan found no private keys, signing identities, API tokens, or password assignments in `packages/engine` or `packages/content`. Signing material was not accessed. Private ops and secret stores were not scanned.

No secret values are recorded in this document.

## What is not established

- Rust versus TypeScript numeric parity, including cross-platform float and device replay. Transcendental `Math.*` counts above are present. G05/G06/R03 remain the place for that evidence.
- JavaScript engine differences (`pow` / `sqrt` / `log` / `exp` / `hypot` / `log10` / `log1p`) across browsers, JSC, and native webviews.
- Default `localeCompare` without a locale argument: 59 production calls in 27 files (id and name sorts, including `world.ts`, election orchestration, founding). Collation is implementation-defined. Not classified as unseeded RNG. Cross-device collation parity is unproven.
- Host-supplied `savedAt` strings, UI clocks, and worker transport.
- Physical iOS/Android replay. Linux/browser replay against the pinned AHDClient oracle is a different gate (E07).
- Current AHDGame whole-engine parity. Historical 21-world hashes predate the adaptations listed above.

## G04 acceptance

The scoped source audit found no unseeded runtime randomness or secret/ops material in non-test engine/content at `f61c28f9aea02e856301a1995a41eff7e4c485fb`.
