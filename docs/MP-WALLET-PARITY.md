# Authoritative multiplayer wallet

Reference source: AHDGame `6ed11a3d41f6dbc82b4cb81ab9d6fc90438208b9`,
`src/app/api/character/me/route.ts`, `src/lib/db/types/character.ts`, and
`src/app/profile/components/FinancialStrip.tsx`.
Savings follows `src/app/api/character/savings/{route,open/route,deposit/route,withdraw/route}.ts`
and the portfolio savings flow at the same source revision.

Expected player flow: Profile starts with character identity; the existing cash
footer and drawer Wallet destination open the live wallet, then Back returns to
Profile. Refresh keeps the destination and updates server balances. Account
expiry, unlink and account switching clear account data.

The existing character read already includes forex-gated `homeCurrency` and
`currencyBalances`: campaign funds in home-currency face value, personal cash
and savings by denomination. Native must show those balances without summing
different currencies or attaching a home-currency label to `cashOnHand`, which
is a server-computed wealth aggregate. Missing or malformed wallets leave the
existing aggregate available without fabricating a currency or zero balances.

Public test boundary: rendered `MpModeScreen` with its external `MpBridgeHost`
transport fixture. These are server-contract and player-flow tests, not proof of
an authenticated device session. Whole finance parity remains #76/#77/#510.

Savings loads on demand from Wallet. `GET /api/character/savings` supplies
`apyByCurrency` as a fraction, opened flags, currency balances, earned/pending
interest and turns until credit. Empty balance maps mean zero in the server
contract; missing or malformed maps are rejected. Opening uses `{currency}`;
deposit and withdrawal use `{currency, amount}`. The Rust bridge pins method
and path, validates the active currency enum and positive finite amount, and
strips additional caller fields. The server owns rounding, eligibility,
forex gating and sufficient-balance checks. Native never supplies a holder
override or performs optimistic accounting.

A successful response must identify the requested currency and, for transfers,
the accepted amount. Only after refreshing the character and savings does the
UI report success. Refusals retain prior balances and show the server message.
Expiry clears private state. A failed confirmation read reports the failure;
players must refresh before another attempt. Session generations reject late
reads/results after exit or relinking the same account. HTTPS server portraits
now reach the shared Profile identity; unsafe URLs fall back to initials.

Evidence: nine public-session savings tests, three rendered wallet flows, the
existing session/bridge suites, and browser flows at 320/390/1280px. Browser
flows cover large text, large balances, currency selection, account opening,
deposit, withdrawal, refused transfer and return to Profile. They use a native
transport fixture; authenticated service and physical-device acceptance remain
open. Bank selection, routing, loans, FX conversion/trading, holdings and
monetary-policy controls remain outside this delivered slice.
