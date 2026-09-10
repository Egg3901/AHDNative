# UK career depth

This slice closes the fresh-world UK seat bootstrap gap behind an explicit
historical initialization choice. A standard 1953 or 1979 world otherwise
begins with 625 or 650 vacant Commons seats and no seated NPCs. It does not
claim complete UK career parity.

## Initialization contract

`createWorld` accepts `initialization: "historical" | "founding"`.

- `founding` is the current default and keeps the authored all-vacant Commons
  composition so a deliberate founding election can fill it through the normal
  turn pipeline.
- `historical` is an explicit opt-in. For the 1953 and 1979 packs, it applies
  the AHDGame standard winner-roster fallback to the UK Commons.
- Making `historical` the default remains held for a later app rollout. That
  rollout needs cross-world RNG and replay evidence because the UK politicians
  are generated before the shared creation RNG is captured.
- The policy is an input to fresh-world creation. Save loading does not call
  this bootstrap and does not reseed an existing world.

Historical mode seeds the UK roster in every newly created world that includes
the UK pack entry, including worlds whose player country is US, RU or DD. The
additional politicians consume the existing shared world-creation RNG, so
historical mode changes downstream corporation, bank, union and other seeded
vectors for that world. Omitted initialization retains the prior founding
baseline and its existing replay vectors.

The historical roster is synthetic. It does not assert that these are the
named or actual 1953 or 1979 winners. It follows the reference fallback's
source data and guarantees the configured chamber total:

1. Scale each authored UK region's `houseSeats` to the national Commons total
   with largest-remainder allocation.
2. Allocate each region's seats with the first two default UK parties at
   weight 45 and all remaining default parties at weight 28.
3. Sum the regional results into the national `seatsByParty` map.

For 1953, this produces 141 Labour, 138 Conservative, 90 SNP, 87 Plaid Cymru,
86 Sinn Fein and 83 Liberal seats. The historic Liberal party sorts after the
other valid 1953 parties because the source seed order places it at 11. For
1979, the scaled 650-seat result is
116 Labour, 112 Conservative, 74 Liberal Democrat, 71 SNP, 70 Plaid Cymru,
69 Green, 69 DUP and 69 Sinn Fein seats. The source allocator and its
tie-order behavior are ported from the AHDGame largest-remainder helpers.

Only the elected Commons is filled. The House of Lords and UK Regional Council
remain governed by their authored state. Existing authored compositions are
left alone, so a future real roster can supersede this fallback without being
overwritten.

## First-turn behavior

In explicit historical mode, `advanceTurn` sees seated Commons politicians and
forms the first UK government during the normal government phase. The first canonical
Commons election record may still open for the regular cycle, but the
government remains formed and no vacancy snap election is triggered.

In founding mode, the first turn retains the active empty-seat Commons race
and a pending government. This is the named path for worlds that intentionally
want the founding-election lifecycle.

## Held parity work

The Native engine still models the UK Commons as one national election record.
The AHDGame source has one Commons record per electoral region and an
entry-eligibility home-region gate. Native campaign creation remains disabled
for UK races because the reference campaign eligibility contract defers the UK
statutory expense and electoral model. These are separate future slices. This
change does not add regional constituencies, campaign finance, or a full career
playthrough.

## Evidence

AHDGame reference pin: `e364c04954ed628beef73a993a8e9e156650a31e`. Reference sources inspected:

- `AHDGame/src/lib/admin/bootstrapGameWorld.ts` gates the standard UK winner
  roster to the 1953 and 1979 presets.
- `AHDGame/src/lib/admin/seed/seedEconTierRosters.ts` defines the winner roster
  weights and lower-chamber-only scope.
- `AHDGame/src/lib/seeds/proportionalChamberSeats.ts` and
  `AHDGame/src/lib/sim/backfillMissingSeats.ts` define region scaling and
  largest-remainder seat allocation.
- `AHDNative/packages/content/src/packs/ukRegions1953.ts` and
  `ukRegions1979.ts` provide the shipped region seat inputs.

Focused validation:

```text
npx vitest run --config packages/engine/vitest.config.ts src/ukCareerDepth.test.ts
npm run typecheck --workspace @ahdclient/engine
```

Both commands pass. The focused tests cover the 1953 roster and government
formation, the explicit founding path, and the 1979 650-seat conservation.

The default/explicit-founding test compares complete serialized worlds, not only politicians. A historical save also reloads to the exact complete saved document. The initialization selector is an engine API only in this slice; the player form continues to use the existing default.
