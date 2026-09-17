import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Short-landscape route-hero budget (phone landscape at roughly 667x375 and
 * 844x390, Dynamic-Island era side cutout).
 *
 * The base hero is 172px and the wide-viewport rule grows it to 220px from
 * 700px up. An 844x390 landscape phone trips that wider rule while only 390px
 * tall, so the banner plus the fixed footer crowds the route actions out of
 * the first viewport. The orientation+height override below caps the hero for
 * short landscape viewports only. Geometry-only: jsdom performs no layout,
 * and nothing here is physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

const SHORT_QUERY = /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*500px\)/;
const shortAt = css.search(SHORT_QUERY);
/** Everything from the short-landscape override to the end of the file. */
const shortCss = shortAt >= 0 ? css.slice(shortAt) : "";

/** First min-height px pinned on .ahd-route-hero inside the override. */
function heroMinHeightIn(): number {
  expect(shortAt, "missing short-landscape hero override").toBeGreaterThanOrEqual(0);
  const height = shortCss.match(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*([\d.]+)px/);
  expect(height, "override pins no hero min-height").toBeTruthy();
  return parseFloat(height![1]);
}

describe("route hero short-landscape budget", () => {
  it("caps the hero below the 172px portrait base in short landscape", () => {
    expect(heroMinHeightIn()).toBeLessThan(172);
  });

  it("keeps the portrait base and the wide-viewport hero untouched", () => {
    expect(css).toMatch(/\.ahd-route-hero\s*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(
      /@media\s*\(min-width:\s*700px\)\s*\{\s*\.ahd-route-hero,\s*\.ahd-route-hero-content\s*\{\s*min-height:\s*220px/,
    );
  });

  it("orders the short-landscape override after the taller rules so it wins", () => {
    const wideAt = css.search(/@media\s*\(min-width:\s*700px\)/);
    expect(shortAt).toBeGreaterThan(wideAt);
  });

  it("tightens hero padding in short landscape without collapsing it", () => {
    const padding = shortCss.match(/\.ahd-route-hero-content\s*\{[^}]*padding:\s*([^;]+);/);
    expect(padding, "override pins no hero content padding").toBeTruthy();
    expect(padding![1]).not.toMatch(/1\.35rem/);
  });
});
