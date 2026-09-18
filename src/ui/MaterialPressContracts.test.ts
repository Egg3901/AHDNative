import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contrastRatio } from "./materials";

/**
 * Press feedback on glass chrome (issue #437).
 *
 * Touch has no hover, and the shipped sheet previously had zero `:active`
 * rules, so tapping bottom-nav or drawer rows gave no visual press
 * feedback on phones. These cases pin an instant opaque press tint on the
 * two chrome controls. jsdom performs no layout, so the width cases pin
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

  it("applies at phone (390px) and desktop (1280px) widths with no viewport gate", () => {
    // The press rules must survive with all viewport-gated blocks removed:
    // they ship at top level, not inside a max-width/min-width query.
    const topLevel = withoutMediaBlocks(css);
    expect(topLevel).toMatch(/\.ahd-bottomnav-item:active\s*\{[^}]*\}/);
    expect(topLevel).toMatch(/\.ahd-drawer-item:active:not\(:disabled\)\s*\{[^}]*\}/);
    expect(css).not.toMatch(/@media[^{]*max-width[\s\S]{0,2000}?\.ahd-(bottomnav-item|drawer-item):active/);
    expect(css).not.toMatch(/@media[^{]*min-width[\s\S]{0,2000}?\.ahd-(bottomnav-item|drawer-item):active/);
  });

  it("adds no transition or animation with the press tint", () => {
    for (const pattern of [
      /\.ahd-bottomnav-item:active\s*\{[^}]*\}/,
      /\.ahd-drawer-item:active:not\(:disabled\)\s*\{[^}]*\}/,
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
    for (const pattern of [
      /\.ahd-bottomnav-item:active\s*\{[^}]*\}/,
      /\.ahd-drawer-item:active:not\(:disabled\)\s*\{[^}]*\}/,
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
