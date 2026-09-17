import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Save-delete destructive-action separation (#436 phone hardening).
 *
 * Geometry-only: jsdom performs no layout, so these cases pin the shipped
 * CSS rules: the destructive confirm never shares the safe primary
 * treatment, narrow phones stack the confirm actions full-width so the
 * destructive target never sits adjacent to the safe one at 320px, and
 * desktop keeps the side-by-side row. Nothing here is physical-device
 * evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

describe("save-delete destructive separation", () => {
  it("tones the destructive confirm with the error token, not the primary fill", () => {
    expect(css).toMatch(/\.ahd-btn-danger\s*\{[^}]*var\(--ahd-error\)[^}]*\}/);
    expect(css).toMatch(/\.ahd-btn-danger\s*\{[^}]*color:\s*white[^}]*\}/);
  });

  it("stacks confirm actions full-width on narrow phones", () => {
    expect(css).toMatch(
      /\.ahd-delete-confirm-actions\s*\{[^}]*flex-direction:\s*column[^}]*\}/,
    );
    expect(css).toMatch(
      /\.ahd-delete-confirm-actions\s+\.ahd-btn\s*\{[^}]*width:\s*100%[^}]*\}/,
    );
  });

  it("preserves the side-by-side row on desktop widths", () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*640px\)\s*\{[^}]*\.ahd-delete-confirm-actions\s*\{[^}]*flex-direction:\s*row[^}]*\}/,
    );
  });
});
