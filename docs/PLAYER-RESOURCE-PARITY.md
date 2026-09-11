# Player resource parity

This slice implements #30, #31 and #32 against AHDGame
`d4baf899fd8bd529099f03d7410807143604e2e5`. It covers the player refresh and
party-influence paths, not whole-engine parity.

## Reference and behavior

- `src/lib/turn/actionRefresh.ts` and `shared/constants/formulas.ts`: national
  influence gains pre-decay state influence divided by 100, plus the highest
  supported position tier. National influence is uncapped. Native reads actual
  office, formed government, cabinet, party and justice holders; play mode alone
  grants no office. State influence then decays by 0.75%.
- `src/lib/actions/officeActionBonus.ts`, `officeBonusRegistry.ts`,
  `src/lib/constants/countries.ts` and `src/app/api/admin/config/init/route.ts`:
  player AP uses base 4 plus configured office bonuses, with registry fallback.
  Cabinet is counted once alongside the underlying seat. Imported Energy scales
  the cap from 200 to 250 and hoard threshold from 100 to 125, with source
  rounding. Hoarding subtracts 4 before refresh and cap saturation.
- `src/lib/government/commands/appointments.ts` calls
  `getExecutiveOfficeKey(countryId)` without an era override. The generated
  registry exports that same first national executive key. A pending government
  does not keep granting its former holder executive AP.
- `src/lib/turn/partyInfluenceTurn.ts`: decay 4%, base gain 3 times policy
  closeness, source leadership bonuses and logarithmic infamy penalty. The
  bonus-action pool contains Characters only. Native has one local Character;
  NPPs are excluded from that player's denominator. Zero old clout grants no AP
  on the first turn. Party AP is granted later in the same turn, with the same
  Energy cap as refresh.
- Party influence reads the turn's bootstrap Character snapshot, matching
  Game's inputs. In particular, infamy is not read after action refresh has
  already decayed it. Leadership holder queries use current world records.
- Join, switch, found and leave reset party clout, preserving state and national
  influence. Departing holders vacate supported party/caucus positions. A newly
  founded caucus records the player as chair, matching the reference route;
  leaving removes that holder bonus.
- `src/app/actions/actionsConstants.ts` and `src/lib/actions.ts`: Campaign
  changes state influence. Native's manual `investInfluence` exchange had no
  reference action. Its old ID now rejects before costs for every actor; the
  invented execution branch is removed. Passive party grants remain available.

Profile and the footer use the engine's shared resource projections. The AP
breakdown separates office refresh from party grants and shows the gain after
cap saturation. These are projections from current inputs; later changes to
offices, policies or party membership can change the next turn's result.

## Saves and source export

Player `nationalInfluence`, `partyInfluence`, `policies` and `stats.energy` are
optional extensions. Missing legacy values read as 0, 0, neutral policy axes
and Energy 1 respectively. Loading does not materialize missing fields, so
unmodified authentic v42 fixtures retain their byte identity. Present malformed
values reject without replacing the open session. New influence values become
persistent when the owning action or turn changes them.

The schema number remains 43 for this slice. Existing restrictions on projecting
mutated `countryPolitics` back to v42 remain. Preserving these optional player
fields in JSON does not make an old client execute the new mechanics.

Regenerate office data without evaluating Game code or changing its checkout:

```sh
node scripts/export-office-registry.mjs /path/to/AHDGame > packages/engine/src/actions/officeRegistry.ts
```

The exporter parses the pinned TypeScript object and fails on unsupported
shapes. It records the source revision and file hash. Configured bonus values
still take precedence over this generated registry.

## Verification boundary

`src/game/playerInfluence.test.ts`, `playerPartyInfluence.test.ts` and
`packages/engine/src/actions/playerActionRefresh.test.ts` exercise actual
create, action, advance, save and reload contracts. Expectations cover ordinary
characters, supported holders, membership changes, policy distance, pre-decay
infamy, cap saturation, invalid imports and rejected actions. Values are derived
from the reference formulas above, not captured from Native output.

The authentic v42 fixture and recorded convert-cash hashes stay unchanged.
Full device performance and native lifecycle remain separate acceptance gates.

## Remaining related systems

- Full RPG allocation, progression and action efficacy: #48/#91.
- Player policy editing and the profile compass: #87/#50. Imported axes already
  feed the correct influence calculation.
- Central-bank character chair nomination: #119. Native currently has only NPP
  chairs, so no player chair AP is fabricated. Party leadership, coalition,
  tenure, and party-whip behavior are live; congressional chamber leadership
  remains explicitly unavailable until Native has elected-official holder
  records.
- Legacy NPP clout still affects Native's separate PM/internal-election proxy
  algorithms. Its source correction is #144; it never enters the player pool.
- Broader membership/charter costs and lifecycle remain #61/#95. This slice
  corrects clout resets and supported holder cleanup only.
