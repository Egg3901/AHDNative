# Supported-world replay validation

Characterization of the public engine contract already imported into this repository. It is not a test-first implementation of the engine, not an AHDGame parity proof, and not a full-suite run.

Pinned import source: [Egg3901/AHDClient@568c0c039efcca2db17c52b2920747ff05fbd794](https://github.com/Egg3901/AHDClient/commit/568c0c039efcca2db17c52b2920747ff05fbd794). Current save schema is **v43**.

## Run

```sh
npx tsx scripts/validate-worlds.ts
npx tsx scripts/validate-worlds.ts --oracle-root <Egg3901/AHDClient@568c0c039efcca2db17c52b2920747ff05fbd794 checkout>
```

Requires `npm ci` once. Uses the existing `tsx` dependency. Does not invoke `vitest`, sim tests, or a full verify. Caps one run at 120 seconds. Local twins use one worker. Passing `--oracle-root` starts a second read-only process against the pinned original engine (max two workers). Writes `artifacts/world-validation.json` (gitignored).

## Contract exercised

`createWorld`, `listEras`, `listPlayableCountries`, `executeAction`, `advanceTurn`, `serializeSave`, `deserializeSave`.

Combos are derived at runtime from `listEras()` × `listPlayableCountries(era)`. This import has **21** playable era/country pairs (the expected count matched).

Fixed inputs:

- seed `world-validation-v1`
- player name `Validator`
- save timestamp `2026-09-10T00:00:00.000Z`
- action `convertCash` at 2000 when starting cash is at least 2000, otherwise `floor(cash / 2)` if cash ≥ 2

Per combo:

1. Seed two independent worlds.
2. Hash the raw save.
3. Run `convertCash` with the amount above; record the engine result.
4. Advance two turns.
5. Serialize, deserialize one twin, leave the other live.
6. Advance one more turn.
7. Require byte-identical `serializeSave` output (and SHA-256 of that UTF-8 string) at every step.

## Claims this harness supports

| Claim | Result on the recorded run |
|---|---|
| Same-engine determinism across all 21 derived combos | Passed. Twin raw saves matched at every step. |
| Save/reload is lossless at the two-turn checkpoint | Passed. `after_reload` hash equals `after_turn_2` on every combo. |
| `convertCash` is universally valid on a fresh world | Passed. Every combo started with cash 10000, converted 2000, result `Converted 2000 cash to 1000 funds.` |
| Future schema is rejected | Passed. Schema 44 against engine 43: `Save is from a newer version (schema 44 > 43); update the game to load it`. Built by bumping a live v43 save, not a committed fixture. |
| Corrupt / unparseable / wrong-format saves are rejected | Passed. Missing `world.countries` → `Not a valid save file: invalid world state`. `{not-json` → `unparseable JSON`. Wrong format marker → `wrong format marker`. |
| Imported engine matches pinned original AHDClient engine | Passed. 126 step hashes (21 combos × 6 steps) matched [Egg3901/AHDClient@568c0c039efcca2db17c52b2920747ff05fbd794](https://github.com/Egg3901/AHDClient/commit/568c0c039efcca2db17c52b2920747ff05fbd794). |

## Claims this harness does not support

- **AHDGame parity.** Not measured. Same-engine twins and AHDClient oracle match are reported separately. Matching the pinned historical client engine does not prove current AHDGame mechanics.
- **Authentic v42 load.** No historical serialized v42 save is in this tree. [Egg3901/AHDClient@c5017542c860f5f94b7d4b4d5cfea2939b28995d](https://github.com/Egg3901/AHDClient/commit/c5017542c860f5f94b7d4b4d5cfea2939b28995d) is SCHEMA_VERSION 42, but this run did not mint a save from that engine. A current v43 save with `schemaVersion` rewritten to 42 is not an authentic v42 fixture and was not used. Bidirectional v42 interchange remains unproven.
- **Full action catalog, late-game turns, elections, or UI/session/native storage.** This is a three-turn contract smoke across supported worlds.
- **Device performance.** Linux process timings only.

## Recorded run

- Subject tree: [Egg3901/AHDNative@16e4c9a829eea425139bd083e9df46d8c1737c19](https://github.com/Egg3901/AHDNative/commit/16e4c9a829eea425139bd083e9df46d8c1737c19) (engine/content unchanged; this harness was uncommitted at run time).
- Schema: 43.
- Wall time: 87193 ms (under 120000 ms). Oracle worker 86982 ms. Workers used: 2.
- `convertCash`: ok on 21/21 combos.

SHA-256 of the exact `serializeSave` string at create and after the third turn:

| Era | Country | after_create | after_turn_3 |
|---|---|---|---|
| 1953 | US | `922052c14dd44d78d0c884f26317b604437770e429e78429ea14117e7394ad9a` | `4b14581460e5e5d881b2075756f47deb1ecc4bf00044d24c1f1070605c16de44` |
| 1953 | UK | `71615f89bcb5467ed05f1ce4bbbe1f46f5888ee53edc310112fc4e00f89166d6` | `282b9647bf3da6b9f45eecd43a168644c1ca87aa2ec2f88e5e81f8728386af11` |
| 1953 | RU | `f1d79e35cd0292ee019fda2040e97c60e6c690afe57b17e2ba6621d3d4c26913` | `e33c615c1d26c90180e2c43b0b6a52a8ce0b6c19b3076ed17489b0357f3c6428` |
| 1953 | DD | `a5e8803a650b195bf11bb67ccda1e5f8418ff33c738363a112ba5241d6b8654e` | `8924355d02e91f8591b4a26283d19e6ceb46c4e6dc38c8c1b8f15d8010d019f7` |
| 1979 | US | `f6c7535f53daa9408c9c9177306cab014551484205db8e550bf4b22de09a6743` | `8cbc9f65d356ce68c024044e891888aa4796e1d502f8e6dccd4da3dbc803a0cf` |
| 1979 | UK | `01f188af83fc0a04a58eee00425505833367e015f029906da41913af7a862a61` | `f01d1483263d9596b9d1f39c8e991724bc67d7e740e3f108e0f520b5a2c50386` |
| 1979 | RU | `1da34676cda96e61b01f0253e59f7b101f0c38f82002da30072f4fec4b7abdec` | `be9f2906106548f9efb22ffebb80f946665f79aae997385abae9bb0287c3fd4d` |
| 1979 | DD | `d6d8b8533d3508a1d16292d85d04868356ae17c73b30d6aa89cffc65164d7ca3` | `7f488c3d28e5c7c54db4e822110f88e5510ad48e5bc097f201f980363acba1e1` |
| 1991 | US | `ba3b1ac5ca5ee8fe5bfbf55c7e4e725629b5e203c12184789be85327979b600d` | `333ab952a0364e5f8b6d74b8a039ed2dcca4a7739198785a78ea7b353019cf89` |
| 1991 | UK | `8de4dc4765475c8a1b26c6e2620124fd7c9876de60a3dd5f0cc27a0f1bafc567` | `e726a94a40c2c36ec1d82a4f35fe1b98c1f389401a421b22a68dd608058e02ac` |
| 1991 | JP | `9ed510eeaef5e430b5ac99a9b2d85c9b0ed383af5682e5a9d957f3f4f76e199b` | `1255b07fb4ac444320e4c168e18bc3634b93fca6e6495171c1dc017b2efc98a7` |
| 1991 | DE | `0d79286d2a0e04a1041006ed86d5b858343c702e9e3573dfe03ffebfee3630fa` | `c4a9bc6855d5aaa4d6fe76f26d9f5cbe91dc574fae56b106f767eb808d131568` |
| 1991 | IE | `bba39f3083d8d5603f86299a8c5657d073e88650c82b9913506efe4affa455a5` | `51bd7b7d7ad31d234bd5cf1b691fb7422511a2211cf014b97c114a897de8c0a2` |
| 1991 | BR | `a3c645579d7ddeb3ff5ca864f0cb6fc72badd46158067b5002529a91efad08a7` | `cb77a1206ed53e065271d16f8270598f4a16389633293df35d650214500ff323` |
| 1991 | CN | `45fbbe6c59f9cf50ea283b10276e33cb88130335f110fdde2b075da75fcd4664` | `8ff2534c7205f24ef1d2f895367413dcded6c926baec22c99c98ebef08186c09` |
| 2019 | US | `d07319c8e6b20141356b3a02a50622a6339b80b1ff71b16f92aa7817a483a68f` | `a0009e59cddd5ea0e3b02992ef344af16bf22a97e14205d5b63df1d32a5fd4e6` |
| 2019 | UK | `d6eb885c7aa181086dc6a2ad5ce27191bfe349f9ec980eab624e9f7d835817c5` | `8536db4ad8363f478b997cf1efca3e8b86d4774b04bd5e10c724694db10af57f` |
| 2019 | JP | `ba13dcde46b00449c79318e91f10fd4a44255899e2f47b241bed32012352d22b` | `dbab51e6fc35b636e69e1a6ab384c486d64e4b15b8e07376345a027a44519ac7` |
| 2019 | DE | `ab6d2bf47ff5d8266ba18425efe3f701a7ccde93ae29c3b03bba6822ca2d48b6` | `fe0f592eb35415d005e8e391a9af8daf5287923d5d6adf7e4f7d3e5022b2b8db` |
| 2019 | IE | `b3c33167507857e0998ae2fcf8ecfd9e4c6d0dceb3c5904c6e5dee4356745625` | `4f8f5b90db77411fbb2767679724f44bfeca90f313e9ad91223cb69230109e18` |
| 2019 | CN | `bb6060fafd099b69ab828e295d79e3291219feeb733c26b356f13f11a63cc869` | `214c6cae22844b42391c21ab12792bf3138f1f501ceae625402db7ca071a19f9` |

1991 and 2019 combos cost about 5.0-5.8 s each on this host; 1953 and 1979 about 1.9-2.3 s. That is why the oracle comparison has to overlap the local twins to stay inside 120 seconds.

Optional authentic v42 input, if one is later obtained from the v42 engine commit above: `--v42-fixture path/to/envelope.json`. The file must already have `schemaVersion: 42`. The harness will not relabel a v43 save to satisfy that probe.
