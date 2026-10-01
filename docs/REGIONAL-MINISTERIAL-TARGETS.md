# Regional ministerial targets

This is partial #263 and #105. Region navigation and the wider metric boards
remain reference only #72 and #76. No issue closes through this slice.

## Current reference

The immutable Game reference is
`96831835fb6b28983aa14fe66cb6eae9ecfde84c`. Current Game
`cb66acdf0129616b8a09902727e9b58715c8bacb` preserves the relevant seed loader,
metric resolver, ministerial processor and cabinet political channel. Client
remains `799a992054609d231930bbf062251b93590ccf68`.

`scripts/ministerial-target-reference.mjs` actually runs Game's
`loadSeededStateMetrics` in a clean checkout at the immutable revision. Its
generated UK/DE unemployment rows cover the four Native presets. Creation
seeds only existing regions and consumes no RNG. London starts at the source
2019 value 4.5; Scotland at 3.8. Recorded save values are preserved rather than
replaced with order-created defaults. A loaded game without a required row
still refuses that unsupported target.

Game's `resolveMetricPath` resolves the veterans order's bare
`unemploymentRate` to `economic.unemploymentRate`. Native now resolves to an
existing supported regional path at issuance, after checking the region belongs
to the issuing country. Unknown, missing and foreign targets remain refusals.

A two-case offline database-boundary oracle executed Game's actual
`processMinisterialOrders` at the immutable revision. It recorded London
macro delta -0.059, resulting value4.441 and a regional source `orders`
contribution of +0.944 to `economy.workerSecurity`. Scotland received no macro
write. Its second case recorded the source safety/trust political families and
no legacy macro write. No live database was used.

The actual issuer's Statecraft scales the authored effect before accumulation,
the source 1.25 strength and the per-metric cap. A Statecraft10 issuer has the
source 1.18 multiplier. The UK order's -0.04 produces a -0.059 London change,
yielding 4.441 after the ordinary turn. Missing issuer stats use the source's
neutral multiplier. Native NPC records have no character stat block.

## Player-visible consequence

Game's UK region Metrics tab uses `RegionalStatBoards`, with an
`Economic indicators` board and `Unemployment Rate` formatted at one decimal
with `%`. Native region detail now displays the recorded regional value with
those labels and precision. Country-wide annualized macro indicators remain
their existing separate block. The broader reference metric hierarchy is still
tracked under #76.

The public `GameSession` tests first failed because the regional row was absent,
then because the authored bare path could not issue, and then because the issuer
multiplier was omitted. All three now pass, including normal turn/save/reload
and Scotland remaining unchanged. A rendered `RegionsPanel` test first failed
because the region result was invisible; it now passes with 4.5% before issuance,
4.4% after the normal turn and reload, and 3.8% after selecting Scotland.

The initial cabinet holder in these tests is explicitly a controlled eligibility
fixture. It does not prove a player-earned UK cabinet appointment or the broader
government formation flow. Existing target, lifecycle and ordering regressions
remain part of the required integrated gate.

## Remaining source consumers

Current Game writes non-macro cabinet effects through
`politicalCabinetContribution`, then the political dynamics fold their per-source
and per-region `cabinetResiduals`. The contribution is consumed with a one-turn
lag. Native does not yet implement that full channel and authoritative regional
political boards. A veterans order therefore also has a source political worker
security consequence outside this bounded macro/display slice.

The source defense order catalog does not itself target military appropriation
or unit-readiness stores. Its safety and public-trust effects now feed political
families, while `governmentApproval` is deliberately unmapped as an outcome.
Those source paths supersede the old inventory's legacy store assumptions.
Named unavailable controls do not complete the missing source mechanics.
#263 remains open for the full source consumers and integrated country/role
player flows. The separate military pipeline PORT-STUB remains intact.

## Integrated validation

The final application typecheck passed. Seventeen rendered regional/cabinet UI
checks passed, including the new source-visible regional outcome. Twenty-three
public-session, issuance, targeting and defense-classification tests passed.
The actual immutable Game ministerial turn oracle passed both macro and political
family cases. The held-office fixture remains controlled; source political
cabinet residuals and complete SP appointment authority remain open.
