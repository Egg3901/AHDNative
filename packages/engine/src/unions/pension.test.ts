/**
 * Pension pure-rule regression tests — #315.
 *
 * Every constant is pinned to its AHDGame source value
 * (src/lib/pensions/rules.ts at e364c0495); every function is exercised
 * through the public pension.ts contract including edges, and the
 * validators prove fail-closed save behavior. No turn, no world.
 */
import { describe, expect, it } from "vitest";
import {
  describeFundingBand,
  employerPensionCostForTurn,
  EMPTY_EMPLOYER_PENSION_COST,
  isValidContributionRate,
  pensionAccrualForTurn,
  pensionBenefitPayment,
  pensionBenefitsDueForTurn,
  pensionContributionForTurn,
  pensionCurrencyForCountry,
  pensionFundingBand,
  pensionFundingRatio,
  pensionFundingStatus,
  pensionInvestableCash,
  pensionRecordIdFor,
  pensionRetirementsForTurn,
  pensionSchemeAssets,
  pensionTopUpForTurn,
  validatePensionLedger,
  validatePensionScheme,
  validatePensionSchemes,
  PENSION_ACCRUAL_RATE,
  PENSION_BENEFIT_DRAWDOWN_RATE,
  PENSION_CASH_FLOOR_FRACTION,
  PENSION_CONTRIBUTION_RATE_MAX,
  PENSION_CONTRIBUTION_RATE_MIN,
  PENSION_CRITICAL_RATIO,
  PENSION_DEFICIT_RATIO,
  PENSION_LIQUIDITY_BUFFER_TURNS,
  PENSION_MIN_INVESTMENT_ANCHOR,
  PENSION_RETIREMENT_RATE,
  PENSION_TOPUP_FRACTION,
  type PensionLedgerRecord,
  type PensionScheme,
} from "./pension.js";

function scheme(overrides: Partial<PensionScheme> = {}): PensionScheme {
  return {
    id: "US-manufacturing",
    countryId: "US",
    unionName: "Test Union",
    assets: 0,
    liabilities: 0,
    totalContributions: 0,
    totalTopUps: 0,
    createdAtTurn: 0,
    ...overrides,
  };
}

function worldWithUnion() {
  return {
    unions: {
      "US-manufacturing": { id: "US-manufacturing", countryId: "US" },
    },
  } as Parameters<typeof validatePensionScheme>[0];
}

describe("pension constants (no invented numbers)", () => {
  it("pins every source rate and threshold", () => {
    // src/lib/pensions/rules.ts at e364c0495.
    expect(PENSION_CONTRIBUTION_RATE_MIN).toBe(0);
    expect(PENSION_CONTRIBUTION_RATE_MAX).toBe(0.15);
    expect(PENSION_ACCRUAL_RATE).toBe(0.08);
    expect(PENSION_DEFICIT_RATIO).toBe(0.9);
    expect(PENSION_TOPUP_FRACTION).toBe(0.05);
    expect(PENSION_CRITICAL_RATIO).toBe(0.6);
    expect(PENSION_RETIREMENT_RATE).toBe(0.01);
    expect(PENSION_BENEFIT_DRAWDOWN_RATE).toBe(0.02);
    expect(PENSION_LIQUIDITY_BUFFER_TURNS).toBe(8);
    expect(PENSION_CASH_FLOOR_FRACTION).toBe(0.1);
    expect(PENSION_MIN_INVESTMENT_ANCHOR).toBe(1000);
  });
});

describe("funding ratio and bands", () => {
  it("treats a scheme with no liabilities as funded, not division by zero", () => {
    expect(pensionFundingRatio(0, 0)).toBe(1);
    expect(pensionFundingRatio(500, 0)).toBe(1);
    expect(pensionFundingRatio(500, -3)).toBe(1);
  });

  it("treats no assets against a promise as zero", () => {
    expect(pensionFundingRatio(0, 1000)).toBe(0);
    expect(pensionFundingRatio(-5, 1000)).toBe(0);
  });

  it("divides assets by liabilities otherwise", () => {
    expect(pensionFundingRatio(850, 1000)).toBeCloseTo(0.85, 12);
  });

  it("bands surplus above 1.1, funded at and below it", () => {
    expect(pensionFundingBand(1.2)).toBe("surplus");
    expect(pensionFundingBand(1.1)).toBe("funded");
    expect(pensionFundingBand(1)).toBe("funded");
  });

  it("bands deficit below 0.9 and critical below 0.6", () => {
    expect(pensionFundingBand(0.9)).toBe("funded");
    expect(pensionFundingBand(0.89)).toBe("deficit");
    expect(pensionFundingBand(0.6)).toBe("deficit");
    expect(pensionFundingBand(0.59)).toBe("critical");
  });

  it("reads total assets through cash plus invested value", () => {
    expect(pensionSchemeAssets({ assets: 400 })).toBe(400);
    expect(pensionSchemeAssets({ assets: 400, investedValue: 600 })).toBe(1000);
    expect(pensionSchemeAssets({ assets: -10, investedValue: NaN })).toBe(0);
  });

  it("describes every band in the source's own words", () => {
    expect(describeFundingBand("surplus")).toBe(
      "The scheme holds more than it owes. There is room to bargain the contribution rate down, or the pension up.",
    );
    expect(describeFundingBand("funded")).toBe("The scheme can cover what it has promised.");
    expect(describeFundingBand("deficit")).toBe(
      "The scheme is short. The employer is being asked for a top-up every turn until it recovers.",
    );
    expect(describeFundingBand("critical")).toBe(
      "The scheme is badly short of what it owes. Top-ups alone will take a long time to close this.",
    );
  });
});

describe("contribution, accrual and top-up math", () => {
  it("validates the 0..0.15 contribution band", () => {
    expect(isValidContributionRate(0)).toBe(true);
    expect(isValidContributionRate(0.15)).toBe(true);
    expect(isValidContributionRate(0.05)).toBe(true);
    expect(isValidContributionRate(-0.01)).toBe(false);
    expect(isValidContributionRate(0.15001)).toBe(false);
    expect(isValidContributionRate(NaN)).toBe(false);
    expect(isValidContributionRate(Infinity)).toBe(false);
  });

  it("charges rate times the covered wage bill, nothing for no bill or no rate", () => {
    expect(pensionContributionForTurn({ coveredWageBill: 1000, contributionRate: 0.05 })).toBe(50);
    expect(pensionContributionForTurn({ coveredWageBill: 0, contributionRate: 0.05 })).toBe(0);
    expect(pensionContributionForTurn({ coveredWageBill: -4, contributionRate: 0.05 })).toBe(0);
    expect(pensionContributionForTurn({ coveredWageBill: 1000, contributionRate: 0 })).toBe(0);
    expect(pensionContributionForTurn({ coveredWageBill: 1000, contributionRate: 0.99 })).toBe(0);
    expect(pensionContributionForTurn({ coveredWageBill: NaN, contributionRate: 0.05 })).toBe(0);
  });

  it("accrues 8% of the same wage bill, so a max-rate scheme builds surplus", () => {
    expect(pensionAccrualForTurn(1000)).toBe(80);
    expect(pensionAccrualForTurn(0)).toBe(0);
    expect(pensionAccrualForTurn(-2)).toBe(0);
    // 15% in against 8% promised: surplus. 5% in against 8%: deficit drift.
    expect(1000 * PENSION_CONTRIBUTION_RATE_MAX).toBeGreaterThan(pensionAccrualForTurn(1000));
  });

  it("asks a balanced scheme for no top-up", () => {
    expect(pensionTopUpForTurn({ assets: 900, liabilities: 1000 })).toBe(0);
    expect(pensionTopUpForTurn({ assets: 1000, liabilities: 1000 })).toBe(0);
    expect(pensionTopUpForTurn({ assets: 0, liabilities: 0 })).toBe(0);
  });

  it("asks 5% of the shortfall below the 0.9 line, so a nearly-funded scheme asks nearly nothing", () => {
    // Target 900, shortfall 800, fraction 0.05 => 40.
    expect(pensionTopUpForTurn({ assets: 100, liabilities: 1000 })).toBe(40);
    expect(pensionTopUpForTurn({ assets: 899, liabilities: 1000 })).toBeCloseTo(0.05, 12);
  });
});

describe("retirement, benefit and cut math", () => {
  it("retires 1% of the not-yet-in-payment liability, never exceeding the promise", () => {
    expect(pensionRetirementsForTurn({ liabilities: 1000, benefitsInPayment: 100 })).toBe(9);
    expect(pensionRetirementsForTurn({ liabilities: 1000, benefitsInPayment: 1000 })).toBe(0);
    expect(pensionRetirementsForTurn({ liabilities: 100, benefitsInPayment: 200 })).toBe(0);
    expect(pensionRetirementsForTurn({ liabilities: 0, benefitsInPayment: 0 })).toBe(0);
  });

  it("owes 2% of the in-payment stock", () => {
    expect(pensionBenefitsDueForTurn(1000)).toBe(20);
    expect(pensionBenefitsDueForTurn(0)).toBe(0);
  });

  it("pays in full when cash covers the drawdown", () => {
    expect(pensionBenefitPayment({ benefitsDue: 20, cash: 100 })).toEqual({
      paid: 20,
      unpaid: 0,
      cutFraction: 0,
    });
  });

  it("applies the pro-rata cut when cash is short, never overdrawing", () => {
    expect(pensionBenefitPayment({ benefitsDue: 20, cash: 5 })).toEqual({
      paid: 5,
      unpaid: 15,
      cutFraction: 0.75,
    });
    expect(pensionBenefitPayment({ benefitsDue: 20, cash: 0 })).toEqual({
      paid: 0,
      unpaid: 20,
      cutFraction: 1,
    });
  });

  it("owes nothing when nothing is in payment", () => {
    expect(pensionBenefitPayment({ benefitsDue: 0, cash: 100 })).toEqual({
      paid: 0,
      unpaid: 0,
      cutFraction: 0,
    });
  });
});

describe("investable-cash rule (ported for the future fund substrate)", () => {
  it("keeps eight turns of benefits plus a tenth of cash back", () => {
    // No pensioners: min(cash - 0, cash * 0.9).
    expect(pensionInvestableCash({ cash: 100000, benefitsInPayment: 0 })).toBe(90000);
    // In-payment 100000 => due 2000/turn, buffer 16000; cash 100000 =>
    // min(84000, 90000) = 84000.
    expect(pensionInvestableCash({ cash: 100000, benefitsInPayment: 100000 })).toBe(84000);
  });

  it("returns zero for pocket change or no cash", () => {
    expect(pensionInvestableCash({ cash: 500, benefitsInPayment: 0 })).toBe(0);
    expect(pensionInvestableCash({ cash: 0, benefitsInPayment: 0 })).toBe(0);
    expect(pensionInvestableCash({ cash: -8, benefitsInPayment: 0 })).toBe(0);
  });
});

describe("funding status and employer-cost projections", () => {
  it("projects ratio, band and the band copy for one scheme", () => {
    const status = pensionFundingStatus(scheme({ assets: 850, liabilities: 1000 }));
    expect(status).toMatchObject({
      schemeId: "US-manufacturing",
      unionName: "Test Union",
      assets: 850,
      liabilities: 1000,
      band: "deficit",
    });
    expect(status.ratio).toBeCloseTo(0.85, 12);
    expect(status.description).toContain("top-up");
    expect(status.lastBenefitCutFraction).toBe(0);
  });

  it("clamps the reported cut fraction to 0..1", () => {
    expect(
      pensionFundingStatus(scheme({ lastBenefitCutFraction: 0.25 })).lastBenefitCutFraction,
    ).toBe(0.25);
    expect(
      pensionFundingStatus(scheme({ lastBenefitCutFraction: NaN })).lastBenefitCutFraction,
    ).toBe(0);
  });

  it("prices the employer's current contribution and pre-accrual top-up", () => {
    expect(EMPTY_EMPLOYER_PENSION_COST).toEqual({
      contributionPerTurn: 0,
      topUpPerTurn: 0,
      inDeficit: false,
    });
    // No scheme yet: contribution only, never a top-up.
    expect(
      employerPensionCostForTurn({ coveredWageBill: 1000, contributionRate: 0.05 }),
    ).toEqual({ contributionPerTurn: 50, topUpPerTurn: 0, inDeficit: false });
    // Funded scheme: no top-up.
    expect(
      employerPensionCostForTurn({
        coveredWageBill: 1000,
        contributionRate: 0.05,
        scheme: scheme({ assets: 950, liabilities: 1000 }),
      }),
    ).toEqual({ contributionPerTurn: 50, topUpPerTurn: 0, inDeficit: false });
    // Deficit scheme: contribution plus 5% of the shortfall past it.
    const cost = employerPensionCostForTurn({
      coveredWageBill: 1000,
      contributionRate: 0.05,
      scheme: scheme({ assets: 100, liabilities: 1000 }),
    });
    expect(cost.contributionPerTurn).toBe(50);
    // (100 + 50) assets vs 1000 liabilities => target 900, shortfall 750 => 37.5.
    expect(cost.topUpPerTurn).toBe(37.5);
    expect(cost.inDeficit).toBe(true);
  });

  it("names the ledger currency per country with USD fallback", () => {
    expect(pensionCurrencyForCountry("US")).toBe("USD");
    expect(pensionCurrencyForCountry("UK")).toBe("GBP");
    expect(pensionCurrencyForCountry("XX")).toBe("USD");
  });

  it("builds deterministic leg ids", () => {
    expect(pensionRecordIdFor("u", 7, "contribution", "corp", "u")).toBe(
      "u:7:contribution:corp:u",
    );
    expect(pensionRecordIdFor("u", 7, "benefit", "u", "system")).toBe("u:7:benefit:u:system");
  });
});

describe("scheme and ledger validation (fail closed)", () => {
  it("accepts a well-formed scheme", () => {
    expect(() => validatePensionScheme(worldWithUnion(), scheme())).not.toThrow();
  });

  it("refuses schemes pointing at no union, the wrong country, or corrupt books", () => {
    const world = worldWithUnion();
    expect(() => validatePensionScheme(world, scheme({ id: "US-ghost" }))).toThrow(
      /union reference/,
    );
    expect(() => validatePensionScheme(world, scheme({ countryId: "UK" }))).toThrow(/country/);
    expect(() => validatePensionScheme(world, scheme({ unionName: "" }))).toThrow(/name/);
    expect(() => validatePensionScheme(world, scheme({ assets: -1 }))).toThrow(/assets/);
    expect(() => validatePensionScheme(world, scheme({ liabilities: NaN }))).toThrow(/liabilities/);
    expect(() =>
      validatePensionScheme(world, scheme({ liabilities: 100, benefitsInPayment: 101 })),
    ).toThrow(/in-payment/);
    expect(() => validatePensionScheme(world, scheme({ totalContributions: -2 }))).toThrow(
      /contribution total/,
    );
    expect(() => validatePensionScheme(world, scheme({ createdAtTurn: 1.5 }))).toThrow(
      /creation turn/,
    );
    expect(() => validatePensionScheme(world, scheme({ lastBenefitCutFraction: 2 }))).toThrow(
      /cut fraction/,
    );
    expect(() => validatePensionScheme(world, null)).toThrow(/not an object/);
  });

  it("refuses a scheme map whose key does not match its row id", () => {
    const world = worldWithUnion();
    expect(() => validatePensionSchemes(world, { "US-other": scheme() })).toThrow(
      /does not match id/,
    );
    expect(() => validatePensionSchemes(world, [])).toThrow(/not a map/);
    expect(() =>
      validatePensionSchemes(world, { "US-manufacturing": scheme() }),
    ).not.toThrow();
  });

  function ledgerWorld() {
    return {
      unions: { "US-manufacturing": { id: "US-manufacturing", countryId: "US" } },
      pensionSchemes: {
        "US-manufacturing": scheme({ unionName: "Test Union" }),
      },
    } as Parameters<typeof validatePensionLedger>[0];
  }

  function contributionLegs(): PensionLedgerRecord[] {
    const turn = 5;
    return [
      {
        id: pensionRecordIdFor("US-manufacturing", turn, "contribution", "corp-a", "US-manufacturing"),
        type: "pension_contribution",
        schemeId: "US-manufacturing",
        unionName: "Test Union",
        turn,
        amount: -50,
        currencyCode: "USD",
        subjectType: "corporation",
        subjectId: "corp-a",
        subjectName: "ticker",
        counterpartyType: "pension_scheme",
        counterpartyId: "US-manufacturing",
        counterpartyName: "Test Union pension scheme",
      },
      {
        id: pensionRecordIdFor("US-manufacturing", turn, "contribution", "US-manufacturing", "corp-a"),
        type: "pension_contribution",
        schemeId: "US-manufacturing",
        unionName: "Test Union",
        turn,
        amount: 50,
        currencyCode: "USD",
        subjectType: "pension_scheme",
        subjectId: "US-manufacturing",
        subjectName: "Test Union pension scheme",
        counterpartyType: "corporation",
        counterpartyId: "corp-a",
        counterpartyName: "ticker",
      },
    ];
  }

  it("accepts deterministic two-leg contribution rows", () => {
    expect(() => validatePensionLedger(ledgerWorld(), contributionLegs())).not.toThrow();
  });

  it("refuses rows with forged ids, unknown schemes, or bad amounts", () => {
    const world = ledgerWorld();
    const [debit, credit] = contributionLegs();
    expect(() =>
      validatePensionLedger(world, [{ ...debit, id: "forged" }, credit]),
    ).toThrow(/does not match legs/);
    expect(() =>
      validatePensionLedger(world, [{ ...debit, schemeId: "US-ghost" }, credit]),
    ).toThrow(/scheme reference/);
    expect(() =>
      validatePensionLedger(world, [{ ...debit, amount: NaN }, credit]),
    ).toThrow(/amount/);
    expect(() =>
      validatePensionLedger(world, [{ ...debit, type: "pension_bribe" }, credit]),
    ).toThrow(/type/);
    expect(() => validatePensionLedger(world, { nope: true })).toThrow(/not an array/);
  });
});
