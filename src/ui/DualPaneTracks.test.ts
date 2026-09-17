import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Dual-pane hinge-avoidance grid tracks (#438 completion).
 *
 * The shell grid keeps navigation/content and list/detail reading surfaces
 * out of the occlusion: on real foldable hardware the spanning-media blocks
 * size the first pane to the first segment and drop a gutter track exactly
 * over the hinge gap, with each pane pinned to its own segment track.
 * Geometry-only: jsdom performs no layout, and nothing here is
 * physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

describe("dual-pane hinge-avoidance tracks (#438)", () => {
  it("drops a gutter track over a vertical hinge with panes on either side", () => {
    // Three-column segment fit: first segment, occlusion gutter, remainder.
    expect(css).toMatch(
      /@media\s*\(spanning:\s*single-fold-vertical\)[\s\S]*?\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\] \.ahd-dual-body\s*\{[^}]*env\(viewport-segment-width 0 0\)[^}]*env\(viewport-segment-left 1 0\)[^}]*env\(viewport-segment-right 0 0\)/,
    );
    // Navigation on segment 0, content past the gutter: neither spans it.
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\] \.ahd-dual-body > aside\s*\{\s*grid-column:\s*1/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\] \.ahd-dual-body > main\s*\{\s*grid-column:\s*3/,
    );
  });

  it("drops a gutter track under a horizontal hinge with panes above and below", () => {
    expect(css).toMatch(
      /@media\s*\(spanning:\s*single-fold-horizontal\)[\s\S]*?\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\] \.ahd-dual-body\s*\{[^}]*env\(viewport-segment-height 0 0\)[^}]*env\(viewport-segment-top 1 0\)[^}]*env\(viewport-segment-bottom 0 0\)/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\] \.ahd-dual-body > aside\s*\{\s*grid-row:\s*1/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\] \.ahd-dual-body > main\s*\{\s*grid-row:\s*3/,
    );
  });

  it("splits list/detail side by side only across a reported vertical hinge", () => {
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\] \.ahd-dual-panes\s*\{[^}]*grid-template-columns:[^}]*var\(--ahd-hinge-gap\)/,
    );
    // Single-pane default stacks: the base rule carries no dual qualifier.
    expect(css).toMatch(/\.ahd-dual-panes\s*\{\s*display:\s*flex;\s*flex-direction:\s*column/);
  });

  it("defines the hinge gutter on dual-pane posture only", () => {
    expect(css).toMatch(/\.ahd-screen\[data-dual-pane="dual"\]\s*\{\s*--ahd-hinge-gap:/);
  });
});

describe("segment-fitted hinge tracks without spanning media (#438)", () => {
  it("sizes the vertical panes to the reported segments with the gutter over the occlusion", () => {
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\]\[data-segfit="true"\] \.ahd-dual-body\s*\{[^}]*grid-template-columns:\s*var\(--ahd-pane0\)\s*var\(--ahd-hinge-gap\)/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\]\[data-segfit="true"\] \.ahd-dual-body > aside\s*\{\s*grid-column:\s*1/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\]\[data-segfit="true"\] \.ahd-dual-body > main\s*\{\s*grid-column:\s*3/,
    );
  });

  it("pins the footer and popovers to the content segment across a vertical hinge", () => {
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\]\[data-segfit="true"\] \.ahd-footer-inner\s*\{[^}]*margin-left:\s*calc\(var\(--ahd-pane0\) \+ var\(--ahd-hinge-gap\)/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\]\[data-segfit="true"\] \.ahd-resource-popover\s*\{[^}]*left:\s*calc\(var\(--ahd-pane0\) \+ var\(--ahd-hinge-gap\)/,
    );
  });

  it("stacks segment-fitted panes across a horizontal hinge and caps popovers at the bottom segment", () => {
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\]\[data-segfit="true"\] \.ahd-dual-body\s*\{[^}]*grid-template-rows:\s*var\(--ahd-pane0\)\s*var\(--ahd-hinge-gap\)/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\]\[data-segfit="true"\] \.ahd-dual-body > aside\s*\{\s*grid-row:\s*1/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\]\[data-segfit="true"\] \.ahd-dual-body > main\s*\{\s*grid-row:\s*3/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\]\[data-segfit="true"\] \.ahd-resource-popover\s*\{[^}]*max-height:\s*calc\(var\(--ahd-pane1\)/,
    );
  });

  it("zeroes the grid gap on segment-fitted tracks so the gutter lands exactly over the occlusion", () => {
    // The gutter track already spans the occlusion. The dual-pane base grid
    // carries gap: var(--ahd-hinge-gap), which the shell overrides inline to
    // the exact pixel occlusion; without gap: 0 it would pad both sides of
    // the gutter track and push the content pane off its reported segment.
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="vertical"\]\[data-segfit="true"\] \.ahd-dual-body\s*\{[^}]*gap:\s*0/,
    );
    expect(css).toMatch(
      /\.ahd-screen\[data-dual-pane="dual"\]\[data-hinge="horizontal"\]\[data-segfit="true"\] \.ahd-dual-body\s*\{[^}]*gap:\s*0/,
    );
  });
});
