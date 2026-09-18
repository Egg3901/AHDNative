import { describe, expect, it } from "vitest";
import { createWorld, SCHEMA_VERSION } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { deserializeSave, serializeSave } from "../save.js";
import type { Corporation } from "../corporation/types.js";
import { bankEquity } from "./balanceSheet.js";
import { bankSolvencyTurnPhase } from "./bankSolvencyTurn.js";
import { CONTAGION_PANIC_TURNS } from "./constants.js";
import {
  charterTypeOf,
  closePropPosition,
  computePropEquityBase,
  forceLiquidateToLeverageCap,
  isDepositTakingCharter,
  isPropCharter,
  markEquityPosition,
  markPropBook,
  openPropPosition,
  propBankFails,
  sumPositionMarks,
  PROP_LEVERAGE_MULTIPLE,
} from "./propTrading.js";

const OPTS = {
  seed: "prop-trading-test",
  playerName: "P",
  countryId: "US",
  era: "1953",
};
const STAMP = "2026-09-18T00:00:00.000Z";

function freshWorld(seedSuffix: string) {
  return createWorld({ ...OPTS, seed: `${OPTS.seed}-${seedSuffix}` });
}

/** Bank corp flipped to a synthetic investment charter, the same pattern bankingTurn uses for synthetic named loans. */
function investmentBank(
  world: ReturnType<typeof createWorld>,
  cash = 1_000_000,
): Corporation {
  const corp = world.corporations["US-financial"]!;
  const charter = corp.bankCharter!;
  charter.charterType = "investment";
  charter.cashReserves = cash;
  charter.propBook = [];
  charter.propBookMarkValue = 0;
  return corp;
}

/** Any non-bank corporation with a live price, pinned to a fixed sharePrice for determinism. */
function equityTarget(
  world: ReturnType<typeof createWorld>,
  bankId: string,
  price = 100,
): Corporation {
  const target = Object.values(world.corporations).find(
    (c) => c.id !== bankId && c.sharePrice > 0,
  )!;
  target.sharePrice = price;
  return target;
}

function runSolvency(world: ReturnType<typeof createWorld>): void {
  world.meta.turn = 1;
  bankSolvencyTurnPhase.run(world, rngFromSeed("prop-solvency-rng"));
}

describe("prop charter gates (#328)", () => {
  it("absent charter type means retail: no prop book, takes deposits", () => {
    const world = freshWorld("gates");
    const charter = world.corporations["US-financial"]!.bankCharter!;
    delete charter.charterType;
    expect(charterTypeOf(charter)).toBe("retail");
    expect(isPropCharter(charter)).toBe(false);
    expect(isDepositTakingCharter(charter)).toBe(true);
  });

  it("investment charters run a book but take no deposits; universal does both", () => {
    const world = freshWorld("gates-2");
    const charter = world.corporations["US-financial"]!.bankCharter!;
    charter.charterType = "investment";
    expect(isPropCharter(charter)).toBe(true);
    expect(isDepositTakingCharter(charter)).toBe(false);
    charter.charterType = "universal";
    expect(isPropCharter(charter)).toBe(true);
    expect(isDepositTakingCharter(charter)).toBe(true);
  });

  it("a failed investment charter keeps neither capability", () => {
    const world = freshWorld("gates-3");
    const corp = investmentBank(world);
    corp.bankCharter!.status = "failed";
    expect(isPropCharter(corp.bankCharter)).toBe(false);
    expect(isDepositTakingCharter(corp.bankCharter)).toBe(false);
  });
});

describe("prop equity base and marks (#328)", () => {
  it("sums bank cash plus mark and nets interbank and CB margin debt", () => {
    expect(
      computePropEquityBase(500, {
        propBookMarkValue: 900,
        interbankDebt: 50,
        cbMarginDebt: 20,
      }),
    ).toBe(1330);
  });

  it("does not add posted capital on top of the cash it already sits inside", () => {
    // Source: posting capital moves cash into cashReserves and increments the
    // memo, so adding both counts the same money twice.
    const charter = { propBookMarkValue: 0, interbankDebt: 0, cbMarginDebt: 0 };
    expect(computePropEquityBase(500, charter)).toBe(500);
  });

  it("falls back to summing position marks when the cache is absent", () => {
    const charter = {
      propBook: [
        {
          asset: "equity" as const,
          ref: "X",
          units: 10,
          costBasis: 100,
          markValue: 150,
        },
        { asset: "equity" as const, ref: "Y", units: 5, costBasis: 200 },
      ],
    };
    expect(computePropEquityBase(100, charter)).toBe(100 + 150 + 200);
  });

  it("sumPositionMarks prefers the live mark, falls back to cost, and clamps negatives", () => {
    expect(sumPositionMarks(undefined)).toBe(0);
    expect(sumPositionMarks([])).toBe(0);
    expect(
      sumPositionMarks([
        { asset: "equity", ref: "X", units: 1, costBasis: 100, markValue: 120 },
        { asset: "equity", ref: "Y", units: 1, costBasis: 80 },
        { asset: "equity", ref: "Z", units: 1, costBasis: 50, markValue: -10 },
      ]),
    ).toBe(200);
  });

  it("marks equity at units times sharePrice and misses at zero", () => {
    const world = freshWorld("marks");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 25);
    expect(markEquityPosition(world, { ref: target.id, units: 40 })).toBe(1000);
    expect(markEquityPosition(world, { ref: "no-such-corp", units: 40 })).toBe(
      0,
    );
    expect(markEquityPosition(world, { ref: target.id, units: 0 })).toBe(0);
    target.sharePrice = 0;
    expect(markEquityPosition(world, { ref: target.id, units: 40 })).toBe(0);
  });
});

describe("openPropPosition (#328)", () => {
  it("opens a position: cash debited at the live mark into cost basis", () => {
    const world = freshWorld("open");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    const before = bank.bankCharter!.cashReserves;
    const result = openPropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(5000);
    expect(result.position).toMatchObject({
      asset: "equity",
      ref: target.id,
      units: 100,
      costBasis: 5000,
    });
    expect(bank.bankCharter!.cashReserves).toBe(before - 5000);
    expect(bank.bankCharter!.propBookMarkValue).toBe(5000);
  });

  it("adds to an existing row instead of duplicating it", () => {
    const world = freshWorld("open-add");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    openPropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 100,
    });
    const result = openPropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.position.units).toBe(150);
    expect(result.position.costBasis).toBe(7500);
    expect(bank.bankCharter!.propBook!.length).toBe(1);
  });

  it("refuses a retail charter, an unknown bank, and a non-equity asset", () => {
    const world = freshWorld("open-refuse");
    const bank = world.corporations["US-financial"]!;
    const target = equityTarget(world, bank.id, 50);
    expect(
      openPropPosition(world, {
        bankCorpId: bank.id,
        ref: target.id,
        asset: "equity",
        units: 10,
      }),
    ).toEqual({
      ok: false,
      error: "Only active investment or universal charters may run a prop book",
    });
    expect(
      openPropPosition(world, {
        bankCorpId: "no-such-bank",
        ref: target.id,
        asset: "equity",
        units: 10,
      }),
    ).toEqual({ ok: false, error: "This corporation has no bank charter." });
    investmentBank(world);
    expect(
      openPropPosition(world, {
        bankCorpId: bank.id,
        ref: "USD",
        asset: "forex",
        units: 10,
      }),
    ).toEqual({
      ok: false,
      error: "Prop positions in forex are not supported yet",
    });
  });

  it("refuses bad units, a missing ref, an unknown equity, and an unpriceable one", () => {
    const world = freshWorld("open-validate");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    for (const units of [0, -5, Number.NaN]) {
      expect(
        openPropPosition(world, {
          bankCorpId: bank.id,
          ref: target.id,
          asset: "equity",
          units,
        }),
      ).toEqual({ ok: false, error: "Units must be a positive number" });
    }
    expect(
      openPropPosition(world, {
        bankCorpId: bank.id,
        ref: "   ",
        asset: "equity",
        units: 10,
      }),
    ).toEqual({ ok: false, error: "Position ref is required" });
    expect(
      openPropPosition(world, {
        bankCorpId: bank.id,
        ref: "no-such-corp",
        asset: "equity",
        units: 10,
      }),
    ).toEqual({ ok: false, error: "Equity corporation not found" });
    target.sharePrice = 0;
    expect(
      openPropPosition(world, {
        bankCorpId: bank.id,
        ref: target.id,
        asset: "equity",
        units: 10,
      }),
    ).toEqual({
      ok: false,
      error: "Could not price position (missing market data)",
    });
  });

  it("refuses purchases beyond liquid cash and past the leverage multiple, atomically", () => {
    const world = freshWorld("open-limits");
    const bank = investmentBank(world, 1000);
    const target = equityTarget(world, bank.id, 50);
    const snapshot = JSON.stringify(bank.bankCharter);
    expect(
      openPropPosition(world, {
        bankCorpId: bank.id,
        ref: target.id,
        asset: "equity",
        units: 100,
      }),
    ).toEqual({ ok: false, error: "Insufficient liquid capital for purchase" });
    expect(JSON.stringify(bank.bankCharter)).toBe(snapshot);

    // Cash covers the ticket but interbank debt leaves no leverage headroom:
    // nextMark 5000 > 3 * (9500 - 5000 + 5000 - 9000) = 1500.
    bank.bankCharter!.cashReserves = 9500;
    bank.bankCharter!.interbankDebt = 9000;
    const leveraged = JSON.stringify(bank.bankCharter);
    expect(
      openPropPosition(world, {
        bankCorpId: bank.id,
        ref: target.id,
        asset: "equity",
        units: 100,
      }),
    ).toEqual({
      ok: false,
      error: "Trade would breach prop leverage multiple",
    });
    expect(JSON.stringify(bank.bankCharter)).toBe(leveraged);
  });
});

describe("closePropPosition (#328)", () => {
  it("closes the full row at the live mark and books realized P&L", () => {
    const world = freshWorld("close");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    openPropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 100,
    });
    target.sharePrice = 70; // 2000 gain before the close
    const cashBefore = bank.bankCharter!.cashReserves;
    const result = closePropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proceeds).toBe(7000);
    expect(result.realizedPnl).toBe(2000);
    expect(result.cashReserves).toBe(cashBefore + 7000);
    expect(bank.bankCharter!.propBook).toEqual([]);
    expect(bank.bankCharter!.propBookMarkValue).toBe(0);
  });

  it("partially closes pro-rata and keeps the remainder", () => {
    const world = freshWorld("close-partial");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    openPropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 100,
    });
    const result = closePropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 40,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proceeds).toBe(2000);
    expect(result.realizedPnl).toBe(0);
    const [row] = bank.bankCharter!.propBook!;
    expect(row!.units).toBe(60);
    expect(row!.costBasis).toBe(3000);
    expect(bank.bankCharter!.propBookMarkValue).toBe(3000);
  });

  it("refuses unknown rows and over-closes atomically", () => {
    const world = freshWorld("close-refuse");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    openPropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 10,
    });
    const snapshot = JSON.stringify(bank.bankCharter);
    expect(
      closePropPosition(world, {
        bankCorpId: bank.id,
        ref: "no-such-row",
        asset: "equity",
        units: 1,
      }),
    ).toEqual({ ok: false, error: "Position not found" });
    expect(
      closePropPosition(world, {
        bankCorpId: bank.id,
        ref: target.id,
        asset: "equity",
        units: 11,
      }),
    ).toEqual({ ok: false, error: "Cannot close more units than held" });
    expect(JSON.stringify(bank.bankCharter)).toBe(snapshot);
  });
});

describe("forceLiquidateToLeverageCap (#328)", () => {
  it(`leaves a book inside ${PROP_LEVERAGE_MULTIPLE}x equity alone but refreshes stale marks`, () => {
    const world = freshWorld("liq-quiet");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    bank.bankCharter!.propBook = [
      {
        asset: "equity",
        ref: target.id,
        units: 100,
        costBasis: 4000,
        markValue: 1,
      },
    ];
    const cashBefore = bank.bankCharter!.cashReserves;
    const result = forceLiquidateToLeverageCap(world, bank.id);
    expect(result.forced).toBe(false);
    expect(result.cashReserves).toBe(cashBefore);
    expect(bank.bankCharter!.propBookMarkValue).toBe(5000);
  });

  it("shrinks every row proportionally to the cap and returns the sold marks as cash", () => {
    const world = freshWorld("liq-breach");
    const bank = investmentBank(world, 100_000);
    const target = equityTarget(world, bank.id, 100);
    bank.bankCharter!.interbankDebt = 400_000;
    bank.bankCharter!.propBook = [
      { asset: "equity", ref: target.id, units: 3000, costBasis: 300_000 },
    ];
    bank.bankCharter!.propBookMarkValue = 0; // stale cache; the turn re-marks first
    const result = forceLiquidateToLeverageCap(world, bank.id);
    expect(result.forced).toBe(true);
    // Equity at fresh marks is 100k + 300k - 400k = 0, so the cap is 0 and
    // the whole book converts back to cash.
    expect(bank.bankCharter!.propBook).toEqual([]);
    expect(bank.bankCharter!.propBookMarkValue).toBe(0);
    expect(bank.bankCharter!.cashReserves).toBe(400_000);
  });

  it("holds a partial book when the cap still covers part of the mark", () => {
    const world = freshWorld("liq-partial");
    const bank = investmentBank(world, 100_000);
    const target = equityTarget(world, bank.id, 100);
    bank.bankCharter!.interbankDebt = 350_000;
    bank.bankCharter!.propBook = [
      { asset: "equity", ref: target.id, units: 3000, costBasis: 300_000 },
    ];
    const result = forceLiquidateToLeverageCap(world, bank.id);
    // Equity at fresh marks is 100k + 300k - 350k = 50k, cap 150k, so the
    // book halves: 150k of marks sell back to cash.
    expect(result.forced).toBe(true);
    expect(bank.bankCharter!.propBook).toEqual([
      {
        asset: "equity",
        ref: target.id,
        units: 1500,
        costBasis: 150_000,
        markValue: 150_000,
      },
    ]);
    expect(bank.bankCharter!.propBookMarkValue).toBe(150_000);
    expect(bank.bankCharter!.cashReserves).toBe(250_000);
  });
});

describe("propBankFails (#328)", () => {
  it("fails only a red bank with no equity behind its book", () => {
    expect(propBankFails({ band: "red", equityBase: 0 })).toBe(true);
    expect(propBankFails({ band: "red", equityBase: -50 })).toBe(true);
    expect(propBankFails({ band: "red", equityBase: 1 })).toBe(false);
    expect(propBankFails({ band: "amber", equityBase: 0 })).toBe(false);
    expect(propBankFails({ band: "green", equityBase: -100 })).toBe(false);
  });
});

describe("bankSolvencyTurn prop leg (#328)", () => {
  it("marks the book before confidence and shrinks a leverage breach with the penalty", () => {
    const world = freshWorld("solvency-liq");
    const bank = investmentBank(world, 100_000);
    const target = equityTarget(world, bank.id, 100);
    bank.bankCharter!.interbankDebt = 400_000;
    bank.bankCharter!.propBook = [
      { asset: "equity", ref: target.id, units: 3000, costBasis: 300_000 },
    ];
    bank.bankCharter!.propBookMarkValue = 0;
    bank.bankCharter!.confidence = 1;
    bank.bankCharter!.warningBand = "green";
    runSolvency(world);
    // Full liquidation at zero equity (see forceLiquidate test), so the bank
    // survives on its returned cash but carries the forced-liquidation mark.
    expect(bank.bankCharter!.status).toBe("active");
    expect(bank.bankCharter!.propBook).toEqual([]);
    expect(bank.bankCharter!.cashReserves).toBe(400_000);
    expect(bank.bankCharter!.confidence).toBeCloseTo(0.85, 6);
  });

  it("fails a red investment bank with no equity and clears the book without contagion", () => {
    const world = freshWorld("solvency-fail");
    const bank = investmentBank(world, 0);
    const target = equityTarget(world, bank.id, 100);
    bank.bankCharter!.interbankDebt = 200_000;
    bank.bankCharter!.postedCapital = 0;
    bank.bankCharter!.propBook = [
      { asset: "equity", ref: target.id, units: 1000, costBasis: 100_000 },
    ];
    bank.bankCharter!.warningBand = "red";
    bank.bankCharter!.panicTurns = 4;
    // Panic keeps the recomputed band red even after the forced sale returns
    // cash: 1 - 0.48 - 0.15 = 0.37. Equity stays negative (100k cash against
    // 200k of margin debt), so the red/no-equity failure test fires.
    const peerPanics = Object.values(world.corporations)
      .filter((c) => c.bankCharter && c.id !== bank.id)
      .map((c) => c.bankCharter!.panicTurns);
    runSolvency(world);
    expect(bank.bankCharter!.status).toBe("failed");
    expect(bank.bankCharter!.propBook).toEqual([]);
    expect(bank.bankCharter!.propBookMarkValue).toBe(0);
    // Source: contagion peers are stamped only on a deposit-taker failure.
    for (const [i, corp] of Object.values(world.corporations)
      .filter((c) => c.bankCharter && c.id !== bank.id)
      .entries()) {
      expect(corp.bankCharter!.panicTurns).toBe(peerPanics[i]);
    }
  });

  it("stamps a deposit-taking peer but not an investment peer when a deposit-taker fails", () => {
    const world = freshWorld("solvency-contagion-dir");
    const failing = world.corporations["US-financial"]!;
    // Synthetic same-country peers (solo seeds one bank per country).
    // Copied before mutation so each charter below is set independently.
    const investmentPeer = {
      ...failing,
      id: "US-investment-peer",
      bankCharter: { ...failing.bankCharter! },
    };
    const universalPeer = {
      ...failing,
      id: "US-universal-peer",
      bankCharter: { ...failing.bankCharter! },
    };
    world.corporations["US-investment-peer"] = investmentPeer;
    world.corporations["US-universal-peer"] = universalPeer;
    failing.bankCharter!.warningBand = "red";
    failing.bankCharter!.npcDeposits = 1_000_000;
    failing.bankCharter!.cashReserves = 10_000;
    failing.bankCharter!.postedCapital = 50_000;
    investmentPeer.bankCharter!.charterType = "investment";
    investmentPeer.bankCharter!.warningBand = "green";
    investmentPeer.bankCharter!.npcDeposits = 0;
    investmentPeer.bankCharter!.cashReserves = 1_000_000;
    investmentPeer.bankCharter!.panicTurns = 0;
    universalPeer.bankCharter!.charterType = "universal";
    universalPeer.bankCharter!.warningBand = "green";
    universalPeer.bankCharter!.npcDeposits = 50_000;
    universalPeer.bankCharter!.cashReserves = 50_000;
    universalPeer.bankCharter!.panicTurns = 0;
    runSolvency(world);
    expect(failing.bankCharter!.status).toBe("failed");
    // Source: only a deposit-taking peer receives the panic bump.
    expect(investmentPeer.bankCharter!.status).toBe("active");
    expect(investmentPeer.bankCharter!.panicTurns).toBe(0);
    expect(universalPeer.bankCharter!.panicTurns).toBe(CONTAGION_PANIC_TURNS);
  });

  it("applies no deposit flight to an investment charter", () => {
    const world = freshWorld("solvency-noflight");
    const bank = investmentBank(world, 1_000_000);
    bank.bankCharter!.warningBand = "amber";
    bank.bankCharter!.npcDeposits = 100_000;
    runSolvency(world);
    expect(bank.bankCharter!.status).toBe("active");
    expect(bank.bankCharter!.npcDeposits).toBe(100_000);
    expect(bank.bankCharter!.cashReserves).toBe(1_000_000);
  });
});

describe("prop mark is not distributable equity (#328)", () => {
  it("bankEquity reads the same with or without a prop mark", () => {
    const charter = {
      cashReserves: 500,
      totalLoans: 700,
      npcDeposits: 800,
      interbankDebt: 100,
    };
    expect(bankEquity({ ...charter, propBookMarkValue: 1_000_000 })).toBe(
      bankEquity(charter),
    );
  });

  it("markPropBook is pure: it prices rows without moving cash", () => {
    const world = freshWorld("mark-pure");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    bank.bankCharter!.propBook = [
      { asset: "equity", ref: target.id, units: 100, costBasis: 4000 },
    ];
    const cashBefore = bank.bankCharter!.cashReserves;
    const marked = markPropBook(world, bank.bankCharter!);
    expect(marked.mark).toBe(5000);
    expect(marked.positions[0]!.markValue).toBe(5000);
    expect(bank.bankCharter!.cashReserves).toBe(cashBefore);
    expect(bank.bankCharter!.propBook![0]!.markValue).toBeUndefined();
  });
});

describe("prop save compatibility (#328)", () => {
  function saveJson(
    world: ReturnType<typeof createWorld>,
  ): Record<string, any> {
    return JSON.parse(serializeSave(world, STAMP));
  }

  it("loads a pre-#328 charter as retail with an empty book and zero mark", () => {
    const world = freshWorld("save-old");
    const raw = saveJson(world);
    const charter = raw.world.corporations["US-financial"].bankCharter;
    delete charter.charterType;
    delete charter.propBook;
    delete charter.propBookMarkValue;
    const loaded = deserializeSave(JSON.stringify(raw));
    const reloaded = loaded.corporations["US-financial"]!.bankCharter!;
    expect(reloaded.charterType).toBe("retail");
    expect(reloaded.propBook).toEqual([]);
    expect(reloaded.propBookMarkValue).toBe(0);
    expect(isPropCharter(reloaded)).toBe(false);
  });

  it("round-trips a live book byte-identically", () => {
    const world = freshWorld("save-roundtrip");
    const bank = investmentBank(world);
    const target = equityTarget(world, bank.id, 50);
    const opened = openPropPosition(world, {
      bankCorpId: bank.id,
      ref: target.id,
      asset: "equity",
      units: 100,
    });
    expect(opened.ok).toBe(true);
    const before = JSON.stringify(world.corporations[bank.id]!.bankCharter);
    const loaded = deserializeSave(serializeSave(world, STAMP));
    expect(JSON.stringify(loaded.corporations[bank.id]!.bankCharter)).toBe(
      before,
    );
    const again = deserializeSave(serializeSave(loaded, STAMP));
    expect(JSON.stringify(again.corporations[bank.id]!.bankCharter)).toBe(
      before,
    );
  });

  it("fails closed on present-but-invalid prop state", () => {
    const world = freshWorld("save-invalid");
    const cases: Array<(charter: Record<string, unknown>) => void> = [
      (c) => {
        c["charterType"] = "wholesale";
      },
      (c) => {
        c["charterType"] = "investment";
        c["propBook"] = "not-a-book";
      },
      (c) => {
        c["charterType"] = "investment";
        c["propBook"] = [
          { asset: "equity", ref: "", units: 10, costBasis: 100 },
        ];
      },
      (c) => {
        c["charterType"] = "investment";
        c["propBook"] = [
          { asset: "equity", ref: "X", units: -10, costBasis: 100 },
        ];
      },
      (c) => {
        c["charterType"] = "investment";
        c["propBook"] = [];
        c["propBookMarkValue"] = -5;
      },
    ];
    for (const mutate of cases) {
      const raw = saveJson(world);
      mutate(raw.world.corporations["US-financial"].bankCharter);
      expect(() => deserializeSave(JSON.stringify(raw))).toThrow();
    }
  });
});
