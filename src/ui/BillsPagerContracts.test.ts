import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Bills-pager narrow-viewport contract.
 *
 * The Legislature hub bills pager (Previous / Page N of M / Next) was the
 * remaining non-wrapping button row after the Elections pager fix: no
 * flex-wrap and pill buttons with their automatic minimum width, so long or
 * localized pager labels exceed 320px and clip instead of reflowing. The row
 * now wraps and every item shrinks (min-width zero, buttons capped at the
 * row width). jsdom performs no layout, so this asserts the shipped rule
 * text, matching the ElectionPagerContracts convention. Desktop is
 * unchanged: the row still fits on one line when labels are short.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

function pagerRule(): string {
  const match = css.match(/\.ahd-bills-pager\s*\{([^}]*)\}/);
  expect(match, "missing .ahd-bills-pager rule").toBeTruthy();
  return match![1];
}

function pagerButtonRule(): string {
  const match = css.match(/\.ahd-bills-pager\s+\.ahd-btn\s*\{([^}]*)\}/);
  expect(match, "missing .ahd-bills-pager .ahd-btn rule").toBeTruthy();
  return match![1];
}

describe("bills-pager narrow-viewport contract", () => {
  it("wraps the pager row instead of clipping long labels at 320px", () => {
    expect(pagerRule()).toMatch(/flex-wrap\s*:\s*wrap/);
  });

  it("lets the row shrink inside the card instead of forcing overflow", () => {
    expect(pagerRule()).toMatch(/min-width\s*:\s*0/);
  });

  it("lets pager buttons shrink to the row width with long labels", () => {
    expect(pagerButtonRule()).toMatch(/min-width\s*:\s*0/);
    expect(pagerButtonRule()).toMatch(/max-width\s*:\s*100%/);
  });
});
