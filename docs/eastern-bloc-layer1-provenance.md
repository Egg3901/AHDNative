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

The focused fixture in `packages/engine/src/elections/easternBlocBackground.test.ts` runs a real `advanceTurn` to produce the election, then explicitly sets `meta.turn` to the source-record activation and close boundaries before calling ordinary `advanceTurn`. It proves nonempty tally, poll resolution, 65 weighted holder seats in Mazovia, the 460-seat PZPR composition after all PL regional races resolve, and save/reload preservation. It does not prove a naturally elapsed 96-turn calendar journey; the untouched-calendar simulation and the source treasury mapping remain separate open acceptance work.
