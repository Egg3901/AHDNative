/**
 * Commodity hero imagery (#378, slice of #143).
 *
 * Rendered contract for the offline commodity hero set: the 14
 * `public/static/heroes/commodity-*.webp` files byte-identical to AHDGame
 * render through `RouteHero` (reference image-error gradient fallback) with
 * the `actions.webp` fallback for the 14 reference commodity types whose art
 * is not bundled, plus unknown keys. No remote fetch, upload pipeline, or
 * logo route is involved.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  COMMODITY_HERO_ALT,
  COMMODITY_HERO_IMAGE,
  RouteHero,
  commodityHero,
} from "./RouteHero";

/** Reference commodity keys whose hero art ships offline in this slice. */
const BUNDLED = [
  "steel",
  "electronics",
  "energy",
  "chemicals",
  "pharmaceuticals",
  "food",
  "building_materials",
  "software",
  "financial_services",
  "advertising",
  "vehicles",
  "retail",
  "freight",
  "consulting_services",
];

/**
 * Reference commodity keys (AHDGame `COMMODITY_HERO_SLUGS`) with no local
 * file: fertilizers, construction_services, healthcare_services,
 * real_estate_services, iron, coal, oil, rare_earth, timber, natural_gas,
 * ordnance, plastics, network_services, entertainment_services.
 */
const UNPORTED = [
  "fertilizers",
  "construction_services",
  "healthcare_services",
  "real_estate_services",
  "iron",
  "coal",
  "oil",
  "rare_earth",
  "timber",
  "natural_gas",
  "ordnance",
  "plastics",
  "network_services",
  "entertainment_services",
];

function heroPath(commodity: string): string {
  return join(process.cwd(), "public", COMMODITY_HERO_IMAGE[commodity].replace(/^\//, ""));
}

describe("commodity hero imagery", () => {
  it("maps exactly the 14 bundled commodity types to their offline files", () => {
    expect(Object.keys(COMMODITY_HERO_IMAGE).sort()).toEqual([...BUNDLED].sort());
    // Reference slugs use hyphens where commodity keys use underscores.
    expect(COMMODITY_HERO_IMAGE["building_materials"]).toBe("/static/heroes/commodity-building-materials.webp");
    expect(COMMODITY_HERO_IMAGE["consulting_services"]).toBe(
      "/static/heroes/commodity-consulting-services.webp",
    );
    expect(COMMODITY_HERO_IMAGE["financial_services"]).toBe("/static/heroes/commodity-financial-services.webp");
    for (const commodity of BUNDLED) {
      expect(COMMODITY_HERO_IMAGE[commodity]).toMatch(/^\/static\/heroes\/commodity-[a-z-]+\.webp$/);
      expect(COMMODITY_HERO_ALT[commodity]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("resolves every bundled type to local art, never a remote URL", () => {
    for (const commodity of BUNDLED) {
      const src = commodityHero(commodity);
      expect(src).toBe(COMMODITY_HERO_IMAGE[commodity]);
      expect(src).not.toMatch(/^https?:\/\//);
    }
  });

  it("falls back to the Actions artwork for unported and unknown commodity types", () => {
    for (const commodity of [...UNPORTED, "xx-unknown", "", "STEEL"]) {
      expect(commodityHero(commodity)).toBe("/static/heroes/actions.webp");
    }
  });

  it("bundles decodable webp bytes for every mapped hero", () => {
    for (const commodity of BUNDLED) {
      const path = heroPath(commodity);
      expect(existsSync(path), `${path} exists in the offline bundle`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("renders a bundled commodity hero from the local bundle only", () => {
    render(
      <RouteHero
        image={commodityHero("steel")}
        alt={COMMODITY_HERO_ALT["steel"]}
        eyebrow="Commodity"
        title="Steel"
      />,
    );
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["steel"] });
    const src = hero.getAttribute("src") ?? "";
    expect(src).toBe("/static/heroes/commodity-steel.webp");
    expect(src).not.toMatch(/^https?:\/\//);
    expect(screen.getByRole("heading", { name: "Steel" })).toBeInTheDocument();
  });

  it("keeps the gradient and content when a commodity hero image fails, matching the reference fallback", () => {
    render(
      <RouteHero
        image={commodityHero("freight")}
        alt={COMMODITY_HERO_ALT["freight"]}
        eyebrow="Commodity"
        title="Freight"
      >
        <span>status</span>
      </RouteHero>,
    );
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["freight"] });
    fireEvent.error(hero);
    expect(screen.queryByRole("img", { name: COMMODITY_HERO_ALT["freight"] })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Freight" })).toBeInTheDocument();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
  });

  it("adapts the hero crop from phones to wider screens (320/390 use the compact crop)", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)/);
    expect(css).toMatch(/min-height:\s*220px/);
  });
});
