import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MATERIALS, materialSurfaceStyle } from "./materials";

/**
 * Focused device-chrome contracts (#436 safe area, #437 perceptible glass).
 *
 * Geometry-only: jsdom performs no layout, so the CSS cases pin the
 * env(safe-area-inset-*) composition and the glass cases pin that blur and
 * translucency are perceptible, distinct per level, and correctly bound to
 * shipped surfaces. Nothing here is physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");
const indexHtml = readFileSync("index.html", "utf8");

/** Shipped value of a --ahd-* token, e.g. "10px" or a color-mix() expression. */
function tokenValue(name: string): string {
  const match = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  expect(match, `missing token ${name}`).toBeTruthy();
  return match![1].trim();
}

/** Parses a "12px" token to a number. */
function px(value: string): number {
  const match = value.match(/^([\d.]+)px$/);
  expect(match, `expected px value, got ${value}`).toBeTruthy();
  return parseFloat(match![1]);
}

describe("safe-area composition (#436)", () => {
  it("opts into edge-to-edge layout with keyboard resizing", () => {
    expect(indexHtml).toMatch(/viewport-fit=cover/);
    expect(indexHtml).toMatch(/interactive-widget=resizes-content/);
  });

  it("starts top chrome below the cutout without overlaying it", () => {
    for (const selector of ["\\.ahd-main", "\\.ahd-drawer", "\\.ahd-landing-layout", "\\.ahd-mp-layout"]) {
      expect(css).toMatch(new RegExp(`${selector}[^{]*\\{[^}]*max\\([^}]*env\\(safe-area-inset-top\\)`));
    }
  });

  it("clears the home indicator under every persistent bottom control", () => {
    for (const selector of ["\\.ahd-footer", "\\.ahd-creation-actions", "\\.ahd-drawer-quick"]) {
      expect(css).toMatch(new RegExp(`${selector}\\s*\\{[^}]*max\\([^}]*env\\(safe-area-inset-bottom\\)`));
    }
  });

  it("clears rounded corners and the landscape cutout on both sides", () => {
    for (const inset of ["left", "right"]) {
      expect(css).toMatch(new RegExp(`\\.ahd-container[^{]*\\{[^}]*env\\(safe-area-inset-${inset}\\)`));
      expect(css).toMatch(new RegExp(`\\.ahd-bottomnav[^{]*\\{[^}]*env\\(safe-area-inset-${inset}\\)`));
    }
    expect(css).toMatch(/@media\s*\(orientation:\s*landscape\)[\s\S]*?\.ahd-footer[\s\S]*?env\(safe-area-inset-left\)/);
    expect(css).toMatch(/@media\s*\(orientation:\s*landscape\)[\s\S]*?\.ahd-footer[\s\S]*?env\(safe-area-inset-right\)/);
  });

  it("bounds transient overlays inside the insets instead of covering controls", () => {
    expect(css).toMatch(/\.ahd-resource-popover[^{]*\{[^}]*env\(safe-area-inset-top\)/);
    expect(css).toMatch(/\.ahd-resource-popover[^{]*\{[^}]*overflow-y:\s*auto/);
  });
});

describe("perceptible glass (#437)", () => {
  it("gives every glass level a perceptible, distinct, hierarchy-ordered blur", () => {
    const chrome = px(tokenValue("--ahd-material-chrome-blur"));
    const elevated = px(tokenValue("--ahd-material-elevated-blur"));
    const modal = px(tokenValue("--ahd-material-modal-blur"));
    for (const radius of [chrome, elevated, modal]) {
      expect(radius).toBeGreaterThanOrEqual(8);
    }
    expect(new Set([chrome, elevated, modal]).size).toBe(3);
    expect([chrome, elevated, modal]).toEqual([...[chrome, elevated, modal]].sort((a, b) => a - b));
  });

  it("keeps every glass background actually translucent and distinct per level", () => {
    const backgrounds = (["chrome", "elevated", "modal"] as const).map((level) =>
      tokenValue(MATERIALS[level].backgroundVar.slice(4, -1)),
    );
    for (const background of backgrounds) {
      expect(background).toMatch(/transparent|color-mix|rgba?\(|hsla?\(/);
    }
    expect(new Set(backgrounds).size).toBe(3);
    expect(backgrounds).toEqual(expect.arrayContaining([
      expect.stringMatching(/78%/),
      expect.stringMatching(/72%/),
      expect.stringMatching(/68%/),
    ]));
  });

  it("binds each shipped surface to its own level tokens", () => {
    expect(css).toMatch(/\.ahd-footer\s*\{[^}]*var\(--ahd-material-chrome-bg\)/);
    expect(css).toMatch(/\.ahd-footer\s*\{[^}]*var\(--ahd-material-chrome-blur\)/);
    expect(css).toMatch(/\.ahd-resource-details\s*\{[^}]*var\(--ahd-material-elevated-bg\)/);
    expect(css).toMatch(/\.ahd-resource-details\s*\{[^}]*var\(--ahd-material-elevated-blur\)/);
    expect(css).toMatch(/\.ahd-resource-popover\s*\{[^}]*var\(--ahd-material-modal-bg\)/);
    expect(css).toMatch(/\.ahd-resource-popover\s*\{[^}]*var\(--ahd-material-modal-blur\)/);
  });

  it("resolves every glass level to a different solid non-blur surface when transparency is reduced", () => {
    for (const level of ["chrome", "elevated", "modal"] as const) {
      const full = materialSurfaceStyle(level, false);
      const reduced = materialSurfaceStyle(level, true);
      expect(full.backdropFilter).toContain("blur(");
      expect(reduced.backdropFilter).toBe("none");
      expect(reduced.background).toBe(MATERIALS[level].solidVar);
      expect(reduced.background).not.toBe(MATERIALS[level].backgroundVar);
    }
    expect(css).toMatch(/prefers-reduced-transparency/);
  });

  it("keeps content opaque with no blur token to borrow", () => {
    expect(MATERIALS.content.backdrop).toBe(false);
    expect(MATERIALS.content.blurVar).toBe("none");
    const style = materialSurfaceStyle("content", false);
    expect(style.backdropFilter).toBe("none");
    expect(style.background).toBe(MATERIALS.content.solidVar);
  });
});
