# Eastern Bloc Layer 1 election demographics provenance

This note records the source basis and limits for the Eastern Bloc background-election demographics added in `easternBlocLayer1.ts`.

## Source and export

The source oracle is AHDGame commit `b769e1141f0c0b8aa55f48fe45c8f2e1025a0ea6`. The same relevant inputs are present at `283fa48a53e0efa856510e44acb9714ec43875c2`: `git diff --name-only b769e1141f0c0b8aa55f48fe45c8f2e1025a0ea6 283fa48a53e0efa856510e44acb9714ec43875c2 -- 'src/lib/countries/*/data/*Census*' src/lib/seeds/international src/lib/seeds/shared/easternBlocModel.ts src/lib/admin/seed/seedEasternBloc.ts src/lib/admin/seed/seedEasternBlocStatePartyOrg.ts` returned no paths. The source files were also byte-checked against the b769 tree; for example, `easternBlocModel.ts` hashes to `a6a01d841a9dbab3e88952ccc870cf5b3d22ce271dbb5a1ecf81b0c171205c3b` and `seedEasternBloc.ts` to `932f29088a2230366b27ac1f53e26790664ecbfaaf46b6b82f14294369c565c5`.

For each of PL, CS, HU, RO, BG, YU, UKR, BLR, and BAL, the source `src/lib/seeds/international/{pl,cs,hu,ro,bg,yu,ua,blr,bal}.ts` chooses the 1953/1979 census bundle and calls the shared `makeEasternBlocModel`. `getCountryLayer1Model` plus `buildModelRegionDemographics` in `src/lib/seeds/international/index.ts` and `derive.ts` produce the rows. The shared category composition/lean definitions are in `src/lib/seeds/shared/easternBlocModel.ts`; country census inputs live in `src/lib/seeds/{pl,cs,hu,ro,bg,yu,ua,blr,bal}/*RegionCensusData*.ts`. The regular world seed consumer is `src/lib/admin/seed/seedEasternBloc.ts::seedEasternBlocCountry`, which calls the model builder for each region. The separate `seedEasternBlocStatePartyOrg.ts` producer sets `partyId` from the country profile's `seqId` and registration equal to organization.

The archived source snapshot is `/tmp/ahdgame-source-b769`. The export harness `/tmp/export_eastern_layer1.cjs` loads the AHDGame seed modules through TypeScript transpilation and strips only nondeterministic `lastUpdated` fields. Its pinned-snapshot variant was produced and checked with:

```sh
sed 's#/root/projects/AHDGame/src#/tmp/ahdgame-source-b769/src#g' /tmp/export_eastern_layer1.cjs > /tmp/export_eastern_layer1_b769.cjs
node /tmp/export_eastern_layer1_b769.cjs > /tmp/eastern-layer1-source-pinned-b769.json
```

The JSON is 65,963 bytes with SHA-256 `6799f9408a8125b4a6dcba1d3afa734fe176e102e09fcdb6751c85214e179575`. Parsed rows from that export compare exactly equal to the committed static table. Its per-country row hashes (SHA-256 of compact JSON in source property order, UTF-8) are:

The 18 raw census input file SHA-256 values at b769 are listed here; `old` is the 1953 bundle and `current` is the 1979 bundle selected by each model:

| Country | 1953 census SHA-256 | 1979 census SHA-256 |
| --- | --- | --- |
| PL | `2d7afa4412eb597faee03125b3c518f39802f290e8e1836c051eef8c797336ec` | `0922f9bc6e2971723a390d10b0a5036c94d21dd5214c63536f7f11b376ed8ea3` |
| CS | `1f9f5c9da434f44d19292f156042a0236c332e0fb57aade83c05483416a42821` | `4aef207a9b9ec26195f63990b8f263f3f48ff64c2b83bca9dcdf17235b34f059` |
| HU | `fae9b8f28b6a9c0fb9d29f1b8f8171a5c6db46514238762dd3adb8766bbb49ed` | `fc579dba5b7d09b94dfd0a4a7c8adb26753b0e7abe1393e44526d10d3a2b7474` |
| RO | `a0e61ceb6d22443d739733a494f0897bafd9ce39f58344c9fed0e107eb2b18bc` | `95e6552547452a83a9980a85c4fe6276d7e0ae9ba5ca3563654c9b35bd474604` |
| BG | `dd3aac74fc77c8e3f94d2736ff8b2e320162d1c5a4e6b37cfdde8a52f91feb97` | `da9b24648729ea2b2268abcbacd430d632f745e203d19d4b7f184c8593003f2a` |
| YU | `a6bdb0205448e48863e8fe4c4d3139c18aea2a4386bebf43346385aa82516b35` | `673afe0a52f277b5de30902d104c4fc323d4f25b21a957945923e01e5a578832` |
| UKR | `c3ba6801139cce65503edaa422f3074cefe0e36befd37ee7a1ba38f27f751154` | `185033c23366966c46f4dcfd0b09e29894235a689c8b25d0ce76813dccc9e00e` |
| BLR | `0f12cc59a1dd8045346fafc56771b0c3ffab701e3bbb28342bb7f1b669a73200` | `8ae1fcd34e4da263cc461d58e4ed45957be455eaad57886c2a8aa5fe8831e198` |
| BAL | `74074476f3bddaecd6692a473a52f6d8b1f32ff5e75f40b725d6bcfd5e92b812` | `75b7b906b9f99d6541b6f49071df181db09cb11f6d653e8de42118dd3f9e16a8` |

| Era | Country | SHA-256 |
| --- | --- | --- |
| 1953 | PL | `b0616329cf05bbfee9e6248934720b60dd5750a90539726d34a1387dab2a88db` |
| 1953 | CS | `d56c3c26a1d4ab5853411e667e9d470867ec455d8043a4b4fc0caf61e0a5d35e` |
| 1953 | HU | `9c425210611f67048c12d928649e2d57a6b19400e4e3159abef381dcf4249ce2` |
| 1953 | RO | `18a305ee8e60fad79c4c1e12c68a633c2d37917dd774e8942338150dbdcd19f7` |
| 1953 | BG | `15dd1f1a622fad7034b14046cfb8308e7ad941c9a82f3c2cbbae9412c7ae3539` |
| 1953 | YU | `62c06345911e69a2a72aaf6aff312723c5d205a2a76fc2ca709fe5fb1efeeaa0` |
| 1953 | UKR | `2d749d1b4864a206def9c9317032833768e90a9be9b579ba724f0ef66686de00` |
| 1953 | BLR | `0b2c8abd2204673b224fcb34ebd4ea2cf8833cc3a152b47bca83d572b11595d3` |
| 1953 | BAL | `9da165dbc3f26893d07c142271dbf8a6dbd02a76efccf11a59fcb0243e0878af` |
| 1979 | PL | `7e10b94bd6969460bbb8a407bc541afa45a5e73d6f23dd934c6cd44e9860756b` |
| 1979 | CS | `a35c669bcf52b75eaeb4c6ffe158a837ea23b4f31e6380b5c023e131d30e8963` |
| 1979 | HU | `55706e05f0703871f55c6ac81dd1ab93050777157cff8401c61f3f192d79d32d` |
| 1979 | RO | `12753045ccf7ac91240cc8e262a0da19d5da7e650d0c1cce648750fd07fad23a` |
| 1979 | BG | `3ce97058c6d1cf64d525790e929c494b23d66369b1d6c689c22403d086eada90` |
| 1979 | YU | `a829c7fcb36daabcc4d644055df02a028e2ba146b8150d3fc23b5641258196a1` |
| 1979 | UKR | `a25d7ff95df5f3235bb45a49b0108d87be5fd2e55b6985dbfae15052c655ebdc` |
| 1979 | BLR | `08e382846114022a969ca3e7d528c6b7ffb4075f824a54912eb18433687b2f29` |
| 1979 | BAL | `7ccd32a7f2b15f24af8d3d8f5798432427311bc45184ff43b42f5c417f8ff201` |

## Party and demographic mapping

The source roster is one ruling party per background country in both eras. HU changes from MDP in 1953 to MSZMP in 1979; RO changes from PMR to PCR. The other authored identities are PZPR, KSČ, BKP, SKJ, KPU, CPB, and the shared CPSU Baltic organization. Native retains the country/era names and abbreviations, ruling status, and authored ideology. In particular, HU is `−4/+2` in 1953 and `−3/+1` in 1979. The source's party identifiers are sequential database identifiers, so Native uses its own stable IDs rather than pretending those generated IDs are cross-save source constants.

Source categories are `pl_voterGroups`, `cs_voterGroups`, `hu_voterGroups`, `ro_voterGroups`, `bg_voterGroups`, `yu_voterGroups`, `ua_voterGroups`, `blr_voterGroups`, and `bal_voterGroups`. The six group definitions and their default leans come from `makeEasternBlocCategories`; region-specific population shares, leans, turnout and category weights are copied from `buildModelRegionDemographics`. No generic electorate fallback is used for these background regions.

The source `StatePartyOrg` rows also carry era-specific regional treasury balances. Native currently has no regional-party treasury field; this implementation does not map those balances into unrelated national party treasury. Regional treasury equivalence remains open.

## Native proof boundary

`seedDemographics` now consumes the region rows through existing `WorldState.stateDemographics` and `demographicCategories`; no new persisted field or schema version is introduced. Content validation checks category identity, category weights, all six group identities and values, and the 100% regional group share (allowing source rounding).

The focused fixture in `packages/engine/src/elections/easternBlocBackground.test.ts` runs a real `advanceTurn` to produce the election, then explicitly sets `meta.turn` to the source-record activation and close boundaries before calling ordinary `advanceTurn`. It is boundary evidence for nonempty tally, poll resolution, weighted holders, composition, and save/reload; the separate natural-calendar harness below proves the ordinary 96-turn journey. The source treasury mapping remains open.

## Natural-calendar continuation and distributor replay

The excluded-by-default harness `packages/engine/src/elections/easternBlocNaturalJourney.sim.test.ts` now covers the untouched-calendar journey separately from that boundary fixture. From a new 1953 US world at turn 0 it uses only ordinary `advanceTurn` calls. At turn 48 the PL_MAZ record is active in its primary period (`primaryEndTurn=72`), so general tally is still zero. The harness saves at that exact state, reloads it, checks identical RNG and byte-identical save→load→save using a fixed timestamp, then continues ordinary turns through resolution at turn 96. It verifies nonzero votes, the seven weighted regional holders totaling 65, and 460 seats in the resulting PL chamber before and after a final save/reload.

The optional environment variable `AHD_EASTERN_BLOC_NATURAL_TRACE_PATH` retains the 24 non-persisted distributor input snapshots from general turns 73–96 without embedding an ops path in the test. The accepted run used seed `eastern-bloc-natural-1953-source-journey-01`; the 246 KiB trace is `/tmp/eastern-bloc-natural-inputs-d52a85cf.json`, SHA-256 `f5e54b307897cacd0454859db0c2189b09f30a7765d6f9aadb49fbda9123377c`.

An independent read-only harness replays each captured distributor input through source `distributeVotesBySwingFlow` from the pinned b769 source snapshot. The pure distributor and its imported formula modules have no changed paths from b769 to 283. All 24 turn outputs match Native exactly for votes and shares. Result JSON: `/tmp/eastern-bloc-source-distributor-replay-d52a85cf.json`, SHA-256 `7e3444001d446902bb0d8b1fe633762e15c02883a02905974f40ad2d61dd926f`; zero differing candidates across turns 73–96. This proves source formula parity for the exact recorded Native-built distribution inputs. It does not prove parity of full source candidate enrichment, upstream tally-input construction, or source allocator/resolution; those remain outside this slice. The targeted journey completed in 103.58 seconds of test time (120.93 seconds wall including startup) under a 240-second OS bound.
