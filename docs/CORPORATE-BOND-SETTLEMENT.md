# Corporate bond default settlement

Issue [#308](https://github.com/Egg3901/AHDNative/issues/308) retains the supported
Native bond lifecycle, including issuer-funded public-float buybacks, coupon and
maturity servicing. Unresolved private NPP defaults now settle after the source's
30-turn cure window instead of retaining frozen holdings indefinitely.

Authority: AHDGame `08820d108bf986d519aed28c2963690dd772c652`, specifically
`src/lib/turn/corporation/nppInsolvencyDissolution.ts`,
`src/lib/bonds/corporateBondDefault.ts`,
`src/lib/bonds/executeCorporationBondDefaultDissolution.ts`, and
`src/lib/corporations/restoreSectorsToUnowned.ts`. A refresh through `4d26e356`
found no changes to these mechanics.

The settlement uses nonnegative issuer cash plus 20% of positive sector NPV.
Bondholders receive a pro-rata senior recovery, then shareholders receive the
remaining estate. Native's per-turn profit basis annualizes over its existing
48-turn financial year before discounting at the source's 15% rate. With revenue
1,000,000, margin 10%, growth cost zero and cash 100,000, the supported valuation
is NPV 32,000,000 and salvage 6,400,000. A single 1,000 bond claim leaves
6,499,000 for equity. These are the existing local-currency financial units.

Player claims credit personal cash or the existing matching currency wallet.
Public equity float credits the country's central-bank reserve. Retired issuer
bonds, equity and sector rows disappear together; sector production returns to
the existing country/sector unowned pool. A saved settlement record retains each
bond's former units, recovery and unpaid claim, plus shareholder allocations.
A news item identifies the settlement and haircut.

Automatic settlement excludes player CEOs, suspended issuers and state-owned
corporations. In a scheduled command economy, soft Gosbank budgets also spare
private NPP issuers. Successful automatic dissolutions are capped at 25 per
turn, with distressed issuers ordered deterministically by liquid capital.
Legacy corporations with no CEO-type marker preserve their existing NPP meaning.

Unsupported market-pool accounts, escrow, restructuring and cross-corporate or
fund holdings remain outside #308's supported settlement scope. Native's
anonymous NPC equity has no personal wallet; its allocation is retained in the
ledger. Public-float bond recovery is likewise recorded without fabricating a
market-pool account. A foreign-denominated claim, unsupported player-owned
sector, missing reserve destination, invalid ownership or nonfinite estate
refuses before any balance or ownership mutation.

`corporateBondDefaultSettlement.test.ts` exercises the public create/turn/save
contract and exported settlement commands: source grace period and waterfall,
claimant ownership retirement, positive NPV and returned production, saved
history, atomic unsupported/invalid refusal, command-economy protection and the
25-issuer cap. The standard engine CI suite includes these ten regressions.
Earlier corporate servicing tests retain coupon, buyback and maturity coverage.
Full hosted verification and merged evidence belong in the issue completion
comment. This Linux evidence makes no physical-device claim.
