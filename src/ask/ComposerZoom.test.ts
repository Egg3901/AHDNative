import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Ask composer zoom safety (phone keyboard layout).
 *
 * iOS Safari auto-zooms on focus when a field renders below 16px, which
 * jolts the thread out from under the keyboard. The composer keeps its
 * desktop 0.86rem sizing, but touch devices and narrow phone viewports
 * must hold the 16px anti-zoom floor. Geometry-only: jsdom performs no
 * layout, so these cases pin the shipped stylesheet text.
 */

const css = readFileSync("src/ask/ask.css", "utf8");

describe("Ask composer zoom safety", () => {
  it("keeps the desktop composer sizing below the zoom floor", () => {
    expect(css).toMatch(/\.av-row textarea\s*\{[^}]*font-size:\s*0\.86rem/);
  });

  it("holds the 16px anti-zoom floor on touch devices", () => {
    expect(css).toMatch(
      /@media\s*\(\s*pointer:\s*coarse\s*\)[\s\S]*?\.av-row textarea\s*\{[^}]*font-size:\s*16px/,
    );
  });

  it("holds the 16px anti-zoom floor in narrow phone viewports", () => {
    expect(css).toMatch(
      /@media[^{]*\(\s*max-width:\s*640px\s*\)[\s\S]*?\.av-row textarea\s*\{[^}]*font-size:\s*16px/,
    );
  });
});
