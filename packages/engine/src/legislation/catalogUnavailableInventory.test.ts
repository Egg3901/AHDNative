import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog.js";
import { UNAVAILABLE_LAW_INVENTORY, UNAVAILABLE_LAW_SOURCE_REVISION } from "./catalogUnavailableInventory.js";

const TAX_SOURCE_VECTOR: Record<string, readonly [string, string, string, readonly number[]]> = {
  br_corporate_tax: ["BR", "national", "domesticCorporateTax", [0, 8, 13, 18, 26]],
  br_customs_tariff: ["BR", "national", "tariffs", [0, 18, 35]],
  br_iap_contribution: ["BR", "national", "payrollTax", [10, 20, 32]],
  br_ivc: ["BR", "national", "salesTax", [0, 5, 10, 15, 22]],
  cn_customs_tariff: ["CN", "national", "tariffs", [0, 1, 2, 3, 5, 7, 10, 13, 17, 21, 25]],
  cn_enterprise_income_tax: ["CN", "national", "domesticCorporateTax", [0, 5, 10, 15, 20, 25, 28, 32, 35, 38, 40]],
  cn_individual_income_tax: ["CN", "national", "incomeTax", [0, 10, 15, 25, 30, 35, 40, 45, 47, 48, 50]],
  cn_land_value_added_tax: ["CN", "national", "landValueAddedTax", [0, 10, 20, 25, 30, 40, 50, 60, 68, 75, 80]],
  cn_provincial_resource_tax: ["CN", "state", "salesTax", [0, 1, 2, 4, 5, 6, 8, 10, 12, 16, 20]],
  cn_social_insurance_contribution: ["CN", "national", "payrollTax", [0, 5, 10, 15, 22, 28, 32, 36, 40, 43, 45]],
  cn_stamp_duty: ["CN", "national", "stampDuty", [0, .01, .02, .03, .04, .05, .1, .3, .5, 1, 2]],
  cn_urban_maintenance_construction_tax: ["CN", "national", "urbanMaintenanceTax", [0, 1, 2, 3, 5, 7, 9, 11, 12, 14, 15]],
  cn_value_added_tax: ["CN", "national", "salesTax", [0, 3, 6, 9, 11, 13, 15, 17, 19, 22, 25]],
  de_customs_tariff_rate: ["DE", "national", "tariffs", [0, 1, 2, 3, 4, 5, 6, 8, 10, 14, 20]],
  de_domestic_corporate_tax_rate: ["DE", "national", "domesticCorporateTax", [0, 3, 5, 8, 12, 15, 18, 20, 22, 25, 30]],
  de_foreign_corporate_tax_rate: ["DE", "national", "foreignCorporateTax", [0, 3, 5, 8, 12, 15, 18, 20, 22, 25, 30]],
  de_income_tax_rate: ["DE", "national", "incomeTax", [0, 10, 20, 28, 35, 42, 45, 50, 55, 60, 65]],
  de_payroll_social_insurance: ["DE", "national", "payrollTax", [0, 5, 10, 13, 16, 20, 22, 24, 26, 28, 30]],
  de_solidarity_surcharge: ["DE", "national", "solidaritySurcharge", [0, .5, 1, 2, 4, 5.5, 6.5, 7.5, 8.5, 9.5, 10]],
  de_trade_tax: ["DE", "state", "tradeTax", [200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600]],
  de_vat_rate: ["DE", "national", "salesTax", [0, 5, 7, 10, 16, 19, 20, 22, 24, 25, 28]],
  ie_capital_gains_tax: ["IE", "national", "capitalGainsTax", [0, 5, 10, 15, 20, 25, 33, 40, 45, 50, 55]],
  ie_corporate_tax_rate: ["IE", "national", "domesticCorporateTax", [0, 5, 9, 12.5, 15, 18, 20, 23, 26, 30, 33]],
  ie_customs_tariff_rate: ["IE", "national", "tariffs", [0, 2, 5, 8, 12, 16, 20, 25, 30, 40, 50]],
  ie_excise_duty: ["IE", "national", "exciseDuty", [0, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300]],
  ie_foreign_corporate_tax_rate: ["IE", "national", "foreignCorporateTax", [0, 5, 9, 12.5, 15, 18, 20, 23, 26, 30, 33]],
  ie_income_tax_rate: ["IE", "national", "incomeTax", [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]],
  ie_local_property_tax: ["IE", "national", "propertyTax", [0, .05, .1, .15, .18, .25, .3, .4, .5, .75, 1]],
  ie_prsi: ["IE", "national", "payrollTax", [0, 2, 4, 6, 8, 11, 14, 17, 20, 23, 26]],
  ie_stamp_duty: ["IE", "national", "stampDuty", [0, .5, 1, 2, 3, 5, 7.5, 10, 12, 15, 20]],
  ie_usc: ["IE", "national", "universalSocialCharge", [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20]],
  jp_customs_tariff: ["JP", "national", "tariffs", [0, 1, 2, 3, 3.5, 4, 6, 8, 12, 16, 20]],
  jp_domestic_corporation_tax: ["JP", "national", "domesticCorporateTax", [0, 5, 9, 14, 18, 23, 28, 32, 37, 41, 46]],
  jp_fixed_asset_tax: ["JP", "state", "fixedAssetTax", [0, .2, .5, .8, 1.1, 1.4, 1.8, 2.2, 3, 4, 5]],
  jp_foreign_corporation_tax: ["JP", "national", "foreignCorporateTax", [0, 6, 13, 19, 26, 32, 39, 45, 52, 58, 65]],
  jp_income_tax_rate: ["JP", "national", "incomeTax", [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]],
  jp_resident_tax: ["JP", "state", "residentTax", [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]],
  jp_social_insurance: ["JP", "national", "payrollTax", [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30]],
};

const UNMATCHED_SOURCE_VECTOR = [
  ["US", "us.centralBank.independence.primary"], ["US", "us.electoral.law.primary"],
  ["US", "us.subsidy.industry.primary"], ["US", "us.tariff.primary"], ["US", "us.union.law.primary"],
] as const;

describe("unavailable law source inventory", () => {
  it("matches the pinned source vector independently of the Native catalog", () => {
    expect(UNAVAILABLE_LAW_INVENTORY).toHaveLength(266);
    expect(Object.fromEntries(["JP", "DE", "IE", "CN", "BR", "US", "UK", "RU", "DD"].map((countryId) => [
      countryId,
      UNAVAILABLE_LAW_INVENTORY.filter((row) => row.countryId === countryId).length,
    ]))).toEqual({ JP: 62, DE: 60, IE: 57, CN: 62, BR: 13, US: 9, UK: 1, RU: 1, DD: 1 });
    for (const id of ["de_trade_tax", "cn_provincial_resource_tax", "jp_resident_tax", "jp_fixed_asset_tax"]) {
      expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === id), id).toMatchObject({
        nativeScope: "regional",
        sourceScope: "state",
        taxRateChange: { scope: "state" },
        blockingSystem: "budget/taxRateLadder",
      });
    }
    expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === "de_trade_tax")?.authoredRateOptions.map((option) => option.rate)).toEqual([200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600]);
    expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === "cn_provincial_resource_tax")?.authoredRateOptions.map((option) => option.rate)).toEqual([0, 1, 2, 4, 5, 6, 8, 10, 12, 16, 20]);
    const taxes = UNAVAILABLE_LAW_INVENTORY.filter((row) => row.taxRateChange !== null);
    expect(Object.keys(TAX_SOURCE_VECTOR)).toHaveLength(38);
    expect(Object.fromEntries(taxes.map((tax) => [tax.id, [
      tax.countryId, tax.sourceScope, tax.taxRateChange!.taxType,
      tax.authoredRateOptions.map((option) => option.rate),
    ]]))).toEqual(TAX_SOURCE_VECTOR);
    for (const tax of taxes) expect(tax.authoredRateOptions.map((option) => option.id), tax.id)
      .toEqual(tax.authoredRateOptions.map((_, index) => `${tax.id}_opt_${index}`));
    expect(taxes.every((tax) => tax.blockingSystem === "budget/taxRateLadder")).toBe(true);
  });

  it("accounts for every unavailable player catalog row exactly once", () => {
    const expected = CATALOG.filter((entry) => entry.status === "unavailable").map((entry) => entry.id).sort();
    const actual = UNAVAILABLE_LAW_INVENTORY.map((entry) => entry.id).slice().sort();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it("names source provenance, eligibility prerequisites, effects, and the real blocker", () => {
    expect(UNAVAILABLE_LAW_SOURCE_REVISION).toBe("e364c04954ed628beef73a993a8e9e156650a31e");
    for (const row of UNAVAILABLE_LAW_INVENTORY) {
      const catalog = CATALOG.find((entry) => entry.id === row.id)!;
      expect(row.sourcePath, row.id).toMatch(/^(src\/lib\/(seeds|politicalLegislation\/laws)\/|NO_AHDGAME_SOURCE_MATCH$)/);
      expect(row.nativeScope, row.id).toBe(catalog.allowedScope);
      expect(row.blockingSystem, row.id).toBe(catalog.blockingSystem);
      if (row.sourceMatch === "matched") {
        expect(row.sourcePath, row.id).not.toBe("NO_AHDGAME_SOURCE_MATCH");
        expect(row.sourceScope, row.id).not.toBeNull();
        expect(row.prerequisites.length, row.id).toBeGreaterThan(0);
        expect(row.authoredTargets.length, row.id).toBeGreaterThan(0);
      } else {
        expect(row.sourcePath, row.id).toBe("NO_AHDGAME_SOURCE_MATCH");
        expect(row.sourceScope, row.id).toBeNull();
        expect(row.authoredTargets, row.id).toEqual([]);
        expect(row.prerequisites, row.id).toEqual([]);
      }
    }
    const unmatched = UNAVAILABLE_LAW_INVENTORY.filter((row) => row.sourceMatch === "unmatched");
    expect(unmatched.map((row) => [row.countryId, row.id])).toEqual(UNMATCHED_SOURCE_VECTOR);
    expect(UNAVAILABLE_LAW_INVENTORY.find((row) => row.id === "dd.economy.workerSecurity.primary")).toMatchObject({
      nativeScope: "national",
      sourceScope: "both",
    });
  });
});
