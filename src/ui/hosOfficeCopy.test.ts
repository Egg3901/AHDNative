import { describe, expect, it } from "vitest";
import { hosOfficeCopy } from "./hosOfficeCopy";

describe("hosOfficeCopy", () => {
  it("names the presidential office and system, never a generic executive fallback", () => {
    expect(hosOfficeCopy("president")).toEqual({
      title: "President",
      system: "Presidential executive: you occupy the national president record.",
    });
  });

  it("names parliamentary offices from the projected type, never presidential", () => {
    expect(hosOfficeCopy("primeMinister")).toEqual({
      title: "Prime minister",
      system: "Parliamentary executive: you govern through the appointed prime minister office.",
    });
    expect(hosOfficeCopy("chancellor")).toEqual({
      title: "Chancellor",
      system: "Parliamentary executive: you govern through the appointed chancellor office.",
    });
    expect(hosOfficeCopy("taoiseach")).toEqual({
      title: "Taoiseach",
      system: "Parliamentary executive: you govern through the appointed taoiseach office.",
    });
    expect(hosOfficeCopy("firstMinister")).toEqual({
      title: "First minister",
      system: "Parliamentary executive: you govern through the appointed first minister office.",
    });
  });

  it("names one-party offices, including premier, never presidential", () => {
    expect(hosOfficeCopy("generalSecretary")).toEqual({
      title: "General secretary",
      system: "One-party executive: you govern through the ruling party and legislature-appointment system.",
    });
    expect(hosOfficeCopy("firstSecretary")).toEqual({
      title: "First secretary",
      system: "One-party executive: you govern through the ruling party and legislature-appointment system.",
    });
    expect(hosOfficeCopy("premier")).toEqual({
      title: "Premier",
      system: "One-party executive: you govern through the ruling party and legislature-appointment system.",
    });
  });

  it("keeps a neutral executive fallback for missing or unknown offices", () => {
    for (const office of [null, undefined, "", "archon", "ministerPresident"]) {
      expect(hosOfficeCopy(office)).toEqual({
        title: "executive office",
        system: "Executive office: you occupy the national executive record.",
      });
    }
  });
});
