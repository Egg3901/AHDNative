# v42 interchange depth

Field and behavior matrix for public save interchange between Native schema 43 and the historical v42 engine. Companion to [save compatibility](SAVE-COMPATIBILITY.md). Not AHDGame parity, not in-app export, and not a claim that every Native world can round-trip.

Pinned v42 engine: Egg3901/AHDClient@`c5017542c860f5f94b7d4b4d5cfea2939b28995d`. Native `SCHEMA_VERSION` 43. Public contract: `createWorld`, `executeAction`, `advanceTurn`, `serializeSave`, `deserializeSave`, `projectSaveToV42`.

## Exact additive save shape (1953 US)

Live JSON key diff of the authentic fixture versus Native `createWorld` / `deserializeSave` then `serializeSave` for seed `v42-interchange-v1`, player `Validator`, era `1953`, country `US`:

| Location | Authentic v42 mint | Native schema 43 |
|---|---|---|
| Envelope / `world.meta.schemaVersion` | 42 | 43 |
| `world.countryPolitics` | absent | required record, RNG-free seed at create, eased each Native turn |
| `player.homeRegionId` | absent | `"AL"` on Native-fresh; `null` after authentic v42 migration |

No other world or player keys differ on this mint. Feature-flag keys are the same. Native `countryPoliticsPhase` maps onto the existing `governments` flag and does not consume the turn RNG stream.

Dropping both additive fields from Native-fresh 1953 US, UK, RU, and 1979 US worlds reproduced the live v42 `serializeSave` bytes for those mints. That drop is not an export policy: it discards Native home-region identity.

## Historical reader and writer

v42 `serializeSave` is `JSON.stringify` of `{ format, schemaVersion: world.meta.schemaVersion, savedAt, world }`. v42 `deserializeSave` rejects schema greater than 42, migrates older schemas forward, then `assertCurrentWorldState` checks required fields. It does not whitelist keys.

Consequence: extra `player.homeRegionId` and `world.countryPolitics` survive v42 parse. That is not authenticity. Relabeling a v43 envelope to 42 while keeping those fields is still inauthentic.

Live oracle on the pinned engine, Native-fresh 1953 US projected to schema 42:

| Document | v42 `deserializeSave` then `serializeSave` | v42 `advanceTurn` |
|---|---|---|
| Keep `homeRegionId` `"AL"`, drop `countryPolitics` | byte-identical to input | `"AL"` still present; `countryPolitics` still absent |
| Keep both additive fields | byte-identical to input | `"AL"` still present; `countryPolitics` frozen (phase does not exist) |

v42 never assigns `world.player` wholesale and never reads `homeRegionId`. The extra string is identity, not a simulated gauge.

## Field policy

| Field | Authentic mint | Old reader | Old turn pipeline | Native restore if dropped | Policy |
|---|---|---|---|---|---|
| `schemaVersion` (envelope and meta) | 42 | required; 43 rejected | stamps 42 on write | n/a | Stamp 42 only after the field policy below succeeds |
| `world.countryPolitics` | absent | tolerated extra; not required | not updated | v42 to v43 migration re-seeds from live macro at the current turn (one history sample, instantaneous targets). After a Native turn this is not the eased gauges or the accumulated history | Drop only when re-seed equals the original record. Refuse progressed worlds. Do not smuggle live gauges |
| `player.homeRegionId` string | absent | tolerated extra | unused, preserved | Native migration keeps a present string; `undefined` becomes `null`, which is not `"AL"` | Keep as an opaque extra. This is how Native-fresh identity survives without inventing a v42 mechanic |
| `player.homeRegionId` null | absent | n/a | n/a | migration writes `null` | Delete the key so the document matches authentic v42 |
| All other world/player keys on this mint | present | required | shared simulation | identity | Pass through unchanged |

Reversibility uses structural deep equality on the original parsed envelope versus the `deserializeSave` result of the candidate (array order preserved, record key order ignored, enumerable own keys including `__proto__`, primitives `===`). Native-fresh `createWorld` inserts `countryPolitics` in a different object-key slot than the v42 to v43 migration, so byte identity of the whole schema 43 document can fail even when values match. Extra own keys that restore would drop are refused. There is no numeric tolerance and no gameplay edit.

## Proven projections (SHA-256 of public `serializeSave` at `2026-09-10T00:00:00.000Z`)

Independent old-reader evidence: pinned v42 `deserializeSave` then `serializeSave` of the projected bytes equaled the projection.

| Input | Projection | SHA-256 |
|---|---|---|
| Authentic fixture / live v42 mint | identity | `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc` |
| Native-fresh 1953 US (home `"AL"`) | schema 42, `homeRegionId` `"AL"`, no `countryPolitics` | `f141e9a919d8a6626c53a1ca6c4c9856ec5ccc97410b0a4c2ba8d61ba3aaa320` |
| Same world after `convertCash` 2000 | same shape | `e281fc2736afa82ee26f82d90d541bd17465605d8f5e81123820efe5e7eb91da` |
| Native load of authentic fixture, no Native turn | identity of the fixture | same as mint |
| Native-fresh or migrated world after one Native turn | refused | n/a |

`convertCash` message on both engines: `Converted 2000 cash to 1000 funds.`

Shared remaining fields (everything except the two additive keys and schema numbers) of Native-fresh 1953 US versus live v42 mint matched after `convertCash` and after three turns. That path does not prove arbitrary actions, elections, or later careers.

## Irreducible mechanical differences

**Progressed `countryPolitics`.** After one Native turn on this 1953 US world, US approval history had two samples (turns 0 and 1, eased 56.3 then 54.3) with unrest 10.9. Re-seeding at turn 1 produced one sample at 49.3 and unrest 11.3. Legitimacy happened to match. History length and eased gauges are sequential state. Schema 42 has no equivalent record. Smuggling the object through the old reader freezes it: a further v42 turn left approval at 54.3 with two samples, while Native continued to 54.4 / three samples / unrest 12.7. That is not compatibility of the mechanic. The projector refuses.

**Authentic mint versus Native-fresh identity.** A schema 42 document that carries `homeRegionId` `"AL"` is not the authentic mint. The mint omits the key. Native-fresh export is an extension document the old reader preserved. Re-import into Native restores `"AL"` and re-seeds `countryPolitics` to the same values. Importing the authentic mint still yields `homeRegionId: null` because v42 never selected a home region.

**Relabel-keep-both.** Stamping 42 while leaving `countryPolitics` in place is the already-recorded inauthentic rewrite. The old reader accepts it. Native round-trip can even be byte-identical. It is still not a v42 document: the old engine does not maintain the gauges.

**Engine adaptations after the v42 pin.** Referendum FNV variance and TFP basket inputs changed in this tree after the historical pin. They did not fire on this three-turn 1953 US `convertCash` path. They remain a continuation risk on worlds that exercise those systems.

## Engine API and CLI wiring

`projectSaveToV42(contents)` in `packages/engine/src/save.ts`, exported from `packages/engine/src/index.ts`. `src/game/saveCompatibility.ts` re-exports that function. The local export CLI (`scripts/export-save-v42.ts`) calls the same projector and writes the projected bytes on exclusive create.

Succeeds when:

1. Envelope and meta are already 42, Native `deserializeSave` accepts the document, `countryPolitics` is absent, and `homeRegionId` is absent or a string. The authentic fixture takes this path and is returned byte-identical. A schema 42 document that keeps `homeRegionId` `"AL"` is the Native-fresh **extension** document, not the authentic mint (the mint omits the key).
2. Envelope and meta are 43, `countryPolitics` is present, and Native load of the stripped document (schema 42, `countryPolitics` deleted, null `homeRegionId` deleted, string `homeRegionId` kept) restores the original schema 43 values, including gauges, history, and home region.

This is not full interchange. Progressed `countryPolitics` is refused. Native `serializeSave` still emits schema 43.

Tests: `packages/engine/src/save.v42Projection.test.ts` (engine projector, including key-order and extra own-key cases). App re-export: `src/game/saveCompatibility.test.ts`. CLI spawn: `scripts/export-save-v42.test.ts`.

## Next executable design

1. Add one more oracle-backed action on the same 1953 US world only if the old reader hash is captured the same way. Do not expand into elections until `compactResolvedNpcBallots` is checked on a resolved-ballot fixture; it is a no-op on the unplayed mint.
2. Do not add a keep-`countryPolitics` export. If a later slice wants Native round-trip of progressed gauges, that is a Native-only sidecar or schema 43 file, not schema 42.
3. Other era/country pairs at create already matched v42 mint bytes after dropping both additive fields (UK `EMI`, RU `CAS`, 1979 US `AL`). Certify them with the keep-home projector only after recording their old-reader hashes.
4. In-app / native-slot export and device QA stay out of this slice.

## Commands

```sh
npx vitest run --config packages/engine/vitest.config.ts packages/engine/src/save.v42Projection.test.ts
npx vitest run --config vitest.config.ts src/game/saveCompatibility.test.ts scripts/export-save-v42.test.ts
```

Oracle probe used the pinned v42 engine read-only. No signing, no commit.
