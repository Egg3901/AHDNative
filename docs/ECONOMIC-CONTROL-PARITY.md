# Subsidy and Gosbank player controls

This checkpoint is partial progress on #94. The source is AHDGame
`954f1c21781e6e767455a15eed40f73993d89a8b`.

The Legislature screen proposes national subsidy and end-subsidy bills with
the source industry scope, optional sector/strategy and domestic-only filter.
Proposal costs 10 AP and zero NPI. Normal voting and executive signing must
complete before subsidy state changes. Production receives the source fixed
7.5 percentage-point margin effect; the next budget turn charges rounded
qualifying annual revenue times 0.105. State subsidy budgeting remains
unavailable with a named blocker.

The Command Economy screen queues Gosbank credit and budget-softness posture
and sector weights. Source bank-chair or head-of-government authority is
required; Native HoS mode uses its existing national executive authority.
Commands cost no AP, apply once at the next turn, and expire when the country
leaves the planned regime. Save loading validates the pending and applied
country, posture, sector weights and SOE records.

The current SOE credit consumer ports Game's **below-plants** branch: source
authored revenue seeds output/plan target with 10% capacity headroom, credit
adds capacity and half-credit output, and monetized credit adds overhang.
These are real saved overlay consequences, but they do not implement Game's
default physical-capacity mode.

Game's seed config sets `marketSystemMode: "plants"`. Its
`src/lib/turn/commandEconomyTurn.ts` buys actual corporate-sector capital stock
at source era prices, records its paid capacity basis, and funds replacement
capacity through the Gosbank floor. Native still needs that sector stock,
purchase/replacement and production chain. Source automatic allocation also
uses each director's recorded investment request; that input is missing here.
The broader corporate pipeline is tracked in #107. #94 stays open until its
default source consequences and remaining state subsidy scope are complete.

Verification uses the public create/action/turn/save/reload boundaries:
subsidy enact/end and budget/production comparisons, pending directive
application and expiry, role/country rejection, malformed-save rejection,
and matched replay. Both 320px and 390px browser journeys create a RU HoS,
propose a subsidy, queue a weighted directive, save/reload pending state,
advance, inspect applied sector credit, and save/reload again. They passed.
The 300-second case budget accommodates the long full journey and worker
startup on the shared test host; this is not physical-device performance
evidence.
