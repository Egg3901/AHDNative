# Save compatibility: authentic v42 interchange

Characterization of public save interchange between the historical v42 engine and this repository's current v43 engine. It is not a downgrade writer, not an AHDGame parity proof, and not a full-suite run.

Pinned v42 source: [Egg3901/AHDClient@c5017542c860f5f94b7d4b4d5cfea2939b28995d](https://github.com/Egg3901/AHDClient/commit/c5017542c860f5f94b7d4b4d5cfea2939b28995d) (`feat(singleplayer): add world controls and feature flags`). Operator checkout used for this run: a detached AHDClient worktree at that commit (`worktrees/v42-engine` under the AHDClient clone). Native engine in this tree is SCHEMA_VERSION **43**. A v43 save with `schemaVersion` rewritten to 42 is not an authentic v42 fixture and was not used as one.

## Run

```sh
npx tsx scripts/validate-v42.ts --v42-root <Egg3901/AHDClient@c5017542 checkout>
```

Requires the pinned v42 engine on disk (separate worktree; do not checkout AHDClient main). Uses the existing `tsx` dependency. Does not invoke `vitest`, sim tests, or a full verify. Caps one run at 120 seconds. One world, three turns. Writes `artifacts/v42-validation.json` (gitignored).

## Provenance

| Item | Value |
|---|---|
| Fixture | `fixtures/v42-1953-US.save.json.gz` |
| Provenance | `fixtures/v42-1953-US.provenance.json` |
| Generator | v42 `createWorld` + `serializeSave` |
| Seed / player / era / country | `v42-interchange-v1` / `Validator` / `1953` / `US` |
| Saved-at | `2026-09-10T00:00:00.000Z` |
| Uncompressed SHA-256 | `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc` |
| Gzip SHA-256 | `18b85c0154f6e115ca57c53a01df794b43b951e0870d5be8b6d2c78df47237a4` |
| Size | 1350193 bytes raw, 110061 gzip |

The live mint from the pinned engine must match that SHA. The envelope is `ahdsolo-save` schema **42**. `world.countryPolitics` and `player.homeRegionId` are absent.

## Contract exercised

`createWorld`, `executeAction`, `advanceTurn`, `serializeSave`, `deserializeSave`.

Fixed inputs match the fixture. Action: `convertCash` 2000.

## Claims this harness supports

| Claim | Result on the recorded run |
|---|---|
| Authentic v42 mint | Passed. Pinned engine SCHEMA_VERSION 42. Envelope and `world.meta.schemaVersion` are 42. `countryPolitics` absent. `player.homeRegionId` absent. |
| Fixture matches live mint | Passed. Gzip gunzips to the mint SHA above. |
| Native loads authentic v42 | Passed. `deserializeSave` migrates to schema 43, seeds `countryPolitics` (DD/RU/UK/US), sets `player.homeRegionId` to `null`. |
| Repeated Native loads are deterministic | Passed. Two independent loads of the same v42 bytes serialize identically, then stay identical through `convertCash`, two turns, reload one twin, and a third turn. |
| v42 reader continuation is deterministic | Passed. Same action/turn/reload sequence on the v42 engine: twin saves match at every step. |
| Honest v43 writer is rejected by the v42 reader | Passed. Exact error: `Save is from a newer version (schema 43 > 42); update the game to load it`. Also true for a Native re-export of a migrated v42 world (now schema 43). |

SHA-256 of `serializeSave` at create and after the third turn:

| Engine | after_create | after_turn_3 |
|---|---|---|
| v42 pin | `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc` | `1884891452d25a4c8501713efa006533324ff15b3fbd5088a0ca1521cdcc3777` |
| Native after v42 load | `ee57dbf8cd58d148d68e5714f6df5c132e8f04812afc734d0e834a30f1444154` | `04dee870ddf455467358c695af0117ba98fa75265cc28ffe889452e34ec368a0` |

Those Native hashes are the migrated v43 document, not the v42 bytes. They are not required to match the v42 pin.

v42 pin `convertCash`: `Converted 2000 cash to 1000 funds.` Native after load: same.

## Safe v42 export

**Not possible without losing v43 fields. No downgrade writer is implemented.**

v43 adds exactly two WorldState fields relative to v42 (`packages/engine/src/save.ts` v42→v43 migration, `types.ts`):

- `world.countryPolitics` (national approval/history, regime, legitimacy, unrest)
- `player.homeRegionId` (optional string or null)

Evidence:

- Native `serializeSave` stamps `schemaVersion` from `world.meta.schemaVersion` (43). The v42 reader rejects that envelope before walking fields.
- A Native-fresh 1953 US world in this tree writes `player.homeRegionId` as a real region (`AL`). A migrated authentic v42 world gets `homeRegionId: null` because v42 never selected one. Those are different player identities.
- Dropping `countryPolitics` discards live gauges and approval history. Dropping `homeRegionId` discards the Character-panel home region. Keeping them is not a v42 save.

Do not waive those mechanics to force an export.

## Expected wrong case (future rejection)

Rewriting a v43 envelope and `world.meta.schemaVersion` to 42 is **inauthentic**. The current v42 `deserializeSave` still accepts that rewrite: `assertCurrentWorldState` checks required fields, not a whitelist, so `countryPolitics` and `homeRegionId` are smuggled through. This harness records that acceptance. It does not treat the rewrite as a v42 fixture.

Future reader/writer policy should reject that case. This tree does not implement that rejection or a downgrade.

## Claims this harness does not support

- AHDGame parity.
- Bidirectional lossless interchange.
- Full action catalog, late-game turns, elections, UI/session/native storage.
- Device performance.

## Recorded run

- Subject tree: [Egg3901/AHDNative@62d750dac36f76c4f089597431e77ef8fae1a3e3](https://github.com/Egg3901/AHDNative/commit/62d750dac36f76c4f089597431e77ef8fae1a3e3) (engine/content unchanged; this harness was uncommitted at run time).
- v42 engine: [Egg3901/AHDClient@c5017542c860f5f94b7d4b4d5cfea2939b28995d](https://github.com/Egg3901/AHDClient/commit/c5017542c860f5f94b7d4b4d5cfea2939b28995d).
- Native schema: 43. v42 schema: 42.
- Wall time: 6151 ms (under 120000 ms). Worlds: 1. Turns: 3. Checks: 23/23.
- `convertCash`: ok on both engines (`Converted 2000 cash to 1000 funds.`).
- Native-fresh 1953 US `homeRegionId`: `AL`. Migrated authentic v42 `homeRegionId`: `null`.

v42 pin steps:

| Step | SHA-256 |
|---|---|
| after_create | `471352be87c8887dcc6ae02f465b898272f62843b5e0861a45138c2de7f58cdc` |
| after_convertCash | `013dfdb2f3491a8638792d46826263520b31bd88cb9ac0ae2abdc4c5f7a8dbe7` |
| after_turn_1 | `cb81c0c300c81b16f35d2a3a671b681332d9987aec4fa8156ff1671bd8306d42` |
| after_turn_2 / after_reload | `f8c9ad9dad127b45a991a8c639732de5bf045d1e6a8d3454224c110441106062` |
| after_turn_3 | `1884891452d25a4c8501713efa006533324ff15b3fbd5088a0ca1521cdcc3777` |

Native after authentic v42 load:

| Step | SHA-256 |
|---|---|
| after_native_load | `ee57dbf8cd58d148d68e5714f6df5c132e8f04812afc734d0e834a30f1444154` |
| after_convertCash | `30e88ad15061ca81081c33583598ac65252b6c497904e6b6a0a977fc0fc2c3d0` |
| after_turn_1 | `348f2f336a3528debdeabec5923a3fbdfa41a4ee520e278f4905e787961446ae` |
| after_turn_2 | `d3b579f13d023cc73bb559320eadafe67c1ce6da8252069f9b58f67d9ebf3469` |
| after_turn_3 | `04dee870ddf455467358c695af0117ba98fa75265cc28ffe889452e34ec368a0` |

Local artifact: `artifacts/v42-validation.json` (gitignored).
