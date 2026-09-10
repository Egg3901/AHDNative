# Shared action rules

AHDGame owns mechanics. Portable rules live beside the authoritative system in
AHDGame; Native consumes a generated, immutable source package. Host code still
owns loading, persistence, currency context and UI. This first slice covers
Fundraise only, not the full engine or all action behavior.

## Ownership and consumption

- AHDGame: `src/lib/actions/rules.ts` owns Fundraise AP cost, donor eligibility
  and anchor yield, including the fundraising stat multiplier. Existing Game
  action quotes, effects and validation call it through `src/lib/actions.ts`.
- AHDNative: `packages/game-rules` is generated from a full Game commit SHA.
  Native's catalog, action execution and session projection consume its exports
  through `@ahd/game-rules/actions`. The app imports only the engine contract.
- AHDClient: current main packages the actual AHDGame server for desktop SP.
  It does not need another formula package. Its build metadata must describe
  the built server payload, including dirty or unknown provenance, rather than
  the source checkout at staging time.

The copied source in `packages/game-rules` is a generated artifact, not a second
editable implementation. `provenance.json` records the source revision and
transitive file hashes. The exporter reads committed Git blobs and does not
execute Game source. Runtime host imports are rejected. The package retains
AHDGame's license; it does not change the license of unrelated Native code.

## Updating a rule

1. Change and test the authoritative rule in AHDGame. Balance changes still
   require the Game issue and simulation policy.
2. Merge the Game feature into development. Select that exact commit.
3. Export the package and review the reported changed/new/removed source files:

   ```sh
   node scripts/shared-rules.mjs --update --source ../AHDGame --revision <full-commit-sha>
   node scripts/shared-rules.mjs --check --source ../AHDGame --revision <full-commit-sha>
   npm run verify:rules
   ```

4. Review Native quote, execution and save/reload evidence with the package
   update. Merge it through Native's verify gate. Never refresh expectations
   solely to make a drift failure disappear.

Local verification detects package tampering. CI also fetches the public Game
repository at the recorded revision and compares committed source bytes. This
proves correspondence to that revision, not that Native tracks today's Game
branch automatically. Automatic update PRs and whole-engine drift inventory
remain tracked in [#120](https://github.com/Egg3901/AHDNative/issues/120).

## Validation boundaries and limits

The Game tests preserve established Fundraise results: 3 AP, donor level 50 and
50% influence pays 225,000 anchor units at the neutral stat. At level 50 and 40%
influence, fundraising stats 1 and 10 pay 172,200 and 247,800; out-of-range stats
clamp to those bounds. Existing frozen campaign currency conversion stays in
the Game host.

Native's saved-session regression verifies the donor prerequisite, the 225,000
quote, actual 3 AP debit and credit, then another successful action after save
and reload. New characters see the missing-donor reason before attempting the
action. The exporter tests exercise committed-source updates, tampering and
transitive dependency changes through its CLI.

A controlled local cost-change exercise changed only AHDGame's cost to 4 AP.
The stale Native package failed source comparison. Regeneration then changed
both hosts without a Native formula edit:

| Boundary, five Fundraises from 30 AP and 100,000 funds | Cost 3 | Test-only cost 4 |
| --- | --- | --- |
| Game batch preview final AP / funds | 15 / 1,225,000 | 10 / 1,225,000 |
| Native actual actions with reload after each, final AP / funds | 15 / 1,225,000 | 10 / 1,225,000 |

The exercise restored the original 3 AP package. The Game observation is its
public batch preview, not a Mongo-backed execution or multiplayer deployment.
The persistent browser smoke additionally starts a new US character, converts
cash, builds donors, sees the 52,000 Fundraise quote, acts, reloads and acts again.
The profile ends with 13 AP and 104,000 funds, through the real worker and save
store. This is browser evidence at phone dimensions, not a device build.

Native currently has neither the RPG stat progression nor Game's campaign
currency context. Its Fundraise adapter explicitly uses the existing neutral
stat and existing funds denomination. This slice does not prove full Fundraise
parity in non-neutral Game worlds. Track those contexts in
[#91](https://github.com/Egg3901/AHDNative/issues/91), the action hub in
[#56](https://github.com/Egg3901/AHDNative/issues/56), and full differential
replays in [#117](https://github.com/Egg3901/AHDNative/issues/117).

Save schema and ruleset migration policy, all other actions and turn phases,
physical-device performance, and a Rust runtime remain separate gates. No
signed build or release is implied by these checks.
