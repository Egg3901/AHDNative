import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Metric-row narrow-viewport contract.
 *
 * `.ahd-kv` definition-list rows (Politics, Cabinet, Regions, World, bonds,
 * region economy/viewer cards, Nation, and the footer ResourceBreakdown)
 * render `<dd>` values that must sit at the row's trailing edge. The UA
 * stylesheet gives `dd` a ~40px `margin-inline-start`, and no global reset
 * clears it, so without an explicit rule every value is indented and long
 * figures wrap or clip early at 320px. Sibling surfaces already reset it
 * (`.ahd-profile-row dd`, `.ahd-hero-stats dd`, `.ahd-mp-facts dd`); this
 * pins the same for `.ahd-kv dd`. jsdom performs no layout, so the case
 * asserts the shipped rule text, matching DeviceChromeContracts convention.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

function kvDdRule(): string {
  const match = css.match(/\.ahd-kv\s+dd\s*\{([^}]*)\}/);
  expect(match, "missing .ahd-kv dd rule").toBeTruthy();
  return match![1];
}

describe("metric-row narrow-viewport contract", () => {
  it("clears the UA dd indent so values reach the trailing edge at 320px", () => {
    expect(kvDdRule()).toMatch(/margin\s*:\s*0/);
  });

  it("lets long values shrink inside the flex row instead of forcing overflow", () => {
    expect(kvDdRule()).toMatch(/min-width\s*:\s*0/);
  });
});
