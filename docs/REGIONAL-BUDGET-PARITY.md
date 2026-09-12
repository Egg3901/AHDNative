# Regional budget support boundary

The Native regional-budget phase is generic for supported playable country
regions. It does not claim to port the country-specific AHDGame JP or DE
processors. Those processors require state policy, regional metrics, and
country-specific fiscal inputs that are not in the supported Native packs.

## JP and DE classification

| Native era | JP | DE | Supported interpretation |
| --- | --- | --- | --- |
| 1953 | economy-preview | economy-preview | Inapplicable to a player save |
| 1979 | economy-preview | economy-preview | Inapplicable to a player save |
| 1991 | economy-preview | economy-preview | Inapplicable to a player save |
| 2019 | economy-preview | economy-preview | Inapplicable to a player save |

The classification follows the pinned AHDGame world-entity manifest: the
post-Cold-War player roster is US/UK while JP and DE are in the economy-preview
roster. Native therefore keeps JP and DE present as economic country records
but rejects them as player starts until their regional budget and political
surfaces are ported together. A player cannot create, advance, or save a JP or
DE regional-budget world in these eras, so no synthetic country-specific
processor or regional balance claim is made.

Authority is AHDGame revision `d4baf899fd8bd529099f03d7410807143604e2e5`,
`src/lib/world/worldEntityManifest.ts`, plus its country-specific
`src/lib/turn/jpRegionalBudget.ts` and `src/lib/turn/deRegionalBudget.ts`
processors.

The pack and engine tests enforce this boundary through the public country
picker and world-creation seams. Supported regional-budget saves continue to
use the generic processor and its existing turn/save coverage.
