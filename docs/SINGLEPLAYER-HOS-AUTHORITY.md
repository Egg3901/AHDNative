# Singleplayer head-of-government authority

Pinned source: AHDGame `96831835fb6b28983aa14fe66cb6eae9ecfde84c`.

This slice fixes a missing authority record in Native singleplayer HoS worlds.
The player already had a `currentOffice` projection, but parliamentary starts
had no canonical government record tying that player to the sitting head of
government. As a result, source-backed actions such as executive
nationalization could not distinguish a seated HoS from an unrelated player.

## Source contract

`src/lib/singleplayerHeadOfState.ts` chooses the authored executive office
(`getSingleplayerHeadOfStateOfficeType`, lines 36–48). For a direct
parliamentary government it ensures a pending government, uses the existing
governing party and live lower-chamber snapshot, seats the player with
`appointPrimeMinister`, then persists a formed government with the player as
`pmCharacterId` (`seatSingleplayerHeadOfState` and
`formSingleplayerGovernment`, lines 76–163 and 170–201). Presidential systems
instead record the singleplayer as the elected official in that executive
office (lines 203–239). `src/lib/governorOffice/isSittingLeader.ts` resolves
authority from canonical government/elected-official state through
`getHeadOfGovernmentCharacterId`; it does not trust a character office flag
alone. The nationalization route applies that leader check before resolving a
domestic target (`src/app/api/country/[code]/nationalize/route.ts`, lines
57–68).

Native now materializes the same local office identity at world creation and
preserves it in the ordinary parliamentary phase. Presidential identity is
resolved through `world.executives`; parliamentary identity is resolved
through the country's `GovernmentState`, chamber key and recorded player PM
ID. A missing-party source `admin` formation is represented explicitly,
matching the source fallback in `formSingleplayerGovernment`.

## Verified Native behavior

`src/game/headOfGovernmentAuthority.test.ts` uses public `GameSession` creation,
actions, turns, serialization and reload. It verifies a fresh 1953 US HoS has
the recorded executive office, can sponsor a cabinet nomination and can
nationalize a distressed domestic issuer; asset ownership moves to the state
corporation while the separate unowned-sector pool remains unchanged. A
foreign issuer is refused with the serialized save unchanged. A historical
1953 UK HoS receives the recorded Commons government seat, can use the same
domestic nationalization route, and retains that government record through a
turn and save/reload. Career-mode UK creation does not acquire the player's PM
identity. Native retains the source's `admin` formation type only for its
explicit no-party fallback; the public parliamentary proof uses a seeded
historical chamber and does not infer office authority from that fallback.

The public-session test was run as:

```sh
npm test -- --run --maxWorkers=1 src/game/headOfGovernmentAuthority.test.ts
```

It passed two tests after the RED-first run exposed missing HoS action
availability and the absent parliamentary government record. The targeted
engine run also passed 36 nationalization, cabinet nomination and HoS tests:

```sh
npm run test --workspace @ahdclient/engine -- --maxWorkers=1 src/corporation/nationalization.test.ts src/cabinet/nominationSponsorship.test.ts src/hos.test.ts
```

`smoke/singleplayer-hos-authority.spec.ts` passed in Chromium at 320px and
390px. The flow creates a new US HoS through the UI, uses its executive tax
control, and saves/reloads at both widths. The browser test does not seed an
insolvent issuer; the real nationalization action and asset/unowned-pool
invariants are exercised by the public `GameSession` test above.

## Remaining issue scope

This is an authority prerequisite for #298, not evidence that the full issue is
closed. The existing #298 acceptance also requires full ownership conservation
for referendum secession fan-out and separate treatment of unowned revenue
pools; those behaviors must be verified against the complete current source
and public save/reload paths before closure. This slice covers only the
nationalization actor identity and its existing ownership-preserving action.

For #105, this does not implement regional or defense consequences (#263), and
does not complete the broader issue's integrated legislation lifecycle.

## Saved-game startup readiness

The combined government gate passed108 browser cases and found a lost Continue
tap during the second German VAT save/reload. The retained trace shows saved
metadata arriving before the engine era choices. The era chips appeared between
pointer press and release, shifting Continue while the click was in progress;
no world load began and no save or worker error appeared. Continue now waits for
the same local engine readiness as New game. The public LandingScreen regression
failed before the fix, then all17 landing checks passed. The original German
phone enactment/replacement/two-reload journey and final gate remain required.
