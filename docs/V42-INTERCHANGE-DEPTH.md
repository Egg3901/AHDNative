# Historical v42 interchange boundary

This document records the bounded save projection to the pinned AHDClient v42 engine. It is separate from the current AHDClient/AHDGame SP snapshot contract (#122, #301–#304) and the owner-approved versioned successor required for progressed political play (#116). The historical engine is `Egg3901/AHDClient@c5017542c860f5f94b7d4b4d5cfea2939b28995d`; Native currently writes `SCHEMA_VERSION` 48. See [save compatibility](SAVE-COMPATIBILITY.md).

## What the old engine can do

Its public `deserializeSave` rejects an envelope above schema 42, migrates older schemas, and checks required fields without whitelisting extra keys. Its `serializeSave` uses `JSON.stringify` on `{ format, schemaVersion: world.meta.schemaVersion, savedAt, world }`. It therefore preserves unknown `countryPolitics` and string `player.homeRegionId` fields when reading and writing. Its turn pipeline never advances `countryPolitics`. Reader/writer preservation alone does **not** make a progressed political save playable there.

Native `projectSaveToV42` accepts the authentic v42 fixture byte for byte and a bounded Native fresh world before political progress. It removes `countryPolitics` only when Native can restore the same record by migration and refuses progressed worlds and unsupported state. It keeps a string `homeRegionId` as an old-reader-preserved extension; a null home region is omitted to match the authentic mint. A document with that extra string is not the authentic v42 mint. The projector rejects a mere schema relabel that keeps unsupported political state. The implementation is in `packages/engine/src/save.ts`, exported from the engine and `src/game/saveCompatibility.ts`, and used by `scripts/export-save-v42.ts`.

## Reproducible projection evidence

The hashes below are SHA-256 of public projected save bytes using `savedAt = 2026-09-10T00:00:00.000Z`. The two Native projection hashes were independently checked by loading and reserializing those bytes with the pinned old reader/writer; output was byte-identical. The test records these fixed oracle values in `packages/engine/src/save.v42Projection.test.ts`.

| Input | Projection | SHA-256 |
| --- | --- | --- |
| Authentic 1953 US fixture | unchanged | `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc` |
| Native fresh 1953 US, home `AL` | schema 42, home `AL`, no `countryPolitics` | `404370ac2e43de737ce3e664fafde05f34a8298bb51db2de9de8ae6de6c59b03` |
| Same Native world after `convertCash` 2000 | same bounded shape | `389c8c242abe894a494b43d226387651aa62c46663d7ae98e374781a53f62065` |
| Native world after a political turn | refused | n/a |

The prior version of this document listed `f141e9a9…` and `e281fc27…` for the Native projections. Those values no longer describe the current Native output; the fixed values above match the present tests and independent old reader. The prior claims that no other world/player keys differed at mint and that shared fields matched after three turns were also stale. A current comparison found nine t=0 leaf differences, including player funds, donor base and party regime status, and 39,119 shared-field differences after one turn. This projection test establishes the stated reader/writer behavior only; it is not a mechanics parity result.

## Why progressed saves require a successor

On a recorded 1953 US Native turn, political approval history grows from one sample to two while approval and unrest ease. Re-seeding a world from current macro values loses that history and those eased values. Carrying the record as an opaque extra through v42 leaves it frozen during v42 turns. Consequently, #116 completion uses a versioned current SP successor and a compatible turn engine, with explicit political-state mapping, both transfer directions, continuation, and independent AHDGame reference traces. Historical v42 projection remains bounded and fail-closed; no progressed political save may be described as v42 compatible.

The current snapshot descriptor and transfer policy live under `packages/engine/src/interchange/`; its Native schema number must follow the engine's live schema constant. Contract-only directions do not demonstrate either export or import. The #117/#281 parity gate must compare source-backed scenarios before a mechanics or round-trip claim.

## Local checks

```sh
npx vitest run --config packages/engine/vitest.config.ts packages/engine/src/save.v42Projection.test.ts
npx vitest run --config vitest.config.ts src/game/saveCompatibility.test.ts scripts/export-save-v42.test.ts
```

These are local contract checks, not an iOS build or physical-device result.
