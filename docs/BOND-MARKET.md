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
bonds or sovereign default triggers. The interface exposes the current local
engine; it does not establish full bond-mechanics parity.

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
