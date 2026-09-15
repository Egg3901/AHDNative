import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CountryFlag,
  countryFlagInitials,
  resolveCountryFlagCode,
} from "./CountryFlag";

describe("resolveCountryFlagCode", () => {
  it("keeps the engine country id by default", () => {
    expect(resolveCountryFlagCode("US")).toBe("US");
    expect(resolveCountryFlagCode("uk")).toBe("UK");
    expect(resolveCountryFlagCode("SCO")).toBe("SCO");
  });

  it("flies the Soviet code for RU in Soviet eras without any lookup", () => {
    expect(resolveCountryFlagCode("RU", "1979-default")).toBe("SU");
    expect(resolveCountryFlagCode("RU", "1953-default")).toBe("SU");
    expect(resolveCountryFlagCode("ru", "1979")).toBe("SU");
  });

  it("keeps the Russian code outside Soviet eras", () => {
    expect(resolveCountryFlagCode("RU", "2019-default")).toBe("RU");
    expect(resolveCountryFlagCode("RU")).toBe("RU");
    expect(resolveCountryFlagCode("US", "1979-default")).toBe("US");
  });

  it("treats a bare stored year like its preset (Native adaptation to world.meta.era)", () => {
    expect(resolveCountryFlagCode("RU", "1979")).toBe("SU");
    expect(resolveCountryFlagCode("RU", "1953")).toBe("SU");
    expect(resolveCountryFlagCode("RU", "2019")).toBe("RU");
  });

  it("stays crash-safe on blank or nullish runtime ids and eras", () => {
    expect(resolveCountryFlagCode(null)).toBe("");
    expect(resolveCountryFlagCode(undefined)).toBe("");
    expect(resolveCountryFlagCode("   ", "1979-default")).toBe("");
    expect(resolveCountryFlagCode("RU", null)).toBe("RU");
    expect(resolveCountryFlagCode("RU", undefined)).toBe("RU");
    expect(resolveCountryFlagCode("RU", "   ")).toBe("RU");
  });
});

describe("countryFlagInitials", () => {
  it("uses the code itself for engine ids", () => {
    expect(countryFlagInitials("US")).toBe("US");
    expect(countryFlagInitials("sco")).toBe("SCO");
  });

  it("falls back to a deterministic mark for blank or nullish codes", () => {
    expect(countryFlagInitials("")).toBe("?");
    expect(countryFlagInitials("   ")).toBe("?");
    expect(countryFlagInitials(null)).toBe("?");
    expect(countryFlagInitials(undefined)).toBe("?");
  });
});

describe("CountryFlag", () => {
  it("renders a known code as a decorative mark beside the accessible name", () => {
    const { container } = render(
      <div>
        <CountryFlag countryId="US" countryName="United States" />
        <span>United States</span>
      </div>,
    );
    const mark = container.querySelector("[data-country-flag]");
    expect(mark?.getAttribute("data-country-flag")).toBe("US");
    expect(mark?.textContent).toBe("US");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.getAttribute("role")).toBeNull();
  });

  it("renders a deterministic fallback for an unknown code", () => {
    const first = render(<CountryFlag countryId="XX" countryName="Unknown" />);
    const second = render(<CountryFlag countryId="XX" countryName="Unknown" />);
    const a = first.container.querySelector("[data-country-flag]");
    const b = second.container.querySelector("[data-country-flag]");
    expect(a?.getAttribute("data-country-flag")).toBe("XX");
    expect(a?.textContent).toBe("XX");
    expect(a?.getAttribute("style")).toBe(b?.getAttribute("style"));
    first.unmount();
    second.unmount();
  });

  it("honors the era override in the rendered mark", () => {
    const { container } = render(
      <CountryFlag countryId="RU" countryName="Soviet Union" era="1979-default" />,
    );
    const mark = container.querySelector("[data-country-flag]");
    expect(mark?.getAttribute("data-country-flag")).toBe("SU");
    expect(mark?.textContent).toBe("SU");
  });

  it("exposes an accessible name only when asked with label", () => {
    render(<CountryFlag countryId="US" countryName="United States" label="United States flag" />);
    const mark = screen.getByRole("img", { name: "United States flag" });
    expect(mark.getAttribute("aria-hidden")).toBeNull();
  });

  it("uses near-3:2 whole-pixel frames (not an exact ratio) and never fetches a remote image", () => {
    const { container } = render(<CountryFlag countryId="US" size="sm" />);
    const mark = container.querySelector("[data-country-flag]") as HTMLElement;
    expect(mark).toHaveStyle({ width: "16px", height: "11px" });
    // 16x11 is near, not exactly, 3:2: within a rounding step, never exact.
    expect(16 / 11).toBeGreaterThan(1.4);
    expect(16 / 11).toBeLessThan(1.6);
    expect(16 / 11).not.toBe(1.5);
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("http");
  });

  it("widens three-letter small codes past the frame instead of clipping", () => {
    const { container } = render(<CountryFlag countryId="SCO" size="sm" />);
    const mark = container.querySelector("[data-country-flag]") as HTMLElement;
    expect(mark?.getAttribute("data-country-flag")).toBe("SCO");
    expect(mark?.textContent).toBe("SCO");
    expect(mark).toHaveStyle({ width: "auto", "min-width": "16px", height: "11px" });
  });

  it("renders a fallback mark instead of crashing on a nullish runtime id", () => {
    const { container } = render(<CountryFlag countryId={null} countryName="Unknown" />);
    const mark = container.querySelector("[data-country-flag]");
    expect(mark?.getAttribute("data-country-flag")).toBe("");
    expect(mark?.textContent).toBe("?");
  });

  it("omits the tooltip on the decorative mark and keeps it on the labelled mark", () => {
    const decorative = render(
      <div>
        <CountryFlag countryId="US" countryName="United States" />
        <span>United States</span>
      </div>,
    );
    expect(decorative.container.querySelector("[data-country-flag]")).not.toHaveAttribute("title");
    decorative.unmount();
    const labelled = render(
      <CountryFlag countryId="US" countryName="United States" label="United States flag" />,
    );
    expect(labelled.container.querySelector("[data-country-flag]")).toHaveAttribute("title", "United States");
    labelled.unmount();
  });

  it.each([320, 390])("holds a %ipx identity row: fixed lock with no remote art", (width) => {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    const { container } = render(
      <div style={{ width: `${width}px`, display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <CountryFlag countryId="SCO" countryName="Scotland" era="1953" size="sm" />
        <span>Scotland</span>
      </div>,
    );
    const mark = container.querySelector("[data-country-flag]") as HTMLElement;
    expect(mark?.getAttribute("data-country-flag")).toBe("SCO");
    expect(mark?.textContent).toBe("SCO");
    expect(mark.className).toContain("ahd-flag");
    expect(mark).toHaveStyle({ "min-width": "16px", height: "11px" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("http");
  });
});
