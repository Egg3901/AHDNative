import { describe, expect, it } from "vitest";
import {
  MATERIAL_LEVELS,
  MATERIAL_TEXT_PAIRS,
  MATERIALS,
  contrastRatio,
  materialSurfaceStyle,
  resolveReducedTransparency,
} from "./materials";
import { readFileSync } from "node:fs";

// The shipped stylesheet under test, read from disk so the contract pins
// the values players actually receive (not a bundler transform of them).
// Resolved from the repository root, where the focused UI runner executes.
const materialCss = readFileSync("src/ui/ui.css", "utf8");

/** Returns the shipped material section of the stylesheet under test. */
function materialBlock(): string {
  const start = materialCss.indexOf("Material system (issue #437)");
  const end = materialCss.indexOf("End material system (issue #437)");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return materialCss.slice(start, end);
}

describe("glass material tokens", () => {
  it("defines one restrained four-level hierarchy on the AHD palette", () => {
    expect(MATERIAL_LEVELS).toEqual(["chrome", "elevated", "modal", "content"]);
    for (const level of MATERIAL_LEVELS) {
      const definition = MATERIALS[level];
      if (level === "content") {
        // Content stays opaque on the established card token by design.
        expect(definition.backgroundVar).toBe("var(--ahd-card)");
      } else {
        expect(definition.backgroundVar).toMatch(/^var\(--ahd-material-/);
      }
      expect(definition.solidVar).toMatch(/^var\(--ahd-/);
      expect(materialCss).toContain(definition.backgroundVar.slice(4, -1));
    }
  });

  it("keeps content opaque while glass levels carry blur", () => {
    expect(MATERIALS.content.backdrop).toBe(false);
    expect(materialSurfaceStyle("content", false).backdropFilter).toBe("none");
    for (const level of ["chrome", "elevated", "modal"] as const) {
      expect(MATERIALS[level].backdrop).toBe(true);
      expect(MATERIALS[level].blurVar).toMatch(/^var\(--ahd-material-.*-blur\)$/);
      expect(materialSurfaceStyle(level, false).backdropFilter).toContain("blur(");
    }
  });

  it("resolves every glass level to a solid non-blur surface under reduced transparency", () => {
    for (const level of MATERIAL_LEVELS) {
      const style = materialSurfaceStyle(level, true);
      expect(style.background).toBe(MATERIALS[level].solidVar);
      expect(style.backdropFilter).toBe("none");
    }
  });
});

describe("reduced transparency", () => {
  it("follows the device setting unless the player overrides it", () => {
    expect(resolveReducedTransparency("on", false)).toBe(true);
    expect(resolveReducedTransparency("off", true)).toBe(false);
    expect(resolveReducedTransparency("system", true)).toBe(true);
    expect(resolveReducedTransparency("system", false)).toBe(false);
  });

  it("ships a non-blur solid fallback in the stylesheet", () => {
    const block = materialBlock();
    expect(block).toContain("prefers-reduced-transparency");
    expect(block).toContain('data-reduced-transparency="on"');
    expect(block).toContain("backdrop-filter: none");
    for (const surface of [".ahd-footer", ".ahd-drawer", ".ahd-resource-details", ".ahd-resource-popover"]) {
      expect(block).toContain(surface);
    }
  });
});

describe("contrast and readability", () => {
  it("holds WCAG AA body and secondary text on every solid material fallback", () => {
    expect(MATERIAL_TEXT_PAIRS.length).toBeGreaterThan(0);
    for (const pair of MATERIAL_TEXT_PAIRS) {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("holds enhanced contrast for primary body text", () => {
    for (const pair of MATERIAL_TEXT_PAIRS.filter((pair) => pair.kind === "body")) {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("motion restraint", () => {
  it("adds no transitions or animations to the material system", () => {
    const block = materialBlock();
    expect(block).not.toMatch(/transition\s*:/);
    expect(block).not.toMatch(/animation\s*:/);
    expect(block).not.toMatch(/@keyframes/);
  });

  it("keeps the existing reduced-motion takeover intact", () => {
    expect(materialCss).toContain("prefers-reduced-motion");
    expect(materialCss).toContain('data-reduced-motion="on"');
  });
});
