# Sovereign bond market

The Character menu opens Bonds. Players can inspect outstanding sovereign
issues, coupon rates, maturity, public float and their own units. Domestic
issues can be bought or sold through the existing `buyBond` and `sellBond`
actions. Successful trades update balances and holdings, retain the selected
issue, and autosave through the normal game flow. Settled issues without player
holdings are omitted from this inventory.

The optional worker query returns detached bond summaries, not the world.
The UI checks positive whole-unit quantities, cash, float, holdings, action
points, cooldown, maturity, default and the engine's domestic-only rule.
The engine remains authoritative. Foreign issues can be inspected but cannot
be traded; no unsupported FX settlement is invented.

## Source boundary

Native `actions/execute.ts` prices a neutral-fee order as
`round(units * faceValue * marketPrice * 100) / 100`, with a single rounding
of the entire order. Display quotes use the same contract. This slice changes
no engine formulas, pricing or issuance/coupon/maturity mechanics.

AHDGame `e364c0495`, `src/app/api/bonds/[bondId]/buy/route.ts` and the matching
sell route use bond quotes with dealer spreads and pool behavior. Native does
not implement that full market model, cross-currency settlement, corporate
servicing or sovereign default triggers. The interface exposes the current local
engine; it does not establish full bond-mechanics parity.

## Corporate issuer/state slice (#307)

The engine models corporate issuance identity only: `issuerType:
"corporation"` with `corporationId`, `CORPORATE_BOND_MATURITY_ISSUANCE_OPTIONS`
(96/240/336), home-currency denomination, full-float placement, and
issuer/owner invariant enforcement on issuance and on `buyBond`/`sellBond`.
Corporation records carry optional `countryOwnerId`/`ownershipState` (absent =
private). Corporate issues are inert in the turn pipeline until #308 (coupons,
maturity, buybacks, defaults) and #309 (phase timing). No save-envelope
migration: all new fields are optional and old saves round-trip byte-stable.
Focused evidence: `packages/engine/src/bonds/corporateBonds.test.ts`.

## Validation boundary

The genuine elected 1953 US save contains `bond-60-US` with 1000 face value,
par price, 3.75% annual coupon and maturity turn 108. The public GameSession
test buys two units for 2000, sells one for 1000, verifies invalid fractional
orders leave the save unchanged, then reloads the remaining unit. Display
queries are detached. Component tests cover quantity validation, overselling,
selected-issue dispatch and foreign settlement restrictions.

The production browser scenario loads that same save, trades, relaunches and
verifies the remaining holding at turn 98. It uses actual worker actions and
IndexedDB storage. Native phone lifecycle and performance remain unproven.

## Market visual (issue #143)

The panel adds one offline code-native comparison visual plus a selected-issue
hero, both computed from the already-projected listing fields:

- Yield to maturity per issue from the engine's verbatim
  `calculateBondYieldToMaturityPercent` (AHDGame
  `src/lib/constants/bonds.ts`), with annual coupon per unit, price-vs-par
  label and Sovereign/Defaulted/Matured badges mirroring the reference
  `BondHeroPanel`. Defaulted and matured issues show a dash, never a plotted
  recovery artifact.
- A "Compare issues" card (two or more issues only) scales each outstanding
  yield to the market maximum as a touch-sized (44px) selection row,
  alongside coupon, price-vs-par, turns remaining and status text.
- An ownership strip splits outstanding units into exactly the two slices the
  solo engine tracks — player holdings and public float — with a text
  equivalent behind `role="img"`. No holder roster or price history is
  invented; trend charts stay tracked separately (#375).

Bars are percentage-width divs with visible text values, so the layout holds
at 320px and 390px with no horizontal overflow. Component coverage lives in
`src/ui/BondMarketPanel.test.tsx`; display-math goldens in
`src/game/bondYield.test.ts`.
