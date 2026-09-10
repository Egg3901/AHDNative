# Career playthrough: election to office (1953 US)

Genuine seeded run through a full election with the pinned historical engine
oracle. No state cheats, no outcome injection, no engine formula changes.
The player won; success was measured, not manufactured.

## Result

- Seed `career-muse-1`, 1953 US, joined `US_DEM` at t1, filed for
  `house:US:AL:c1` (home-region house race, resolves t96).
- Primary survived at t48. General won at t96: winners include `player`,
  seat `{ chamberKey: house, countryId: US }`.
- Officeholder flow: `sponsorBill` (`us.economy.workerSecurity.primary`,
  `bill-97-7-...`) then `voteOnBill` "for" on the same bill while `active`
  in the house chamber. Fixture holds the seat plus the recorded player vote.

## How to reproduce

- `npx tsx scripts/validate-career.ts --mode=generate --engine-root <oracle checkout>`
  (`--engine-root` is required; no path is baked in). The script refuses to
  run unless the oracle checkout is at the pinned commit with clean
  engine/content sources, then records the oracle and subject commits.
- `npx tsx scripts/validate-career.ts --mode=validate` is the CI-safe check:
  fixture presence, 3MB cap, raw/gzip integrity, seed match and oracle pin. No oracle checkout or
  additional simulation needed.
- Policy (exact, embedded in provenance with the full 157-action log):
  per-turn priority `buildDonorBase` while level < 4, `fundraise` while funds
  < 120k, `convertCash` (<=10k) while funds < 30k, `campaign`, `advertise`,
  `fundraise`, `canvass`/`organize` home region; setup at t1 is join + file.
- Engine loop uses direct public exports (`createWorld`, `executeAction`,
  `advanceTurn`, `serializeSave`, `deserializeSave`); no `GameSession` clone.

## Evidence

- `fixtures/career-t95-1953-US.save.json.gz` (2,814,011 bytes compressed):
  authentic pre-resolution snapshot at t95.
- `fixtures/career-elected-1953-US.save.json.gz` (2,749,114 bytes): elected
  fixture at t98 with seat and player vote, suitable for browser UI imports
  via `deserializeSave`.
- `fixtures/career-elected-1953-US.provenance.json`: seed, policy, full
  action log, oracle/subject commits, raw and gzip hashes, replay hash.
- Determinism: exact input replay through the imported oracle reproduces the
  post-season hash (`98fb057e...b884a`); t48 save-reload roundtrip identical;
  workspace-local engine agrees (same win, same hash; the one known source
  delta is type-only).

## Run history (3 generate runs, 1 strategy + 2 script fixes)

1. Season policy as above; won, but post-win `sponsorBill` failed: 2 AP
   banked vs 4 AP cost. Evidence justified waiting for AP refresh.
2. Same season; sponsored, but the vote detector looked for a `voting`
   status that does not exist. Engine contract is `active`/`active_other`/
   `veto_override` in the player's chamber; the bill reached `enrolled`
   unvoted.
3. Same season, fixed predicate: sponsored at t97, voted "for" at t98.
   No seed search, no policy tuning for outcome; both fixes were
   engine-evidenced script bugs, not strategy revisions.

## Limitations

- Favorability decayed 50 to 44 despite advertising; the win came through
  real tally math, not through that lever.
- `candidateSupports.player.support` was absent all run; support was not
  directly observable, only the outcome.
- Parity claimed is to the pinned historical oracle only, not to current
  AHDGame. Physical-device and App Store gates remain open.


## Integrated app validation

The session and production-browser tests load the genuine turn-95 fixture, advance to the turn-96 House win, sponsor a policy bill, advance to voting, cast a vote and save/reload it. The browser uses the actual Worker and persistence, not a mock world. The UI exposes office and legislature controls using the existing engine actions.

The session regression also pins the completed Economic Stability bill's Senate tally to 52 for, 27 against and 16 abstain from the oracle fixture. Active bill totals read the live vote map, so the player's first vote appears immediately. Display changes leave the serialized engine state unchanged.

Validation commands: `npm run verify` and `SMOKE_PRODUCTION=1 npm run test:smoke`. The latter requires installed Chromium (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE`). Screenshots are local artifacts under `artifacts/smoke/`; no signed build or paid CI was used.
