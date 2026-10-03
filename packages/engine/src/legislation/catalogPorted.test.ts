import { describe, expect, it } from "vitest";
import { getCatalog, getAllLawIds, CATALOG } from "./catalog.js";

// W61 M2: the five post-Cold-War roster countries carry mainline's own
// legislation catalogs (generated, see catalogPorted*.ts headers).
describe("ported legislation catalogs (JP/DE/IE/CN/BR)", () => {
  it("every roster country has a catalog and ids are unique across the whole catalog", () => {
    const expected: Record<string, number> = { JP: 63, DE: 60, IE: 59, CN: 62, BR: 14 };
    for (const [cid, n] of Object.entries(expected)) {
      expect(getCatalog(cid).length, cid).toBe(n);
    }
    const ids = getAllLawIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(CATALOG.length).toBe(ids.length);
  });

  it("tax entries carry a coherent authored rate ladder", () => {
    for (const e of CATALOG.filter((x) => x.kind === "tax" && x.taxPolicy)) {
      const t = e.taxPolicy!;
      expect(t.minRate, e.id).toBeLessThanOrEqual(t.maxRate);
      expect(t.baselineRate, e.id).toBeGreaterThanOrEqual(t.minRate);
      expect(t.baselineRate, e.id).toBeLessThanOrEqual(t.maxRate);
      expect(t.step, e.id).toBeGreaterThan(0);
    }
  });

  it("keeps generated rows unavailable except for reviewed executable slices", () => {
    // Reviewed national tax entries may be available with no decay targets
    // (they act through taxPolicy / enactment); every other generated row
    // remains unavailable until its exact consumer is implemented.
    for (const e of CATALOG.filter((x) => ["JP", "DE", "IE", "CN", "BR"].includes(x.countryId))) {
      if ([
        "jp_consumption_tax",
        "de_income_tax_rate",
        "de_solidarity_surcharge",
        "de_vat_rate",
        "de_domestic_corporate_tax_rate",
        "de_foreign_corporate_tax_rate",
        "de_payroll_social_insurance",
        "de_customs_tariff_rate",
        "br_income_tax_rate",
        "ie_vat_rate",
        // The source living-conflict Irish ratification action creates a
        // contestable peace bill consumed by the bilateral settlement phase.
        "ie_northern_ireland_peace",
        "cn_value_added_tax",
        "cn_enterprise_income_tax",
        "cn_individual_income_tax",
        "cn_social_insurance_contribution",
        "cn_customs_tariff",
      ].includes(e.id)) {
        expect(e.status).toBe("available");
        expect(e.blockingSystem).toBeUndefined();
        continue;
      }
      expect(e.status, e.id).toBe("unavailable");
      expect(e.blockingSystem, e.id).toBeTruthy();
      if (e.blockingSystem === "legislation/effectDescriptor") expect(e.targets.length, e.id).toBeGreaterThan(0);
    }
  });
});
