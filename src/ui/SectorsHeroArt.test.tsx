/**
 * Sectors-directory list hero (#378, slice of #143).
 *
 * Rendered contract for the sectors list band: the directory previously
 * opened on a plain text card, so it now reuses the already-bundled steel
 * works art (`SECTORS_LIST_HERO_IMAGE`) through `RouteHero` (reference
 * image-error gradient fallback). Zero new binary bytes, zero new rights:
 * the file was cleared in the commodity slice. No remote fetch, no
 * corporation-mechanic change; the turn/count line rides as hero children.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MarketsView } from "../game/markets";
import {
  COMMODITY_HERO_ALT,
  MARKETS_LIST_HERO_IMAGE,
  RouteHero,
  SECTORS_LIST_HERO_IMAGE,
} from "./RouteHero";
import { SectorsPanel } from "./SectorsPanel";

function emptyMarkets(): MarketsView {
  return {
    playerCountryId: "US",
    playerCash: 10_000,
    playerCurrency: "USD",
    playerActions: 4,
    turn: 3,
    marketsPhaseEnabled: true,
    economyPhaseEnabled: true,
    corporationsPhaseEnabled: true,
    countries: [],
    listings: [],
    sectors: [],
  };
}

function renderDirectory(): void {
  render(
    <SectorsPanel
      markets={emptyMarkets()}
      busy={false}
      onSectorSale={vi.fn()}
      onOpenCompany={vi.fn()}
      onOpenRegion={vi.fn()}
    />,
  );
}

describe("sectors-directory list hero", () => {
  it("reuses the bundled steel art, distinct from the Markets list band", () => {
    expect(SECTORS_LIST_HERO_IMAGE).toBe("/static/heroes/commodity-steel.webp");
    expect(SECTORS_LIST_HERO_IMAGE).not.toBe(MARKETS_LIST_HERO_IMAGE);
    expect(SECTORS_LIST_HERO_IMAGE).not.toMatch(/^https?:\/\//);
    expect(COMMODITY_HERO_ALT["steel"]?.length ?? 0).toBeGreaterThan(0);
  });

  it("bundles decodable webp bytes for the reused hero", () => {
    const path = join(process.cwd(), "public", SECTORS_LIST_HERO_IMAGE.replace(/^\//, ""));
    expect(existsSync(path), `${path} exists in the offline bundle`).toBe(true);
    const bytes = readFileSync(path);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("renders the directory band from the local bundle only", () => {
    renderDirectory();
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["steel"] });
    expect(hero.getAttribute("src")).toBe(SECTORS_LIST_HERO_IMAGE);
    expect(hero.getAttribute("src")).not.toMatch(/^https?:\/\//);
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.getByText(/Browse every recorded corporate sector/)).toBeInTheDocument();
  });

  it("keeps the gradient and content when the sectors hero image fails, matching the reference fallback", () => {
    renderDirectory();
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["steel"] });
    fireEvent.error(hero);
    expect(screen.queryByRole("img", { name: COMMODITY_HERO_ALT["steel"] })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeInTheDocument();
    expect(screen.getByText(/Browse every recorded corporate sector/)).toBeInTheDocument();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
  });

  it("adapts the hero crop from phones to wider screens with no overflow", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)/);
    expect(css).toMatch(/min-height:\s*220px/);
  });

  it("renders the band as a RouteHero so standalone hero rules still apply", () => {
    render(
      <RouteHero
        image={SECTORS_LIST_HERO_IMAGE}
        alt={COMMODITY_HERO_ALT["steel"]}
        eyebrow="World"
        title="Sectors"
      />,
    );
    expect(document.querySelector(".ahd-route-hero")).not.toBeNull();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
  });
});
