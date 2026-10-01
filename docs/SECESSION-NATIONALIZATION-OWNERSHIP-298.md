## Current source authority gap

#298 remains open and partial after merged [PR #714](https://github.com/Egg3901/AHDNative/pull/714).
Current Game `cb66acdf` seats an SP president in canonical elected officials or an
SP parliamentary head of government through its singleplayer government formation.
Its nationalization route recognizes those sitting leaders without a newly won
election. Native's merged ownership gate rejects SP/permanent holders, and some
SP parliamentary worlds lack the corresponding canonical government record.
The full source authority criterion is therefore unchecked until creation,
continuation, action projection and normal save/reload preserve that authority.
The career-holder and secession/conservation evidence below remains bounded proof.

# Corporate ownership through nationalization and secession (#298)

This checkpoint records the bounded Native port for the complete #298 acceptance sentence: corporate ownership/state partition effects for nationalization and referendum secession fan-out, separate from unowned revenue pools, with conservation and save/reload evidence.

## Source behavior

The sector fan-out implementation is pinned to public AHDGame `01797b27082b098fdf3929bb498215c94c8dda24`, specifically the source Scotland and Wales region seed vectors and `secede/apportion.ts` greedy `partitionByGdp` behavior. The source event partitions rows that already carry the seceding parent region ID. It does not carve a share from the national aggregate when secession occurs.

Native begins with country-level corporate and unowned records. For a new UK world, `sourceRegionalSectorSeed.ts` materializes pre-event Scotland and Wales parent rows using the per-sector source-market receipt proportions computed from the pinned Game `computeUnownedSeedRevenue` vectors. The remaining amount stays at national scope. This is a seed adapter for Native's aggregate model; event-time fan-out only reassigns those already-scoped rows. The source ratios are recorded for Native's 1953, 1979, 1991, and 2019 presets.

Plant output stock, paid capacity book, prior produced and sold units, and realized receipts divide with the same source parent-receipt shares. The sold fraction and per-commodity fill fields remain ratios; multiplied by the divided produced units, their source sales totals remain conserved. Nationalization transfers these fields with an asset and adds them on same-place collision, with output-weighted sales ratios.

After leaf materialization, the source secession pipeline promotes a GDP-weighted share of the source country's national budget to the new sovereign. `promoteSecededBudget.ts` ports that prerequisite so a player rehomed to Scotland or Wales can continue through Native's normal national projection. It uses the post-fan-out authored regional GDP sums, scales extensive budget fields on both countries, copies intensive rates/factors, and does nothing on reload after the target budget exists.

## Acceptance evidence

- `nationalizeCorporation` is part of the public action catalog and `executeAction` path. The `ActionsHub` saved-journey test seeds a source-shaped US presidential result through `applyPresidentialResolution`, confirms the recorded player winner is the sitting executive, loads the save into `GameSession`, selects a live eligible distressed issuer in Executive, and invokes the public action from the rendered control. It then verifies the dissolved private identity, the state-owned National Corporation, the source 15% revenue transition haircut, and the unchanged unowned pool before and after save/reload. Engine tests also reject missing elected authority and permanent HOS identity.
- Passed independence actuation expands only Scotland or Wales and moves the already-scoped corporate rows and unowned-pool rows as separate collections. It uses the source greedy GDP partition for the exact authored leaf regions, preserves row identities and totals, reparents the issuer/region fields, and rehomes parent-level player/electorate/turnout references to the source capital.
- Expected parent-to-leaf assignment vectors in the tests were generated independently by calling the pinned Game `partitionByGdp` on the same saved Native parent rows. Scotland's corporate bins are GLA `{energy, extraction, media, real_estate}`, LOT `{manufacturing}`, HIG `{financial, logistics}`, GRA `{agriculture, automobiles, retail}`, TAY `{construction, telecommunications}`, STH `{defense, entertainment}`, CSC `{chemical_industries, healthcare}`. Wales' corporate bins are CDF `{agriculture, entertainment, manufacturing}`, SWA `{defense, energy, financial, healthcare}`, VAL `{extraction, media, telecommunications}`, MWA `{logistics, retail}`, NWW `{automobiles, construction}`, NEW `{chemical_industries, real_estate}`. Wales' unowned bins are also independently pinned in the test.
- `src/game/secessionSectorOwnership.test.ts` exercises public `GameSession` commands from a saved UK game. A resolved Commons-seat fixture is produced by the source election resolver, then the live session accepts `requestReferendum`, runs campaign and poll turns, projects the active Westminster consent bill, accepts the player's `voteOnBill` command, processes the normal bill lifecycle, and completes actuation through `advance`. It verifies regional ownership plus distinct corporate/unowned receipt and plant-ledger partitions, saves and reloads the result, and compares the successful actuation against a same-turn failed-consent control so ordinary turn economics are not mistaken for fan-out gains or losses. The integration fixture shortens only the persisted campaign close, consent voting deadline, and executive deadline to one turn each; the source 48-turn campaign and 24-turn consent windows remain covered by their lifecycle tests. No private actuation helper or direct successful consent-state mutation is used.
- Nationalization tests cover first creation, same-location National Corporation collision, saved ownership and unowned-pool separation, plus refusal without recorded elected authority and refusal in HOS mode.
- `promoteSecededBudget.test.ts` checks the independently calculated 20/80 GDP split over authored post-fan-out regions, conserved national GDP/revenue, copied intensive budget fields, and idempotence.
- Targeted checks passed after mainline integration: engine fan-out, budget-promotion, plant production/capacity, corporate acquisition and physical-ledger merge, labour, subsidy, and nationalization tests (10 files, 55 tests); GameSession public referendum/consent/turn/save journey (1 test); ActionsHub nationalization tests (2 targeted tests); and save compatibility (10 tests). MarketsPanel + ActionsHub UI checks passed 70/70 before the final nationalization reload assertions; the focused ActionsHub rerun verifies the final nationalization assertions on the integrated mainline head.
- The merged mainline v42 compatibility regression uses the historical exportable save fixture for identity projection and keeps live `regionalMetrics` refusal coverage separate. Full repository validation remains required at the integrated head before closure.

The bounded checks used the isolated worktree links `node_modules/@ahdclient/{engine,content}` and a worktree-local `TMPDIR`; no shared main dependency links or caches were changed.

## Source data note

The pinned Game source contains different authored totals for the UK aggregate/parent GDP and the Scotland/Wales leaf GDP sums: the Scotland parent is 1,500 while its leaves sum to 163,000; the Wales parent is 630 while its leaves sum to 74,000. Native preserves those literal source values. The ownership and unowned-pool conservation checks are independent of GDP conservation; leaf GDP is used only where the source fan-out uses the authored leaf weights.
