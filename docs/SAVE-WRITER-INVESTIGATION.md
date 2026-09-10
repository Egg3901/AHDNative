# Save writer investigation: reversible schema 42 projection

Evidence for a scoped v43 to v42 writer. Not a silent version rewrite, not AHDGame parity, and not a claim that every Native world can be exported.

## Scope and oracles

| Item | Value |
|---|---|
| Subject tree | AHDNative feature branch based on `b4892fee8a05e155cf9c511264bfdba0c33f996a` |
| Native engine pin | Egg3901/AHDClient@`568c0c039efcca2db17c52b2920747ff05fbd794`, SCHEMA_VERSION 43 |
| v42 oracle worktree | AHDClient reference checkout at `c5017542c860f5f94b7d4b4d5cfea2939b28995d`, sources clean |
| Authentic fixture | `fixtures/v42-1953-US.save.json.gz` SHA-256 `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc` |
| Public contract | `createWorld`, `executeAction`, `advanceTurn`, `serializeSave`, `deserializeSave` |
| Writer (investigation) | Originally `src/game/saveCompatibility.ts` (`projectSaveToV42`) |
| Writer (current) | Engine `packages/engine/src/save.ts` `projectSaveToV42`; `src/game/saveCompatibility.ts` re-exports it; local CLI uses that same function |
| Tests | `packages/engine/src/save.v42Projection.test.ts`, `src/game/saveCompatibility.test.ts`, `scripts/export-save-v42.test.ts` |

The v42 worktree was used read-only. Imported engine, formulas, fixtures, session, and types were not modified for this slice.

## Exact v42 vs v43 document shape

Independent type and save-assert diffs plus live JSON key diffs on the authentic 1953 US fixture:

| Location | v42 | v43 |
|---|---|---|
| Envelope / `world.meta.schemaVersion` | 42 | 43 |
| `world.countryPolitics` | absent | required record, seeded RNG-free |
| `player.homeRegionId` | absent | `null` after v42 migration; a real region id on Native-fresh worlds |

Feature-flag *keys* are the same. The v43 `countryPolitics` turn phase maps onto the existing `governments` flag. `countryPoliticsPhase` only calls `updateCountryPolitics`, which mutates `world.countryPolitics` and does not consume the turn RNG stream.

Live key diff of authentic fixture vs Native `deserializeSave` then `serializeSave`:

- world keys: only `countryPolitics` added
- player keys: only `homeRegionId` added (`null`)
- meta keys: none

That is the whole additive save shape for this fixture. It is not "schema number only." Relabeling a v43 envelope to 42 without dropping those fields is still inauthentic; the old reader tolerates extra keys, which is not compatibility.

## Reversible projection that was proven

Strip rule: set both schema fields to 42, delete `world.countryPolitics`, delete `player.homeRegionId`.

| Step | Strip of Native v43 equals live v42 serializeSave | v42 `deserializeSave` of the strip |
|---|---|---|
| Authentic fixture after Native load | yes, SHA `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc` | yes, re-serialize equals fixture |
| `convertCash` 2000 | yes, SHA `013dfdb2f3491a8638792d46826263520b31bd88cb9ac0ae2abdc4c5f7a8dbe7` | yes |
| After turn 1 | yes, SHA `cb81c0c300c81b16f35d2a3a671b681332d9987aec4fa8156ff1671bd8306d42` | yes |
| After turn 3 | yes, SHA `1884891452d25a4c8501713efa006533324ff15b3fbd5088a0ca1521cdcc3777` | yes (live serialize) |

Native reload of the stripped create/convertCash documents restores the original schema 43 bytes (`ee57dbf8cd58d148d68e5714f6df5c132e8f04812afc734d0e834a30f1444154` after load). That is the reverse of the v42 to v43 migration in `packages/engine/src/save.ts`.

Scripted action messages matched: `Converted 2000 cash to 1000 funds.` on both engines.

## Fail-closed states (exact blockers)

**Native-fresh home region.** `createWorld` for this seed/era/country writes `player.homeRegionId = "AL"`. Dropping it produces the v42 mint bytes, but that discards Character-panel home-region identity. Native reload of a dropped-home-region document would restore `null`, not `AL`. The investigation-time session writer refused that drop. The current engine projector keeps the string as an opaque extra the old reader preserved. That export is a schema 42 **extension** document, not the authentic mint (the mint omits the key). Old-reader SHA-256 of the Native-fresh keep-home projection: `f141e9a919d8a6626c53a1ca6c4c9856ec5ccc97410b0a4c2ba8d61ba3aaa320`.

**Live `countryPolitics` after a Native turn.** `updateCountryPolitics` eases gauges and appends approval history. Re-seeding on a v42 load uses the current turn's live macro, which is not the eased history. Native `deserializeSave` of the strip after turn 1 does not restore the original schema 43 `countryPolitics`. The v42-compatible *subset* still matched v42 continuation on this three-turn path, but exporting it would silently drop national approval, legitimacy, unrest, and history. The writer refuses.

**Relabeled v43.** A schema-number rewrite that keeps `countryPolitics` or `homeRegionId` is rejected as not an authentic schema 42 save.

**Other schema versions.** The writer does not walk v1..v41. Those belong on Native `deserializeSave` first.

## What the writer therefore supports

`projectSaveToV42(serializeSave(...))` succeeds when:

1. The envelope is schema 42, validates through `deserializeSave`, and does not carry `countryPolitics`. `homeRegionId` may be absent (authentic mint) or a string (Native-fresh extension). Byte-preserving identity of the input document.
2. The envelope is schema 43, `countryPolitics` is present, and Native `deserializeSave` of the stripped document restores the original schema 43 values (structural equality: array order preserved, record key order ignored, own keys including `__proto__`, primitives `===`). Null `homeRegionId` is deleted; a string `homeRegionId` is kept.

That covers the authentic 1953 US fixture, `convertCash` on that migrated world before any Native turn, and Native-fresh pre-turn 1953 US as the keep-home extension. It does not cover post-turn worlds. It does not claim those two schema 42 shapes are the same document.

## Gaps (not guessed, not waived)

- Only the committed 1953 US fixture and its `convertCash` continuation were used. Other era/country pairs, late-game careers, and the t95 election fixture were not regenerated or projected.
- Between v42 `c5017542` and Native `568c0c03` many non-test engine files changed. This three-turn 1953 US path still matched after the strip; that is not a proof for arbitrary actions or later turns.
- `compactResolvedNpcBallots` runs on every Native load. It was a no-op on the unplayed fixture; it was not separately certified as identity-preserving after elections resolve.
- The local export CLI is wired to the engine projector through the session re-export. Worker, native storage, and in-app export remain out of this slice.
- No v42 reader import in CI. Old-reader load was demonstrated against the clean oracle worktree during this investigation; public tests use the committed fixture SHA, the recorded migrated convertCash SHA, and the recorded Native-fresh keep-home SHA as independent expected bytes.

## Commands

```sh
npx vitest run --config packages/engine/vitest.config.ts packages/engine/src/save.v42Projection.test.ts
npx vitest run --config vitest.config.ts src/game/saveCompatibility.test.ts scripts/export-save-v42.test.ts
```

Oracle probe used the v42 worktree read-only and the existing gzip fixture. No signing, no Codemagic, no git commit.
