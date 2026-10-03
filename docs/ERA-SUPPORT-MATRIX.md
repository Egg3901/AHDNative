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
| 2019 | US, UK | parties, legislature, regions, budget | 1 | schema 69 round-trip and content identity tested |
| 1960 | none | none | none | migration-only legacy label; new selection rejected |
| 1999, 2007, 2023 | none | no Native packs | none | new selection rejected; no era fallback |

The source is AHDGame `fff42a48a7dd7fd50cbe01124c8164cf9b7f6cb8`.
Its `eraRoster.ts#tierFor` is materialized by
`seedCountryGameStates.ts#seedCountryGameStates` into `enabledForPlayers`,
which the public character-creation route enforces. The authority player sets
are US/UK/RU/DD for 1953 and 1979, and US/UK/JP for 1991, 1999, 2007, 2019,
and 2023. The engine pack retains additional authored country entries for
internal reference fixtures, but the desktop player selector and
`GameSession.create()` only expose US/UK in 1991 and 2019. Japan is source
authorized, but Native does not have its required party, legislature, region,
and budget records for a player start. The raw engine factory remains usable
for internal source fixtures. Playerless worldsim selection stays separate
from character eligibility. The source standalone launcher defaults to an
ordinary player; its `SINGLEPLAYER_ADMIN=1` override is explicitly opt-in and
bypasses the country access check for local admin testing. Native's offline
new-character matrix follows the ordinary-player path. Native does not present
the source's unported 1999, 2007, or 2023 presets as selectable packs.

The separate AHDClient desktop app is a persistent WebView for the online
game, not an offline pack selector. Native's `NewGameScreen` and
`GameSession.create()` are the relevant desktop offline selection boundary.

Selection tests cover every current playable combination and reject unavailable
eras, unknown countries, and preview-only countries. The save test verifies the
selected era/country identity and byte-identical current-schema serialize-load-
serialize behavior. These checks establish pack selection and save identity;
they do not certify all mechanics for each row or compatibility with every
historical save schema.

## Reference-era export status

The AHDGame source has preset IDs for 1999, 2007, and 2023, but these are not
complete reference packs. Its `presetSelector.ts` explicitly falls back to
2019 bundles when a lane is missing, and `historicalSeats.ts#getPresetSeats`
returns the 2020 seat roster for unrecognized preset IDs while recording that
fallback. Such values must not be relabeled as 1999/2007/2023 historical data.
Native currently has a source-provenance US electorate reference export for
selected source anchor years, including those years, at
`packages/content/src/packs/usSourceYearElectorate.json`; it is an electorate
substrate reference, not a complete playable pack or a substitute for the
missing countries, offices, laws, and systems. The missing full pack exports
remain an open part of issue #118.

1960 remains migration-only. Its old save label and calendar migration do not
define an authorized source preset or make a new 1960 world selectable.
