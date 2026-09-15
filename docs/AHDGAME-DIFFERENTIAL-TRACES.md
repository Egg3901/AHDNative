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
