# NPP relationship actions and caucus recruitment

This bounded slice follows AHDGame `01797b27082b098fdf3929bb498215c94c8dda24`:
`src/lib/influence/constants.ts`, `calculator.ts`, `executor.ts`, the caucus
member route, and `src/lib/constants/partyOrg.ts`.

The Politicians detail offers the four authored relationship approaches with
recorded target eligibility, chance, cost and outcome. Each charges three AP;
Strengthen Party Loyalty costs 10,000 anchor currency, Boost Favorability 25,000,
Boost Political Influence 50,000 and Improve Cooperation 20,000. The quote
converts the authored currency cost. Review cancellation consumes nothing.
Eligibility refusal is atomic. Resolved failure and backfire consume the costs
and preserve the source relationship consequence. Source `applyInfluenceEffects`
has no stat mutation cases for these four names; they change relationship rather
than inventing an NPP favorability, loyalty, influence or personality boost.

The app waits for worker acceptance and save completion before displaying the
result. A same-save politician refresh preserves the selected target and result
panel; a different save or failed query clears retained details. Missing recorded
stubbornness refuses rather than guessing a personality value. The dedicated
saved RNG stream preserves deterministic relationship outcomes after reload.

A caucus chair can recruit an active NPP from the same party and country with a
recorded relationship of at least 60, no other caucus membership and no active
12-turn caucus recruitment cooldown. Recruitment is free. The public session and
rendered controls verify successful membership, cooldown, authority, eligibility,
atomic refusal and save/reload. Controlled eligibility fixtures establish that
contract; they do not establish a player-earned 60-point relationship journey.

## Verification

The public `GameSession` relationship and caucus tests exercise the integrated
commands and projections. Independent immutable Game calculations supply the
relationship chance/cost/outcome vectors in the engine tests. The rendered
worker-response regressions first failed for an optimistic success receipt and
now wait for accepted results. A real Chromium flow first failed because world
refresh unmounted the result, then passed at 320px and 390px after the refresh fix.
Both journeys use an unmodified fresh session, cancel and confirm a source-eligible
approach, observe exact charged resources and target relationship, save normally,
reload and resume without page errors or horizontal overflow. The focused route,
panel and query checks passed 55 tests; the full hosted gate remains required.

## Issue disposition

Partial #57: these politician targets add a reviewed, resolved, persisted target
journey. Polling, targeted advertisements, richer constituency/election/campaign
selection, endorsement, withdrawal, opposition, leadership and relocation remain
open. Partial #61: source NPP caucus recruitment now has the shared eligibility,
cost and saved consequence contract. The three-human charter lifecycle and all
remaining original action costs/flows still prevent closure. Reference only #95
and #28. This is browser-width evidence, not physical-device or full MP proof.
