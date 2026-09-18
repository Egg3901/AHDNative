import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contrastRatio } from "./materials";

/**
 * Press feedback on glass chrome (issue #437).
 *
 * Touch has no hover, and the shipped sheet previously had zero `:active`
 * rules, so tapping bottom-nav, drawer rows, drawer disclosures, or footer
 * resource cells gave no visual press feedback on phones. These cases pin an
 * instant opaque press tint on the chrome controls. jsdom performs no layout,
 * so the width cases pin
 * that the rules are not gated behind a viewport media query (they apply
 * at 390px phone and 1280px desktop widths alike). Nothing here is
 * physical-device evidence.
 */

const css = readFileSync("src/ui/ui.css", "utf8");

/** Body of the first top-level rule matching a selector pattern. */
function ruleBody(pattern: RegExp): string {
  const match = css.match(pattern);
  expect(match, `missing rule ${pattern}`).toBeTruthy();
  return match![0];
}

/** Concatenated bodies of every @media block in the sheet. */
function mediaBlockBodies(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const at = source.indexOf("@media", index);
    if (at < 0) break;
    const open = source.indexOf("{", at);
    expect(open, "unterminated @media block").toBeGreaterThanOrEqual(0);
    let depth = 0;
    let cursor = open;
    while (cursor < source.length) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
      cursor += 1;
    }
    out += source.slice(open, cursor + 1);
    index = cursor + 1;
  }
  return out;
}

/** Stylesheet with every @media block removed (balanced-brace scan). */
function withoutMediaBlocks(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const at = source.indexOf("@media", index);
    if (at < 0) {
      out += source.slice(index);
      break;
    }
    out += source.slice(index, at);
    const open = source.indexOf("{", at);
    expect(open, "unterminated @media block").toBeGreaterThanOrEqual(0);
    let depth = 0;
    let cursor = open;
    while (cursor < source.length) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
      cursor += 1;
    }
    index = cursor + 1;
  }
  return out;
}

describe("chrome press feedback (#437)", () => {
  it("paints an instant opaque press tint on bottom-nav items", () => {
    const body = ruleBody(/\.ahd-bottomnav-item:active\s*\{[^}]*\}/);
    expect(body).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--ahd-card-elevated\)\s*85%,\s*black\)/);
    expect(body).not.toMatch(/backdrop-filter/);
    expect(body).not.toMatch(/transparent/);
  });

  it("paints the same press tint on drawer rows but keeps disabled rows inert", () => {
    const body = ruleBody(/\.ahd-drawer-item:active:not\(:disabled\)\s*\{[^}]*\}/);
    expect(body).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--ahd-card-elevated\)\s*85%,\s*black\)/);
    const disabled = ruleBody(/\.ahd-drawer-item:disabled:active\s*\{[^}]*\}/);
    expect(disabled).toMatch(/background:\s*transparent/);
  });

  it("paints the same press tint on drawer disclosure toggles", () => {
    // The disclosures are buttons on the blurred drawer chrome with no
    // hover treatment, so without an :active tint tapping a group header
    // gives no press feedback on phones while sibling rows tint.
    const body = ruleBody(/\.ahd-drawer-disclosure:active\s*\{[^}]*\}/);
    expect(body).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--ahd-card-elevated\)\s*85%,\s*black\)/);
    expect(body).not.toMatch(/backdrop-filter/);
    expect(body).not.toMatch(/transparent/);
  });

  it("paints the same instant press tint on footer resource cells", () => {
    const body = ruleBody(/\.ahd-status-btn:active\s*\{[^}]*\}/);
    expect(body).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--ahd-card-elevated\)\s*85%,\s*black\)/);
    expect(body).not.toMatch(/backdrop-filter/);
    expect(body).not.toMatch(/transparent/);
    expect(body).not.toMatch(/transition\s*:/);
    expect(body).not.toMatch(/animation\s*:/);
    expect(body).not.toMatch(/outline/);
    expect(body).not.toMatch(/box-shadow/);
  });

  it("applies at phone (390px) and desktop (1280px) widths with no viewport gate", () => {
    // The press rules must survive with all viewport-gated blocks removed:
    // they ship at top level, not inside a max-width/min-width query.
    const topLevel = withoutMediaBlocks(css);
    expect(topLevel).toMatch(/\.ahd-bottomnav-item:active\s*\{[^}]*\}/);
    expect(topLevel).toMatch(/\.ahd-drawer-item:active:not\(:disabled\)\s*\{[^}]*\}/);
    expect(topLevel).toMatch(/\.ahd-drawer-disclosure:active\s*\{[^}]*\}/);
    // No viewport gate: none of the press rules may hide inside a media
    // block. A character-window probe false-positives once a top-level
    // rule ships near (after) a viewport block, so scan the blocks exactly.
    const gated = mediaBlockBodies(css);
    for (const selector of [
      /\.ahd-bottomnav-item:active/,
      /\.ahd-drawer-item:active/,
      /\.ahd-drawer-disclosure:active/,
    ]) {
      expect(gated).not.toMatch(selector);
    }
    // The status-cell rule ships top-level (proven here); it is not added to
    // the 2000-char media-window probes below because it intentionally sits
    // just after the 360px large-text block, which those windows would
    // false-positive on. Top-level presence is the no-viewport-gate proof.
    expect(topLevel).toMatch(/\.ahd-status-btn:active\s*\{[^}]*\}/);
    expect(css).not.toMatch(/@media[^{]*max-width[\s\S]{0,2000}?\.ahd-(bottomnav-item|drawer-item):active/);
    expect(css).not.toMatch(/@media[^{]*min-width[\s\S]{0,2000}?\.ahd-(bottomnav-item|drawer-item):active/);
  });

  it("adds no transition or animation with the press tint", () => {
    for (const pattern of [
      /\.ahd-bottomnav-item:active\s*\{[^}]*\}/,
      /\.ahd-drawer-item:active:not\(:disabled\)\s*\{[^}]*\}/,
      /\.ahd-drawer-disclosure:active\s*\{[^}]*\}/,
      /\.ahd-status-btn:active\s*\{[^}]*\}/,
    ]) {
      const body = ruleBody(pattern);
      expect(body).not.toMatch(/transition\s*:/);
      expect(body).not.toMatch(/animation\s*:/);
    }
  });

  it("leaves keyboard focus rings untouched", () => {
    // Both controls keep their :focus-visible shadow rings, and the press
    // bodies must not touch outline or box-shadow, so a pressed-and-focused
    // control never loses its Tab indicator.
    expect(css).toMatch(/\.ahd-bottomnav-item:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ahd-focus\)/);
    expect(css).toMatch(/\.ahd-drawer-item:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ahd-focus\)/);
    expect(css).toMatch(/\.ahd-drawer-disclosure:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ahd-focus\)/);
    expect(css).toMatch(/\.ahd-status-btn:focus-visible\s*\{[^}]*box-shadow:\s*var\(--ahd-focus\)/);
    for (const pattern of [
      /\.ahd-bottomnav-item:active\s*\{[^}]*\}/,
      /\.ahd-drawer-item:active:not\(:disabled\)\s*\{[^}]*\}/,
      /\.ahd-drawer-disclosure:active\s*\{[^}]*\}/,
      /\.ahd-status-btn:active\s*\{[^}]*\}/,
    ]) {
      const body = ruleBody(pattern);
      expect(body).not.toMatch(/outline/);
      expect(body).not.toMatch(/box-shadow/);
    }
  });

  it("holds text contrast on the pressed tint", () => {
    // color-mix(in srgb, #26263a 85%, black) interpolates per channel:
    // 0x26 * 0.85 = 32.3 -> 0x20, 0x3a * 0.85 = 49.3 -> 0x31.
    // Darkening can only help light-on-dark pairs already pinned for the
    // elevated token (body 12.1+, secondary 4.6+), verified here directly.
    expect(contrastRatio("#e8e8ee", "#202031")).toBeGreaterThanOrEqual(7);
    expect(contrastRatio("#8f8f9d", "#202031")).toBeGreaterThanOrEqual(4.5);
  });
});
