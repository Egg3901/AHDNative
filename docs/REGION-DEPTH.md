# Region directory and detail slice

This slice adds a read-only region directory and one selected region detail
view. It is intentionally detached from `WorldState`: `projectRegions` creates
new objects, and selecting a row only changes a query. It does not change the
player's country, home region, or any engine state.

The source reference for the parity decisions below is AHDGame commit
`e364c0495`. The Native source is the engine and content at `047a52d`.

## Public contract

The game query is:

```ts
projectRegions(world: WorldState, query?: RegionsQuery): RegionsView
```

`RegionsQuery` has these optional fields:

- `regionId` selects a region in the player's country. A foreign or unknown id
  is ignored.
- `directoryQuery`, `directoryPage`, and `directoryPageSize` filter and page
  the country directory. The default page size is 20 and the requested size is
  capped at 100.
- `electionQuery`, `electionStatus`, `electionPage`, and `electionPageSize`
  filter and page races recorded for the selected region.

The panel contract is:

```ts
interface RegionsPanelProps {
  query: RegionsView;
  onQueryChange: (query: RegionsQuery) => void;
  busy?: boolean;
  directoryOpen: boolean;
  onDirectoryOpenChange: (open: boolean) => void;
}
```

The host should send each callback query to the existing read-only worker
query path, then pass the returned `RegionsView` back to `RegionsPanel`. The
callback is browsing state, not an engine action. The host should keep the
selected region out of `player.homeRegionId` and out of save mutations.

`directoryOpen` is host-owned because a worker query can temporarily unmount
the panel. The native `details` directory starts closed, opens through
`onDirectoryOpenChange`, and closes before a region selection query is sent.
The host should preserve the open value during search and paging, and set it
to false when a selected region changes.

Directory rows are restricted to `world.player.countryId`. The selected region
defaults to the saved home region, then the first region in that country. If a
migrated save has no usable `homeRegionId`, `playerHomeRegionId` is `null` and
the fallback selection is marked `isHome: false`. A directory search can show
no rows while the selected detail remains available.

## Projected source data

The projection reads fields already present on `WorldState`:

- region name, id, country, population, GDP, house seats, subnational seats,
  US senate classes, US census region, voting eligible population, working age
  population, military service population, labor force, and the UK
  independence desire field when present;
- regional budget revenue, spending categories, totals, balance, and
  consecutive deficits when `regionalBudgets[regionId]` exists;
- saved party organization, registration, and regional chair records;
- saved electorate pool values and demographic groups;
- saved regional governor records, including a recorded vacancy;
- legislature chamber labels and seat counts, plus politicians whose saved
  `electedState` and `chamberKey` identify the selected region;
- saved elections whose `countryId` matches the player's country and whose
  `state` equals the selected region id. Candidate previews are limited to
  three names, while the saved candidate count is retained.

Population fields are absolute people. Region GDP is the pack's nominal value
in millions. The US pack documents GSP in millions of USD. The 1953 UK pack
stores regional GVA in millions of GBP, so the detail shows the country's
recorded currency code beside that value. Regional budget values are absolute
local currency units from `RegionalBudget`, not millions. Party organization,
registration, demographic population shares, electorate pools, and
independence desire are stored percentage values from 0 to 100 and are shown
as percentage points. No value is converted into a different unit by this
slice.

## Source parity and known boundaries

AHDGame's state overview and politics components are the reference hierarchy:

- `src/components/state/StatePageTabsOverview.tsx` presents registration
  pools, regional economy, and contested races;
- `src/components/state/StatePageTabsPolitics.tsx` presents regional parties,
  officials, and the regional executive when one exists;
- `src/lib/states/overview/getStateOverview.ts` is the source aggregation
  boundary.

Native region construction and labels come from
`packages/engine/src/world.ts`,
`packages/engine/src/government/constants.ts`, and the country packs. The
1953 UK data is in `packages/content/src/packs/ukRegions1953.ts`; its twelve
regions partition 625 House of Commons seats and carry the recorded regional
council seat values. Native currently has no UK regional governor record, so
the panel reports no regional office for a fresh UK world. It does not create
one from the national government.

Fresh US worlds can have a saved vacant governor record and no regional races,
candidates, or seated politicians. The elected fixture used by the tests
shows the saved Alabama governor, chamber members, and race winners. These
states are displayed as they exist in the save. The projection never fills a
vacancy or roster from seat totals.

The player seat is a special saved field with only `countryId` and
`chamberKey`; it has no region id. When that seat matches the selected country
and chamber, the projection includes the player only when the latest resolved
player-winning race for that country and chamber records the selected region.
This uses the race winner and state as persisted provenance. A seat with no
such race cannot be located safely and is left out of the regional roster.

National elections are not copied into every region. The region election list
requires the saved election's `state` to equal the selected region id. This is
why a fresh UK region can show Commons seats but no regional elections when
the save has no region-scoped race records. Constituency geometry, individual
UK constituency browsing, election actions, and regional office actions are
outside this read-only slice.

Missing budgets, demographics, party rows, offices, races, candidates, and
members render explicit empty states. There is no map, geographic asset, or
invented region GDP or income calculation here.

## App integration

The existing session and worker expose a read-only `regions` query. The Regions
route retains filters and directory visibility across requests and refreshes
after world changes. The side drawer opens this route; bottom navigation and
turn/save/exit controls retain the mobile layout. Directory selection never
changes the player's home region or country.

## Validation

Focused checks for this slice:

```text
npm test -- --run src/game/regions.test.ts
10 tests passed

npm run test:ui -- src/ui/RegionsPanel.test.tsx
4 tests passed
```

The query tests cover create, one bounded turn, save and reload, detached
projection data, country scoping, paging, real elected fixture data, fresh
vacancies, UK chamber labels, and a missing home region in a migrated save.
The panel tests cover directory search and selection, fresh US empties, a real
elected office and winner, and the fresh UK regional view.

Integration validation: `npm run verify` passed with 103 app/session tests,
127 UI tests, production build and fixture integrity. Final panel tests (4)
and build passed after the directory toggle fix. The new US/UK offline
browse, save, reload and home-preservation browser flows passed, as did the
320px/390px bottom navigation checks. The directory touch target is at least
44px. No engine changes, repeated Rust checks or paid signing build were needed for this display slice.
