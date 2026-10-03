# Era and country support matrix

This is the current Native offline pack boundary, not a claim that every
system in AHDGame has been ported. The executable copy is
`packages/content/src/supportedMatrix.ts`; tests compare it with the actual
pack registry and verify required content records.

| Era | New-character countries | Required records present | Pack version | Save contract |
| --- | --- | --- | --- | --- |
| 1953 | US, UK, RU, DD | parties, legislature, regions, budget | 1 | schema 69 round-trip and content identity tested |
| 1979 | US, UK, RU, DD | parties, legislature, regions, budget | 1 | schema 69 round-trip and content identity tested |
| 1991 | US, UK | parties, legislature, regions, budget | 1 | schema 69 round-trip and content identity tested |
| 1999 | US, UK | parties, legislature, regions, budget | 1 | schema 69 save identity tested; source budget/party outputs; disclosed 2019 state lanes and 2020 seat fallback |
| 2007 | US, UK | parties, legislature, regions, budget | 1 | schema 69 save identity tested; source budget/party outputs; disclosed 2019 state lanes and 2020 seat fallback |
| 2019 | US, UK | parties, legislature, regions, budget | 1 | schema 69 round-trip and content identity tested |
| 2023 | US, UK | parties, legislature, regions, budget | 1 | schema 69 save identity tested; source 2023 US state/demographic lanes; disclosed 2019 non-US lanes and 2020 seat fallback |
| 1960 | none | none | none | migration-only legacy label; new selection rejected |

The source is AHDGame `c35bcd86cbdbb877e73a0e9a45b0726605bdbc7a`.
Its `eraRoster.ts#tierFor` is materialized by
`seedCountryGameStates.ts#seedCountryGameStates` into `enabledForPlayers`,
which the public character-creation route enforces. The authority player sets
are US/UK/RU/DD for 1953 and 1979, and US/UK/JP for 1991, 1999, 2007, 2019,
and 2023. The engine pack retains additional authored country entries for
internal reference fixtures, but the desktop player selector and
`GameSession.create()` expose US/UK for the post-Cold-War presets. Japan is
source-authorized, but Native does not have its required complete player
systems. The raw engine factory remains usable for internal source fixtures.
Playerless worldsim selection stays separate from character eligibility. The source standalone launcher defaults to an
ordinary player; its `SINGLEPLAYER_ADMIN=1` override is explicitly opt-in and
bypasses the country access check for local admin testing. Native's offline
new-character matrix follows the ordinary-player path. Native does not present
the source's unported JP player lane as selectable.

The separate AHDClient desktop app is a persistent WebView for the online
game, not an offline pack selector. Native's `NewGameScreen` and
`GameSession.create()` are the relevant desktop offline selection boundary.

The public `GameSession` matrix test creates every current ordinary-player
era/country pair, saves and reloads it, and compares party, region, chamber,
era, and country identity plus byte-identical serialize-load-serialize output.
Unavailable eras, unknown countries, and preview-only countries are separately
rejected at the public selection boundary. These checks establish pack selection and save identity;
they do not certify all mechanics for each row or compatibility with every
historical save schema.

## Reference-era export status

The AHDGame source has preset IDs for 1999, 2007, and 2023, but its preset
outputs contain lane-level fallbacks rather than complete year-specific
reference bundles. Its `presetSelector.ts` explicitly falls back to
2019 bundles when a lane is missing, and `historicalSeats.ts#getPresetSeats`
returns the 2020 seat roster for these unrecognized preset IDs while recording
that fallback. The 2023 US description names a genuine 118th-Congress/2023
state-data lane, while non-US countries fall back to 2019. Such values must not
be relabeled as 1999/2007/2023 historical data unless the individual source
lane explicitly supplies that year.
Native ships selectable US/UK packs for all three years. Japan remains
unavailable to new characters because its complete player systems have not
been qualified. The source-provenance electorate reference export at
`packages/content/src/packs/usSourceYearElectorate.json` is supporting data,
not the pack itself. The generated source outputs below feed the playable
pack assembly, with each source or fallback lane recorded in pack
provenance. This establishes creation and save identity for the stated
matrix; it does not establish every era-specific mechanic or earned election
outcome, which remain open verification dependencies for issue #118.

The independently generated `sourceReferenceEraOutputs.json` records the
actual `getPresetSeats()`, `getNationalBudgetSeedConfigsForPreset()`,
`getInitialRatesForYear()`, `partySeedsForPreset()`, and player roster output
for 1999, 2007, and 2023. Source returns the same 1,007-row 2020 seat table for
all three and logs a preset-specific fallback each time. The budget producer
returns 16 rows per preset; the US 1999, 2007 and 2023 GDP rows are year-specific,
while inherited rows preserve their source fiscal year. Runtime-generated
`lastUpdated` values are represented by a stable marker in this static export.
These outputs feed shipped US/UK-selectable Native packs. Every lane retains
its actual source or fallback identity in `SeedPack.sourceProvenance`. The
reproducible exporter and pinned source revision are recorded in the artifact.

The 2023 source preset uses its US 118th Congress state data, state census
demographics, FY2023 budget and current/default registration lane. Native wires
those US rows into the 2023 pack and year-specific electorate map. UK and other
regional lanes explicitly retain their source-declared 2019 fallback; all three
presets use the logged 2020 legislature fallback. The generated budget rows
preserve each country's `sourceFiscalYear`, including inherited rows. A source
budget config has no unemployment field, so Native retains its documented 2019
baseline for that metric. The pack advertises required records and stable
creation/save identity; it does not certify every era-specific mechanic or
earned election outcome.

1960 remains migration-only. Its old save label and calendar migration do not
define an authorized source preset or make a new 1960 world selectable.
