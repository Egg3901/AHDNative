# Stock market depth (N07 slice)

Date: 2026-09-10. AHDNative worktree `feat/market-depth`. Engine buy/sell source: `packages/engine/src/actions/execute.ts` `buyShares` / `sellShares`. AHDGame UI baseline: `src/app/country/[code]/stockmarket` (StockList search) and `src/components/corporation/shares/SharePurchaseModal.tsx` (integer quantity, at-market buy/sell).

This slice is a detached query plus a panel. Root still has to attach the typed DTO and `onAction`. `session.ts`, `types.ts`, `GameScreen.tsx`, and `package.json` were not edited.

## Root integration contract

Query (worker/session, not the UI):

```ts
import { projectMarkets } from "./markets";
import type { MarketsView } from "./markets";
// inside projectWorld(world):
markets: projectMarkets(world)
```

Do not put `WorldState` on `GameView` or on `MarketsPanel` props. `projectMarkets` is the only world reader.

Action callback (already on `GameScreenProps`):

```ts
onAction("buyShares", { corpId: listing.id, shares })
onAction("sellShares", { corpId: listing.id, shares })
```

`shares` must be a positive integer. Root should keep using `session.act` / `executeAction`. Failures belong in the existing GameScreen `error` alert. The panel only validates input locally.

Suggested GameScreen wiring (root-owned):

- Add route id `markets` and a World-menu item "Stock Market".
- Render `<MarketsPanel markets={world.markets} busy={busy} onAction={onAction} />`.
- Add `markets: MarketsView` to `GameView` (import the type from `src/game/markets.ts`, or copy it into `types.ts`).

## DTO

`MarketsView` carries player cash/currency/actions, feature-flag phase switches as status only, per-country listing counts, and one row per seeded `world.corporations` entry.

Per listing, recorded fields only: id, ticker, country, sector, share price, fundamental price, total shares, public float, treasury (`liquidCapital`), revenue, growth, margins, insolvency, bank charter presence, player shares, player average cost, NPC founder shares, earnings history (last 52 recorded entries). Price history is always empty today (see gaps). Display name is the corporation id; there is no authored company name on the engine record.

Money stays in the listing currency (`budgets[countryId].currencyCode`, else `exchangeRates[countryId].currencyCode`, else `XXX`). There is no USD conversion and no cross-currency market-cap total. `cashCurrencyMatches` is whether that quote currency equals the player's cash currency.

Measured on `createWorld({ era: "1953", countryId: "US", seed: "native-markets-v1" })`: **49,757 bytes** JSON for 63 listings across 4 countries. The same world's `JSON.stringify(world)` is 1,350,636 bytes. The query is not WorldState.

## Engine validation (mirrored, not reimplemented as a second ruleset)

`executeAction` for these ids:

1. Catalog must exist and `status === "available"`.
2. `corpId` plus `Number.isInteger(shares) && shares > 0`.
3. Cooldown: `world.meta.turn < actionCooldowns[id]`.
4. Action points: `getActionCost` then `player.actions < cost`. Catalog `baseCost` is 0.
5. Corporation must exist in `world.corporations`.
6. Notional `Math.round(shares * corp.sharePrice * 100) / 100` (no brokerage fee).
7. Buy: `publicFloat >= shares` and `player.cash >= notional`. Debit cash, reduce float, credit `corp.liquidCapital`, add/merge a `holder: "player"` row.
8. Sell: player holding `>= shares` and `corp.liquidCapital >= notional`. Credit cash, restore float, debit treasury, drop a zero holding.

Feature flags (`economy`, `markets`, `corporations`) skip matching *turn phases* only. `executeAction` does not read them for buy/sell. The DTO exposes the flags so the panel can say prices or the economy are not updating; it does not disable the buttons for that reason.

There is no `isActive` / `corporationActionsPaused` field on `WorldState`. The UI `busy` flag is the local analogue of AHDGame `rejectDuringTurn`.

`evaluateShareTrade` is a display helper: a unit-share hint with `available: false` blocks every positive integer size. It does not parse English `disabledReason` text. It also rejects non-safe-integer share counts and non-finite notionals.

## Seeded corporations

`buyShares` / `sellShares` work on W9/W10 seeded corps. `createWorld` founds one public NPC corp per (playable country, nonzero 1953 sector weight). Tests buy `US-media` on a real world, then serialize/deserialize. No corporation is synthesized for the UI.

Identity is `countryId-sectorType` (example `US-media`) and ticker `US.MEDI`. There is no authored display name. The panel shows the company id as the name because that is the engine source limit, not a UI invention.

## Gaps (do not paper over)

- No per-corporation share-price history series exists on `WorldState` or `WorldHistory`. The panel shows "No recorded share-price history." `earningsHistory` is the rolling earnings window, not price, trimmed to the last 52 recorded entries.
- Player cash is one number in the home currency. Share price is in the corp country currency. `executeAction` subtracts notional from cash with no FX, so a cross-country buy currently mixes units. This slice does **not** change that engine formula and does **not** certify FX parity. The panel holds buy and sell when `cashCurrencyMatches` is false, keeps the listing browsable, shows quote currency and cash currency, and uses the note "Trading between different currencies is not available yet." That is a documented missing-capability gate until reference FX settlement is ported, not a conversion or rebalance.
- Retail float only. No order book, limit orders, IPO, CEO corp-wallet buy, or player-founded corp.
- World destinations other than this stock list (map, unions, forex, trade, crises, my corporation) are outside this slice.
- The grouped menu now mounts Stock market through an on-demand worker query. The selected company remains open as buy/sell refreshes actual balances.

## Tests

- `src/game/markets.test.ts`: public `createWorld` + `executeAction` + save/reload, independent notional formula, feature-flag non-gating, integer parse, DTO membership equals seeded ids, unit-share `available: false` blocks any size without string parsing, earningsHistory bound 52, engine characterization that foreign `buyShares` still mixes units while the DTO holds the trade.
- `src/ui/MarketsPanel.test.tsx`: search, country filter, detail fields, integer input, buy/sell params, busy disable, no found/IPO controls, no USD conversion copy, foreign quote cannot call `onAction`.

## Integrated behavior

`GameSession.markets()` projects detached company data only when the route is visible. `src/game/shareTrade.ts` contains presentation helpers without engine runtime imports. The production browser scenario creates a real US world, buys two domestic shares, sells one, relaunches, and reopens the same company with its remaining holding. No synthetic corporation or holding is injected.
