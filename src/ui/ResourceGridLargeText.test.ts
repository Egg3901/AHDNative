import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Footer resource-grid large-text contract.
 *
 * The persistent footer holds six resource cells (five resource buttons plus
 * the notification bell) in one row. Each button keeps a 44px minimum, so at
 * 320px under large dynamic text the six tracks no longer fit: values
 * fragment mid-number and the bell hangs past its track instead of reflowing.
 * The narrow + large-text override below reflows the grid to two rows of
 * three; footer clearance follows the measured footer height, so default-size
 * and wider layouts are untouched. jsdom performs no layout, so the cases
 * assert the shipped rule text, matching MetricRowContracts convention.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

function largeNarrowOverride(): string {
  const match = css.match(
    /@media\s*\(max-width:\s*360px\)[\s\S]*?:root\[data-text-size="large"\]\s*\.ahd-status-resources\s*\{([^}]*)\}/,
  );
  expect(match, "missing narrow large-text resource-grid override").toBeTruthy();
  return match![1];
}

describe("footer resource-grid large-text contract", () => {
  it("keeps the six-cell phone grid at the default text size", () => {
    expect(css).toMatch(/\.ahd-status-resources\s*\{[^}]*grid-template-columns:\s*repeat\(6/);
  });

  it("reflows to two rows of three under large text on 320-class phones", () => {
    expect(largeNarrowOverride()).toMatch(/grid-template-columns:\s*repeat\(3/);
  });

  it("reflows without hiding cells or shrinking touch targets", () => {
    const body = largeNarrowOverride();
    expect(body).not.toMatch(/display\s*:/);
    expect(body).not.toMatch(/min-width\s*:/);
    expect(body).not.toMatch(/min-height\s*:/);
  });
});
