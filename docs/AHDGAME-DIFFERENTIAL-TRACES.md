# Authoritative AHDGame differential traces

These fixtures are outputs of the real AHDGame Mongo turn pipeline, not Native
goldens. The source-owned exporter is AHDGame PR #1901 at revision
`52716c972fdc48f12266170725b376a765fce873`.

The exporter runs only against an `ahd_sim_*` database and refuses any database
containing users. It observes the existing `runPhase` boundary without changing
phase execution. It records ordered mutations for resources, elections, budgets,
policies, and player consequences.

Normalization is intentionally narrow. Mongo Extended JSON ObjectIds become
encounter-order labels and wall-clock dates become encounter-order labels.
Gameplay values, branches, array order, and collection membership remain intact.
The normalized input hash is recorded as Mongo provenance. AHDGame does not expose
all phase RNG streams at this revision, so each phase is marked
`unobservable-fail-closed` rather than claiming an empty observed stream.

## Regeneration

Use a disposable local Mongo instance, never a live world. From a clean checkout
of the pinned AHDGame revision:

```bash
NODE_ENV=test SIM_MONGODB_URI=mongodb://127.0.0.1:<port> \
  npx tsx scripts/sim/runWorld.ts --seed=trace1953us \
  --db=ahd_sim_trace1953us --preset=1953-default --turns=2 --quiet

NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:<port> \
  npx tsx scripts/sim/exportDifferentialTrace.ts \
  --db ahd_sim_trace1953us --seed trace1953us \
  --source-revision 52716c972fdc48f12266170725b376a765fce873 \
  --country US --era 1953 --fixture 1953-US-turn-4 \
  --output <native-root>/packages/engine/src/differential/fixtures/ahdgame-1953-US-turn-4.json
```

The 1979 UK fixture uses `trace1979uk`, `ahd_sim_trace1979uk`,
`1979-default`, `--turns=1`, country `UK`, era `1979`, and fixture id
`1979-UK-turn-3`.

Native verifies each fixture through the shared trace parser and pins its file
SHA-256 in `authoritativeTraceFixtures.ts`. RNG-observable comparison remains
blocked for #281 until AHDGame exposes those draws.

## Native capture (#281, partial)

`captureNativeTurnTrace(world, { fixtureId, era, revision, savedAt, sha256 })`
is exported from `@ahdclient/engine`. It advances one turn through the public
`advanceTurn` `afterPhase` observer and emits a schema-v1 `native` trace. The
turn outcome is identical to an unobserved `advanceTurn`. If capture fails, it
throws mid-turn and the world must be discarded.

- Phases are the ones `advanceTurn` actually ran, in run order.
- RNG `before`/`after` are observed states of the shared `advanceTurn` sfc32
  stream. `draws` are the exact `next()` outputs between them, replayed from
  `before` and rejected unless they reach `after`. The draw count comes from the
  counter word. Above `MAX_NATIVE_TRACE_DRAWS_PER_PHASE` (1,000,000, or the
  `maxDrawsPerPhase` option) the capture throws before allocating anything. A
  real turn draws about 0.1M in total. Phase-local generators
  (`intraparty/phases.ts` `forkRng`, `judiciary/scotusTurn.ts`) are declared
  `unobserved-fail-closed` in `after.unobservedStreams`, not reported as absent.
- Observations use the exporter's `{ mutations: [{ path, before, after }] }`
  shape and diff rule, scoped to the player's country. The domains are: the
  human player's `cash`/`funds`/`actions` plus politician `actions`/`funds`
  (resources), election records, national and regional budgets, enacted laws
  (policies) and country news (player consequences). When a key exists on only
  one side, the mutation also carries `presence: { before, after }`, so an
  absent field is not mistaken for `null`. The pinned AHDGame exporter treats
  absent as `null` (`?? null`), which is an upstream delta. These are Native
  field names, not a canonical Mongo-to-Native field map.
- `input.source.sha256` hashes the exact `serializeSave(world, savedAt)`
  bytes. The same world and `savedAt` reproduce it after save/reload.
  `input.canonicalInputSha256` hashes the Native initial domain observation, so
  it is not yet the shared normalized input.

Evidence: `packages/engine/src/differential/nativeCapture.test.ts`. Comparing
the pinned 1953 US and 1979 UK AHDGame fixtures with Native traces for the same
era, country and seed label stops at `input.canonicalInputSha256`. This is the
expected fail-closed result, not parity. The phase sets also differ: AHDGame
runs 187 and 182 phases, Native runs 116, and only 86 and 85 names are shared.
The first AHDGame phase is `bannedShareholderRelease`; the first Native phase
is `advanceCalendar`.

Remaining #281 acceptance:

- Capture player/script actions: schema v1 has no actions field, so actions
  are reflected only through the input world hash.
- Define a normalized input and a Mongo-to-Native field map, so both engines
  hash the same comparison input and the domains are comparable.
- Align or explicitly adapt the phase sequence. Record intentional Native
  adaptations and upstream source deltas as trace `adaptations`.
- Observe phase-local Native RNG streams. AHDGame RNG remains unobservable.
- After alignment, compare representative eras and countries and report the
  first divergent phase and field. Save/reload is covered only on the Native
  side: the reloaded trace and its fail-closed comparison are identical.
- Add a deterministic differential command as a CI parity gate. The focused
  vitest file runs in the existing engine `test:ci`; it is not a parity gate.
