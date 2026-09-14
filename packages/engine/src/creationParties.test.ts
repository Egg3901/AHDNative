import { describe, expect, it } from "vitest";
import { listCreationParties, rulingPartyForCountry, isOnePartyCountry } from "./index.js";

describe("creation party ruling semantics (#242)", () => {
  it("marks DD's actual ruling party as SED, never the first sorted party", () => {
    const parties = listCreationParties("1953", "DD");
    // listCreationParties sorts by name, so DD_CDU would be parties[0] while
    // SED actually governs. The ruling marker must name SED.
    expect(parties[0]!.id).not.toBe("DD_SED");
    const ruling = parties.filter((party) => party.regimeStatus === "ruling");
    expect(ruling.map((party) => party.id)).toEqual(["DD_SED"]);
    // The four bloc allies are approved, not ruling.
    expect(parties.filter((party) => party.regimeStatus === "approved").map((party) => party.id).sort())
      .toEqual(["DD_CDU", "DD_DBD", "DD_LDPD", "DD_NDPD"]);
  });

  it("resolves the ruling party for DD through the government data", () => {
    expect(rulingPartyForCountry("1953", "DD")).toMatchObject({ id: "DD_SED", abbreviation: "SED" });
    expect(rulingPartyForCountry("1979", "DD")).toMatchObject({ id: "DD_SED" });
  });

  it("marks RU and CN one-party ruling parties with the marker", () => {
    expect(listCreationParties("1953", "RU").map((party) => party.regimeStatus)).toEqual(["ruling"]);
    expect(listCreationParties("2019", "CN").find((party) => party.regimeStatus === "ruling")!.id).toBe("CN_CCP");
  });

  it("leaves competitive-democracy parties unmarked", () => {
    expect(listCreationParties("1953", "US").every((party) => party.regimeStatus === undefined)).toBe(true);
    expect(listCreationParties("1953", "UK").every((party) => party.regimeStatus === undefined)).toBe(true);
  });

  it("keeps the one-party predicate aligned with the pack", () => {
    for (const id of ["RU", "DD", "CN"]) expect(isOnePartyCountry(id), id).toBe(true);
  });
});
