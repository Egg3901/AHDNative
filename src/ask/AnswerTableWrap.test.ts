import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Ask answer-table wrapping (phone data tables).
 *
 * Ask answers render arbitrary author tables (`.av-table` inside
 * `.av-tbl-wrap`). The header row pinned `white-space: nowrap`, so a long
 * column label ("Unemployment rate (%)", "Projected revenue") forced the
 * whole table wider than a 320/390px phone and pushed fitting content into
 * a horizontal scroll. Body cells had no break rule either, so one long
 * unbroken token (a big figure, a URL, a unit name) blew out the table the
 * same way answer paragraphs already guard against
 * (`.av-answer p { overflow-wrap: anywhere }`). Desktop columns have room,
 * so wrapping there is a no-op. Geometry-only: jsdom performs no layout,
 * so these cases pin the shipped stylesheet text.
 */

const css = readFileSync("src/ask/ask.css", "utf8");

function rule(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("Ask answer-table phone wrapping", () => {
  it("lets long column labels wrap instead of forcing phone scroll", () => {
    expect(rule("\\.av-table th")).not.toMatch(/white-space:\s*nowrap/);
  });

  it("breaks long header tokens at 320/390px", () => {
    expect(rule("\\.av-table th")).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("breaks long unbroken cell tokens like answer paragraphs do", () => {
    expect(rule("\\.av-table td")).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
