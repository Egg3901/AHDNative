/**
 * PolicyCompass phone legibility: the 100-unit viewBox scales the 3.1px
 * quadrant labels to ~8px at 320px (measured 36-47px wide, 10px tall in
 * headless Chromium), too small to read. profile.css carries a phone-only
 * bump; desktop keeps the base treatment. Rendered case pins the SVG
 * containment (viewBox + meet) that lets the plot scale without overflow.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PolicyCompass } from "./PolicyCompass";
import "./profile.css";

const css = readFileSync("src/ui/profile.css", "utf8");

describe("PolicyCompass phone media", () => {
  it("bumps quadrant labels phone-only, keeping the desktop base", () => {
    expect(css).toMatch(/\.ahd-compass-corner\s*\{[^}]*font-size:\s*3\.1px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*380px\)[\s\S]*?\.ahd-compass-corner[\s\S]*?font-size:\s*4px/);
  });

  it("renders a contained, labelled SVG plot with quadrant labels", () => {
    render(<PolicyCompass economic={1} social={0} markers={[{ economic: 2, social: 2, glyph: "R", name: "Republican Party", color: "#dc2626" }]} />);
    const plot = screen.getByRole("img", { name: /Political compass/ });
    expect(plot.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(plot.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    for (const label of ["Left · Trad.", "Right · Trad.", "Left · Lib.", "Right · Lib."]) {
      expect(plot.textContent).toContain(label);
    }
  });
});
