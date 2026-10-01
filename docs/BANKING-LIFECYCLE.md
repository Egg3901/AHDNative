# Banking lifecycle evidence for #109

This is a partial parent implementation. The five closed child slices do not
establish complete banking parity. The original parent acceptance remains in
force, including player access to the bank lifecycle.

Reference rules: AHDGame `595a3b8a9e32e6a25848556a9e05ce5cc6d6e450`.
A subsequent refresh to `88199e778e5a0e73425362023fc9f98189525aa7` found no
changes in `src/lib/banking`, either banking turn, savings interest, or the
era-unit helper. The current desktop SP authority uses that Game base.

## Delivered behavior

- One shared charter table: retail/universal accept deposits, lend interbank,
  set rates and draw the window; investment/universal borrow interbank, run
  a prop book and draw margin. Investment charters service named loans without
  attracting household funding or originating household loans.
- Savings choices and direct holder selection require a deposit-taking charter
  and the player's savings currency. Interbank loans require matching currency
  rather than matching country. Native vault denomination remains the country's
  budget currency, with the exchange-rate row as fallback.
- Rate offsets validate as a pair before either writes. The 1953 preset uses
  deposit [-4, -0.5] and lending [0.5, 6]. The current source's unit helper gives
  1979, 1991 and 2019 the modern deposit [-4, 0.5], lending [0.25, 8] defaults.
  Optional country corridor overrides persist and replace each default
  independently. Setters reject out-of-range and nonfinite values.
- CB margin allows investment/universal charters to borrow at prime + 1.5,
  with principal plus arrears capped at half the cached prop mark. Repayment
  clamps to requested amount, principal and available vault cash.
- Window draws still round to whole units, cap principal at 25% of cash-backed
  NPC deposits and charge prime + 3. Repayment clamps to principal and refuses
  insufficient cash. Neither facility's repayment clears interest arrears,
  matching the reference.
- Both facilities update the central bank's `netMoneyCreatedLifetime` with
  advances and principal repayment. Facility interest pays into `reserveBalance`
  without cent rounding. A shortage accumulates in the correct arrears field.
  Saved facility turn keys prevent duplicate charges. The per-turn income
  fields currently record facility charges only; a complete banking-income
  audit remains a gap.
- Margin interest settles after interbank servicing inside `bankingTurn`;
  window interest follows in the adjacent `discountWindowTurn`. Both precede
  solvency. Existing share-price and bond writers remain before the solvency
  mark/liquidation consumer. No phase or RNG stream is reordered.
- Margin and window principal/arrears share the senior central-bank estate
  tier before depositors/interbank lenders. Only recovered estate cash burns
  and reduces the creation counter; unrecovered debt is extinguished.
- The Native `banking` switch freezes the entire cluster and its commands.
  Optional saved `bankPropTradingEnabled` defaults on when omitted and freezes
  interbank, margin and the prop desk while window servicing continues.

## Public-contract evidence

`src/game/bankingLifecycle.test.ts` uses engine-created worlds and explicit
bank-state save fixtures, real `GameSession` commands, actual turns and
serialization. Its combined case deposits savings, selects a bank, sets rates,
draws a window loan, lends interbank, opens equity, borrows margin, advances,
reloads, advances twice with byte-identical continued saves, closes the book
and repays all principal. This is engine/session evidence. It does not create
an advanced charter through the player UI or prove a CEO bank console.

Separate cases cover the cap including arrears, exact interest/counterparty
amounts, shortfall priority, policy freezes, rejected-command atomicity,
historical/modern/overridden corridors, malformed-save refusal without
replacing the live session, and unsafe historical projection refusal.

The estate case recovers a released Native save shape: an investment bank with
a window claim that older Native permitted. New investment window draws now
refuse. Existing retail borrower interbank debt remains serviceable and
repayable without silently changing its charter.

Independent expected amounts were captured by executing the actual pinned
database-free Game rule functions. Runtime dependencies used by the cases
come from the same git object. Import/re-export declarations are removed for
the isolated harness; the rule function bodies are unchanged. No Native engine
or Native formula supplies expected values. The harness does not execute Mongo
command wrappers or establish whole-game equivalence.

```sh
node scripts/banking-reference-vectors.mjs <AHDGame-clone> > reference.json
npm test -- src/game/bankingLifecycle.test.ts src/game/interbank.test.ts src/game/bankSelection.test.ts --maxWorkers=1
npm run test:ci --workspace @ahdclient/engine -- src/banking/interbank.test.ts src/banking/discountWindow.test.ts src/banking/propTrading.test.ts src/banking/bankSolvencyTurn.test.ts src/banking/bankingTurn.test.ts src/banking/migration.test.ts --maxWorkers=1
```

The recorded output is [the reference fixture](fixtures/banking-595a3b8.json).
For example, margin interest is 63.645833333333336 on 47,000 at 6.5% over 48
turns; window interest is 166.66833333333332 on 100,001 at 8%. A 100,000 margin
balance at 6.5% with only 40 cash pays 40 and accrues 95.41666666666666 arrears.
Targeted engine validation passed 119 tests across six banking suites.
Full app, UI, engine, content, browser and native checks belong to the PR gate.

Optional new policy/ledger fields are not materialized on untouched older
Native saves. Present malformed controls, corridors, debts, ledgers and turn
keys refuse at load. Historical schema 42 projection refuses facilities and
policy/accounting the old reader cannot execute; authentic empty-state golden
fixtures remain unchanged. Legacy facility repayment may make the creation
counter negative because the older save did not record the original mint.

## Required before parent closure

- Player charter issuance, switching/revocation and a reachable bank console
  using the reference CEO flow and permission conditions, including ownership
  prerequisites tracked in #51/#76.
- Bond, index-unit and forex proprietary positions, current home-currency
  valuation, the per-currency forex cap, and public name/ID reference resolution.
- Supervisory capital standing, stress and lifecycle limits on new exposure,
  distribution, type changes and liquidation; loan approval/blacklist state.
- The source deposit/insurance/backstop and full banking audit consumers still
  cut from the retail import, with savings settlement/rate work in #111 and
  the wider currency/transaction flow in #76.
- A complete player journey through all original banking acceptance, including
  stress/default downstream effects and saved continuation. Advanced-charter
  fixtures are not proof of that journey. Physical device gates remain separate.

Primary Game paths: `banking/rules/{capabilities,decide,facilityInterest,rates,
lifecycle,policy}.ts`, `banking/regulationQ.ts`, `banking/propTrading.ts`,
`banking/depositBookReturn.ts`, `turn/{bankingTurn,bankSolvencyTurn}.ts`, and
`constants/sectorSeedEra.ts`, all under `src/lib` at the pinned revision.
