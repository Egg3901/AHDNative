# Preserved campaign worktree remainder audit

Audit date: 2026-09-11

Compared the final filesystem state of the preserved, dirty
`worktrees/p0-campaign-stock` checkout with `origin/main` at
`a68c4666e535ccd1dde16e71b7b8dcfebd20a657`. The preserved checkout was read
only. Its accepted changes have already landed through PRs #153, #154, and
#157. No additional mechanics or UI implementation in that checkout is both
distinct from current main and acceptance-ready.

## Already integrated

| Scope | Issue | Result on current main |
|---|---:|---|
| Decaying campaign spend stock, save migration, tally input, and source rollover tests | #92 | PR #153; current tests are a strict superset of the preserved tests. |
| Swing-flow and group-level vote distribution with supported tally wiring | #141 | PR #154; current source files match or include later player-input fixes absent from the preserved checkout. |
| Campaign upgrade command, shared cost table, projections, and routed campaign manager | #67 | PR #157; current route is more complete than the preserved inline-only manager. |
| Counted standing and explicitly unavailable projection states | #68 | PR #157; current UI retains the no-false-forecast boundary. |

## Excluded remainder

- The preserved `investInfluence` action exchanges 10 party influence for two
  immediate actions. It has no cited AHDGame authority and contradicts the
  current passive party-influence model. It remains excluded under #88 and
  #144.
- Preserved subsidy comments and save handling predate PRs #155 and #156. They
  would restore a zero-cost stub, remove schema-v44 subsidy validation, and
  regress closed issue #39.
- Preserved player types and exports omit the merged national influence,
  party influence, policy axes, energy, and office/action projection work from
  #30, #31, and #32.
- Preserved election adapter and candidate types omit later source-backed
  player policy, influence, tenure, and targeting inputs. Taking those older
  files would regress #141 rather than extend it.
- The remaining #67 controls (rallies, opposition targeting, message/blend,
  and targeted advertising) and #68 forecast/confidence work have no complete
  implementation in the preserved checkout. They remain open and depend on
  #57, #96, and #97 rather than being inferred from counted votes.

The original dirty worktree remains the recovery record. This audit branch
contains no copied runtime change from it.
