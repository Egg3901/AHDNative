import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Saved-game list phone layout.
 *
 * Geometry-only: jsdom performs no layout, so these cases pin the shipped
 * CSS rules: long save names and metadata wrap instead of forcing 320px
 * overflow, narrow phones stack Continue/Delete full-width so the targets
 * never crowd, and desktop keeps the side-by-side row. Nothing here is
 * physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

describe("saved-game list phone layout", () => {
  it("wraps long save names and metadata", () => {
    expect(css).toMatch(/\.ahd-save-name\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*\}/);
    expect(css).toMatch(/\.ahd-save-meta\s*\{[^}]*overflow-wrap:\s*anywhere[^}]*\}/);
  });

  it("stacks save actions full-width on narrow phones", () => {
    expect(css).toMatch(
      /\.ahd-save-actions\s*\{[^}]*flex-direction:\s*column[^}]*\}/,
    );
    expect(css).toMatch(
      /\.ahd-save-actions\s+\.ahd-btn\s*\{[^}]*width:\s*100%[^}]*\}/,
    );
  });

  it("preserves the side-by-side row on desktop widths", () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*640px\)\s*\{[^}]*\.ahd-save-actions\s*\{[^}]*flex-direction:\s*row[^}]*\}/,
    );
  });
});
