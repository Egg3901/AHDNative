import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Focused keyboard-focus scroll contracts (phone focus layout).
 *
 * The focus ring is a 4px box-shadow outside the element, so a scrollport
 * that parks a focused row flush against its edge clips the ring, and a
 * document scroller with no footer clearance parks page-content focus under
 * the fixed footer. These cases pin the scroll-padding/scroll-margin
 * composition that keeps keyboard focus visible at 320/390px. Geometry-only:
 * jsdom performs no layout, so the cases pin the shipped stylesheet rules.
 * Nothing here is physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

/** Bodies of every rule whose selector list contains `selector`. */
function ruleBodies(selector: string): string[] {
  const blocks = css.match(/[^{]+{[^}]*}/g) ?? [];
  return blocks
    .filter((block) => block.split("{")[0].includes(selector))
    .map((block) => block.split("{")[1].replace(/\}\s*$/, ""));
}

/** Body of the rule carrying `property` for `selector`. */
function ruleBodyWith(selector: string, property: string): string {
  const hit = ruleBodies(selector).find((body) => body.includes(property));
  expect(hit, `missing ${property} for ${selector}`).toBeTruthy();
  return hit!;
}

/** Largest rem/px length in a declaration value, normalized to px (16px base). */
function maxPx(body: string, property: string): number {
  const values = [...body.matchAll(new RegExp(`${property}\\s*:\\s*([^;]+);`, "g"))].map((m) => m[1]);
  expect(values.length, `missing ${property}`).toBeGreaterThan(0);
  let best = 0;
  for (const value of values) {
    for (const m of value.matchAll(/([\d.]+)(rem|px)/g)) {
      const px = parseFloat(m[1]) * (m[2] === "rem" ? 16 : 1);
      if (px > best) best = px;
    }
  }
  return best;
}

describe("keyboard focus scroll clearance (phone focus layout)", () => {
  it("keeps drawer rows clear of the scrollport edges (ring never parks flush)", () => {
    const body = ruleBodyWith(".ahd-drawer-nav", "scroll-padding");
    expect(ruleBodies(".ahd-drawer-nav").some((b) => /overflow-y:\s*auto/.test(b))).toBe(true);
    // 0.5rem = 8px clears the 4px box-shadow focus ring with margin to spare.
    expect(maxPx(body, "scroll-padding(?:-block|-top|-bottom)?")).toBeGreaterThanOrEqual(8);
  });

  it("gives drawer focus targets a per-target margin past drawer chrome", () => {
    const body = ruleBodyWith(".ahd-drawer-disclosure", "scroll-margin");
    expect(body).toMatch(/scroll-margin/);
    const selectors = css.match(/[^{]+(?={[^}]*scroll-margin[^}]*})/g) ?? [];
    expect(selectors.some((s) => s.includes(".ahd-drawer-item") && s.includes(".ahd-drawer-disclosure"))).toBe(true);
    expect(maxPx(body, "scroll-margin(?:-block|-top|-bottom)?")).toBeGreaterThanOrEqual(8);
  });

  it("keeps page-content focus clear of the fixed footer", () => {
    const body = ruleBodyWith("html", "scroll-padding-bottom");
    expect(body).toMatch(/scroll-padding-bottom:\s*calc\(\s*var\(--ahd-footer-height,\s*9rem\)\s*\+\s*1rem\s*\)/);
  });

  it("keeps page-content focus below the Dynamic Island / status bar (#436)", () => {
    // Browser and jsdom runs report no top inset, so a focused heading
    // scrolls flush to viewport top; on a physical iPhone that parks it
    // under the island even though every shell pads its initial render.
    // Same fail-safe floor as .ahd-main's top padding: zero-cost on
    // desktop/Android, island clearance on device and zero-env webviews.
    const body = ruleBodyWith("html", "scroll-padding-top");
    expect(body).toMatch(
      /scroll-padding-top:\s*max\([^;]*var\(--ahd-safe-area-top-fallback[^;]*env\(safe-area-inset-top\)/,
    );
  });

  it("steers scroll alignment only: no pointer or desktop geometry change", () => {
    const combined = ruleBodyWith(".ahd-drawer-disclosure", "scroll-margin");
    for (const declaration of combined.split(";").map((d) => d.trim()).filter(Boolean)) {
      expect(declaration).toMatch(/^scroll-/);
    }
    const viewport = ruleBodyWith("html", "scroll-padding-bottom");
    for (const declaration of viewport.split(";").map((d) => d.trim()).filter(Boolean)) {
      expect(declaration).toMatch(/^scroll-/);
    }
    expect(ruleBodies(".ahd-drawer-nav").some((b) => /padding:\s*0\.35rem 0\.55rem 0\.6rem/.test(b))).toBe(true);
  });
});
