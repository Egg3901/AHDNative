# Regional extraction (#115) implementation evidence

This branch implements the supported regional extraction lifecycle against
AHDGame source pin `cb66acdf0129616b8a09902727e9b58715c8bacb`. The extraction,
contract, capacity, and regional budget source files are unchanged from the
earlier inspected source pin `96831835`; the later `clearCommodity` change is
an adjacent trade-clearing behavior and is tracked separately.

## Acceptance mapping

| Original criterion | Implementation and evidence |
| --- | --- |
| Region, resource, capacity, contract, corporation, and government eligibility | Regional capacity is read from `stateResourceCapacities`; regional authority resolves from the recorded extraction authority act and seated Governor/HOG; operation expansion requires an active player CEO, an extraction company, and a source-recorded regional deposit. `extraction.sim.test.ts` covers authority selection and absent eligibility; the public 390px Chromium flow uses a CEO seated through the public share/vote/accept session actions and a saved Texas governor record. |
| Offer, accept, decline, revoke, settlement, and regional revenue consequences | `extraction/contracts.ts` records issuer and corporate counterparty, accepts/declines only through active-CEO actions, revokes only through the recorded issuer, and settles active contracts. State-issued signing fees and royalties flow to `regionalBudgets`. `extraction.sim.test.ts` exercises lifecycle branches and a full settlement run. |
| Keep national-only content explicit where a region is not represented | Missing regions and missing source deposits are refused by the engine operation/issuer paths. The UK source-authority test keeps unrepresented regional authority unavailable instead of inventing a region or local issuer; the UI explicitly says when no source capacity is recorded. |
| Verify prospect, contract, acceptance, production or settlement, save, reload, and regional budget effects | The engine test commissions a state survey, expands the actual Texas extraction corporation with a 48-turn source starter build, accepts a 120-turn contract, advances 48 turns, verifies production and royalty/budget deltas, and round-trips the saved world. `smoke/regional-extraction.spec.ts` additionally runs the public regional UI in Chromium at 390px, clicks survey/expansion/offer/accept, advances 48 times through the visible End turn control, saves and resumes, and checks nonzero regional royalties. It then checks the same resumed state at 320px. Both widths had no horizontal document overflow. |

The browser test's governor and authority record are supplied in the saved test
fixture; the CEO is earned through the public session share purchase and vote/
accept commands. The test therefore proves the regional contract controls and
their save/resume consequences under recorded source authority. It does not
claim to test winning the governorship through an election.

## Explicit source-pricing gaps

- Native has no corporate research-tree input for the reference growth-cost
  technology discount. The starter quote uses the neutral source multiplier
  `1`; it does not fabricate a technology level or discount.
- `capacityPricePerUnitAnchor` currently prices the Native standard sector mix.
  Game's generic capacity pricing is strategy-specific and receives additional
  capacity-technology effects. The regional starter uses the reference
  extraction standard mix, era index, founding discount, and recorded Native
  dominance/rate/acumen/host modifiers, but Native does not yet expose the
  generic strategy-selection and technology quote inputs. This branch does not
  claim arbitrary-strategy plant-price parity.

These gaps are separate from the four original #115 acceptance rows and should
remain visible in the final issue disposition if the broader pricing contract
is included in the closure review.

## Final integrated verification

PR #719 merged as `7661304` after exact `985b2dd` passed the full hosted
[gate 36905468118](https://github.com/Egg3901/AHDNative/actions/runs/36905468118):
application/build, engine/content, integrated browser smoke and Rust. The final
targeted integrated run passed 33 engine tests including the real 48-turn
production/royalty/save lifecycle, plus 31 region/sector UI tests. All four
original #115 criteria were checked before merge; GitHub closure and removal of
`status: partial` are confirmed. The standard extraction mix independently
matches current source weights (.25 iron, .22 coal, .14 oil, .14 rare earth,
.14 natural gas, .12 timber). Wider strategy/technology pricing remains #107.

## Earlier verification record

- Focused engine run covering extraction lifecycle, regional operation,
  capacity, production, and corporate-sector assets: 41 passed, 1 failed on a
  test input mismatch (`termTurns: 120` while expecting the 24-turn minimum).
  The case was corrected to use a 24-turn term and passed alone; the same run's
  48-turn production/royalty/save-reload test passed.
- Production browser build: `VITE_AHD_SMOKE_FIXTURES=1 npx vite build
  --outDir dist-smoke-extraction --emptyOutDir` passed. It emitted Vite's
  existing large-chunk and Tauri dynamic/static import warnings.
- Chromium: `smoke/regional-extraction.spec.ts` passed in 10.7 minutes using
  the production preview, at both 390px and 320px. The 390px preproduction and
  390px/320px post-resume screenshots are generated under
  `artifacts/smoke/` by Playwright and are local test artifacts, not committed
  application assets.
- An initial browser attempt retained a trace for a 20-second shared-helper
  timeout while Chromium was processing turn 34. The test now uses a bounded
  90-second settle for each actual End turn action; the complete retry passed.
- `git diff --check` passed before the final evidence note was added.
