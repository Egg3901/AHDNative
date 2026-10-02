# Paid executive taking checkpoint

This remains partial work on #75. Its four broad original acceptance criteria
remain unchecked. The current reference is AHDGame
`cb66acdf0129616b8a09902727e9b58715c8bacb`; AHDClient remains
`799a992054609d231930bbf062251b93590ccf68`.

The source implementation is `src/lib/nationalization/compensation.ts`,
`nationalizeCorporation.ts`, `investorConfidence.ts`, `concentration.ts` and
the nationalization register projection. Independent execution of those source
functions established the payout, treasury and political vectors below before
Native assertions were added.

The player chooses fair value, discounted value or seizure through the existing
national company entry. Compensation uses the actual plant book and paid
construction, cash and assumed debt. Debt offsets cash first, then book. The
plants book premium is 1; fair and discounted tier multipliers are 1 and 0.5.
Cash is not multiplied by a book premium. Shareholder payouts are floored
individually; public float receipts return to the treasury. Treasury debit may
overdraw the balance, as in the source. Unmatured bonds transfer to the national
issuer; the source has no NPP personal wallet to invent.

| Taking | Total payout | Player receipt | Public float receipt | Treasury change |
| --- | ---: | ---: | ---: | ---: |
| Fair vector | 330000 | 99000 | 132000 | -97000 |
| Discounted vector | 165000 | 49500 | 66000 | 2000 |
| Seizure vector | 0 | 0 | 0 | 101000 |

The independent cash 200000, book 0, debt 100000 discounted vector pays 50000;
its existing cash settlement gives the player 165000 and the treasury 21000.
These are source vector outputs, not predicted balancing entries.

At ownership concentration 0, fair/discounted/seizure confidence damage is
2/5.3/14 and the political board effect is +2.5/+3.75/+5. At concentration 100,
confidence damage is 7/10.3/19 and the board effect is
-5.833333333333333/-8.75/-11.666666666666666. Governing-party economic position
uses the actual source event input; absent executive party identity uses its
source neutral default. Ownership concentration comes from actual plant output
receipts in the relevant currency, not the count of issuer records. Native's
host-country receipts are converted to the source owner-country denominator.

Local app typechecking, 20 focused engine cases, 14 public session cases, the
profile portrait persistence browser case, and the actual paid-taking worker
browser journey passed on `936a4f9`. The browser journey performs a taking,
reads a positive register payout, advances an ordinary turn, saves, reloads,
and resumes again at 320px and 390px. It does not establish physical-device or
current AHDClient save interchange acceptance. The actual immutable schema56
reader rejects a real schema57 paid-taking save; earlier history remains absent.

The next combined integration has primary and Electoral College changes plus
country-scoped parliamentary career appointments. Its full gate is pending.
Additional semantic field families keep their actual version boundaries; no
historical taking, confidence, primary result or PM vote is fabricated on load.

Still required for complete #75: a fresh national company entry, primary and
secondary national issuer routing, strategic and monopoly triggers, legislation
and sector taking, notice/cure windows, IPO/auctions, state operations and
planning, special courts, and the source leader/confidence substrate. The
current CountryLeaderState/popularLegitimacy producer is not present, so no
proxy is claimed as complete CN/RU/DD leader parity.
