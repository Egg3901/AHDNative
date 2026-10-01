# Demographic canvassing checkpoint

This delivers the supported standalone voter-canvassing flow within #57 and #91.
The old region-only hub proxy is replaced by the Game action page hierarchy:
Actions, Voter Canvassing, category/group selection, batch preview, confirmation,
selected-audience result, and return to Actions.

Authority: AHDGame `08820d108bf986d519aed28c2963690dd772c652`.
Source boundaries are `src/app/actions/canvass/page.tsx`,
`src/app/campaign/[id]/components/CanvassingPanel.tsx`,
`src/lib/canvassing/eligibility.ts`, `src/app/api/canvassing/route.ts`,
`src/lib/campaignTargeting/rules.ts` and the legacy demographic turnout writer.

The player selects a recorded demographic audience in the eligible home or
explicit presidential campaign state. The quote and executor require the same
country, region, audience and integer batch count from 1 through 50. Each canvass
uses one AP and 100 anchor campaign funds converted through frozen home-country
currency. Unsupported running-mate shared action pools refuse explicitly.

The source modern demographic-fit boost, seasonal multiplier, directional
headroom and cap are reproduced from independently executed Game vectors in
`docs/fixtures/canvass-08820d1.json`. The collector is
`scripts/canvass-reference-vectors.mjs`; pass a Game Git repository to regenerate
it at the pinned revision. Game's legacy and modern writes are separate, with
one regional modern consumer in the election tally. Modern modifiers decay with
six-turn half-life; the legacy Native decay remains separate. A matched public
world/save fixture demonstrates an actual change in votes with identical RNG,
then exact deterministic continuation after reload.

Validation: eight public engine tests cover source numerical vectors, batch
currency, eligibility and refusal accounting, saved turns, electoral impact,
corrupt modern modifiers and lossy v42 export refusal. Three public session tests
verify the target-specific history and continued action after reload. Panel/hub
tests cover preview, confirmation/cancel, GBP cost, invalid count and spectator
omission. Actual Chromium journeys at 320px and 390px create a character, select
voters, review/cancel/confirm, save and resume, advance, and canvass again. Native
captures have been inspected for readable controls and no horizontal overflow.
The source comparison uses Game's page/panel hierarchy and labels. No physical
native-device or pixel-equivalence result is claimed.

Both #57 and #91 remain partial. Native's recorded audience is still flat, while
Game supports richer joint targeting cells. Presidential state travel/primary
selection and running-mate surrogate pools need their real writer journeys.
Dedicated poll, targeted-ad and political-operation selectors remain within #57;
party join/leave costs and the full party/caucus contract remain within #61.
Modern campaign turnout cannot be projected losslessly to the old v42 reader;
export refuses with the precise field path and keeps the Native save.
