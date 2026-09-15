import { describe, expect, it } from "vitest";
import { bankEquity, regulatoryCapital, totalBorrowings } from "./balanceSheet.js";

describe("canonical bank balance sheet", () => {
  it("counts every non-shareholder borrowing once in equity and capital", () => {
    const charter = {
      cashReserves: 500,
      totalLoans: 700,
      npcDeposits: 800,
      discountWindowDebt: 50,
      discountWindowArrears: 10,
      cbMarginDebt: 20,
      cbMarginArrears: 5,
      interbankDebt: 15,
      propBookMarkValue: 900,
    };

    expect(totalBorrowings(charter)).toBe(100);
    expect(bankEquity(charter)).toBe(300);
    expect(regulatoryCapital(charter)).toBe(400);
  });

  it("treats absent, non-finite, and negative legacy liabilities as zero", () => {
    expect(totalBorrowings({})).toBe(0);
    expect(totalBorrowings({ discountWindowDebt: Number.NaN, interbankDebt: -50 })).toBe(0);
    expect(bankEquity({ cashReserves: 100, totalLoans: 25, npcDeposits: 40 })).toBe(85);
  });
});
