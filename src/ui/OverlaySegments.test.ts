import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Transient-overlay segment confinement (#436/#438 overlap).
 *
 * Footer/drawer/main composition already owns the safe areas, and the
 * dual-pane grid already keeps navigation/content out of the hinge. The
 * resource-details and notification-preview popovers are direct children of
 * the fixed footer (absolute, left:0 right:0), so without segment-scoped
 * offsets they span a vertical hinge where the footer controls stop, and
 * their viewport-based max-height lets a tall popover reach across a
 * horizontal hinge. These cases pin the spanning-media confinement that
 * keeps them inside the content/bottom segment, plus the single-pane
 * geometry that must not move. Geometry-only: jsdom performs no layout,
 * and nothing here is physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

describe("transient overlay hinge confinement (#436/#438)", () => {
  it("pins popovers to the content segment across a vertical hinge", () => {
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\] \.ahd-resource-popover\s*\{[^}]*env\(viewport-segment-left 1 0\)/,
    );
  });

  it("caps popover height to the bottom segment across a horizontal hinge", () => {
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\] \.ahd-resource-popover\s*\{[^}]*env\(viewport-segment-height 1 0\)/,
    );
  });

  it("scopes every hinge overlay rule to spanning media on dual-pane posture", () => {
    expect(css).toMatch(
      /@media\s*\(spanning:\s*single-fold-vertical\)[\s\S]*?\.ahd-resource-popover[\s\S]*?env\(viewport-segment-left 1 0\)/,
    );
    expect(css).toMatch(
      /@media\s*\(spanning:\s*single-fold-horizontal\)[\s\S]*?\.ahd-resource-popover[\s\S]*?env\(viewport-segment-height 1 0\)/,
    );
  });

  it("keeps single-pane popover geometry anchored above the footer inside the top inset", () => {
    expect(css).toMatch(
      /\.ahd-resource-popover\s*\{[^}]*position:\s*absolute;\s*bottom:\s*calc\(100% \+ 0\.25rem\);\s*left:\s*0;\s*right:\s*0/,
    );
    expect(css).toMatch(
      /\.ahd-resource-popover[^}]*max-height:\s*calc\(100dvh[^}]*env\(safe-area-inset-top\)/,
    );
    expect(css).toMatch(/\.ahd-resource-popover[^}]*overflow-y:\s*auto/);
  });

  it("keeps the drawer scrim fullscreen while the docked dual-pane drawer stays in flow", () => {
    expect(css).toMatch(/\.ahd-drawer-backdrop\s*\{[^}]*position:\s*fixed;\s*inset:\s*0/);
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\] \.ahd-drawer-docked\s*\{[^}]*position:\s*sticky/,
    );
  });
});
