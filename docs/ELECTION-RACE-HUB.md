# Election race hub and primary views

Issue [#66](https://github.com/Egg3901/AHDNative/issues/66): complete election
race hubs, primary views, and results navigation. This slice adds the missing
display layer over election data the engine already persists; no election
formula changed.

## What the UI now shows

- **Derived race phase.** `racePhase` (`src/game/racePhase.ts`) derives
  `upcoming | primary | general | resolved` from the persisted record and the
  current turn, matching the engine's own filing and tally windows. It is
  projected onto both the routine world view (`ElectionView.phase`) and the
  politics detail (`PoliticsElectionDetail.phase`). Nothing is stored.
- **Race hub grouping.** The Elections race picker groups races by phase with
  `<optgroup>` labels, so each stage is reachable in one list. The inline
  Elections tab labels every card with its phase.
- **Lifecycle stage ledger.** The race detail renders Filing, Primary (US
  down-ballot only), General, and Results with an explicit
  `upcoming / current / done` state, dates, and a short description. The
  primary stage is listed only where `requiresPrimaryResolution` applies.
- **Primary ledger.** `projectPrimary` surfaces either the live standings from
  the latest persisted `primarySnapshots` or the recorded nominees from
  `primaryResults`, with per-party entries, candidate share, counted ballots,
  and the nominee marker. Ballots are labelled as counted party ballots,
  separate from general votes and not a forecast.
- **Results navigation.** Winners render as buttons that open the politician
  directory; Profile career-history rows link to the resolved race detail; the
  existing "Manage campaign" link and politician active-race links are
  unchanged.

## Evidence

- `src/game/politics.test.ts`:
  - derives phase and stage states across primary/general/resolved turns;
  - mirrors a persisted `primaryResults` record into the primary ledger;
  - **advances a live US primary through `advanceTurn`** (open primary with a
    registered-party pool, then resolution at `primaryEndTurn`) and asserts the
    projection shows the recorded nominee while general vote figures stay null.
- `src/ui/PoliticsPanel.test.tsx`: stage grouping labels, the open and resolved
  primary ledgers, and the winner link callback.
- `src/ui/GameScreen.test.tsx` / `src/ui/ProfilePanel.test.tsx`: inline phase
  label and Profile career-history race link.
- `smoke/elections-stages.spec.ts`: a real seeded career opens a race detail,
  sees the stage ledger, saves, reloads, and reopens the same race with the
  ledger intact.

## Remaining limits

- The stage ledger is one detail route with stage states, not separate
  primary/general/results routes or tabs.
- Primary ballot accrual only runs in the closing stretch before
  `primaryEndTurn`, so the browser smoke asserts the stage ledger on a fresh
  career; the live primary ledger is proven at the engine/DTO boundary instead.
- Non-US primaries remain out of scope; `requiresPrimaryResolution` is US
  non-presidential and the gap stays tracked in
  [#96](https://github.com/Egg3901/AHDNative/issues/96).
- Counted vote share and seat projection stay tally-backed. A reference
  campaign projection is still open in
  [#68](https://github.com/Egg3901/AHDNative/issues/68); this slice does not
  present campaign strength as a forecast.
