/**
 * Company hero art (#378, slice of #143).
 *
 * Rendered contract for the company hero layer: the 17 engine corporation
 * sector types resolve to already-bundled offline art with zero new binary
 * bytes, through `RouteHero` (reference image-error gradient fallback).
 * Sectors with no bundled depiction fall back to Actions art, never a
 * broken image or a remote fetch. The stock-market list band reuses the
 * bundled NYSE art. Bundle-size bounds pin the zero-byte growth.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MarketListing, MarketsView } from "../game/markets";
import {
  COMMODITY_HERO_ALT,
  COMMODITY_HERO_FALLBACK_ALT,
  COMPANY_HERO_FALLBACK_ALT,
  COMPANY_SECTOR_COMMODITY,
  MARKETS_LIST_HERO_IMAGE,
  RouteHero,
  commodityHero,
  companyHero,
  companyHeroAlt,
} from "./RouteHero";

/** All 17 engine corporation sector types, verbatim from CORPORATION_TYPES. */
const ENGINE_SECTORS = [
  "financial",
  "media",
  "manufacturing",
  "chemical_industries",
  "healthcare",
  "retail",
  "automobiles",
  "technology",
  "energy",
  "agriculture",
  "real_estate",
  "construction",
  "defense",
  "telecommunications",
  "entertainment",
  "logistics",
  "extraction",
];

/** Sectors with no bundled depiction: Actions fallback, by design. */
const UNMAPPED = ["defense", "extraction", "real_estate", "telecommunications"];

/** Expected alias target per mapped sector (documents the mapping). */
const EXPECTED_ALIASES: Record<string, string> = {
  agriculture: "food",
  automobiles: "vehicles",
  chemical_industries: "chemicals",
  construction: "building_materials",
  energy: "energy",
  entertainment: "advertising",
  financial: "financial_services",
  healthcare: "pharmaceuticals",
  logistics: "freight",
  manufacturing: "steel",
  media: "advertising",
  retail: "retail",
  technology: "electronics",
};

async function loadPanel() {
  const module = await import("./MarketsPanel");
  return module.MarketsPanel;
}

function makeMarkets(listings: MarketListing[] = []): MarketsView {
  return {
    playerCountryId: "US",
    playerCash: 1000,
    playerCurrency: "USD",
    playerActions: 4,
    turn: 0,
    marketsPhaseEnabled: true,
    economyPhaseEnabled: true,
    corporationsPhaseEnabled: true,
    countries: [],
    listings,
    sectors: [],
  };
}

describe("company hero mapping", () => {
  it("covers every engine corporation sector with a deterministic resolution", () => {
    expect(Object.keys(COMPANY_SECTOR_COMMODITY).sort()).toEqual(
      Object.keys(EXPECTED_ALIASES).sort(),
    );
    for (const [sector, commodity] of Object.entries(EXPECTED_ALIASES)) {
      expect(COMPANY_SECTOR_COMMODITY[sector]).toBe(commodity);
    }
    for (const sector of UNMAPPED) {
      expect(COMPANY_SECTOR_COMMODITY[sector]).toBeUndefined();
    }
    // Full coverage: mapped plus explicitly unmapped equals the engine set.
    expect([...Object.keys(COMPANY_SECTOR_COMMODITY), ...UNMAPPED].sort()).toEqual(
      [...ENGINE_SECTORS].sort(),
    );
  });

  it("resolves every mapped sector to its bundled file, never a remote URL", () => {
    for (const sector of Object.keys(EXPECTED_ALIASES)) {
      const src = companyHero(sector);
      expect(src).toBe(commodityHero(EXPECTED_ALIASES[sector]));
      expect(src).toMatch(/^\/static\/heroes\/commodity-[a-z-]+\.webp$/);
      expect(src).not.toMatch(/^https?:\/\//);
    }
  });

  it("falls back to Actions art for unmapped, unknown and empty sectors", () => {
    for (const sector of [...UNMAPPED, "xx-unknown", "", "MEDIA", " media"]) {
      expect(companyHero(sector)).toBe("/static/heroes/actions.webp");
    }
  });

  it("accepts raw commodity keys through the layered resolver", () => {
    expect(companyHero("steel")).toBe("/static/heroes/commodity-steel.webp");
    expect(companyHero("fertilizers")).toBe("/static/heroes/actions.webp");
  });

  it("resolves alt text totally with a nonempty company fallback", () => {
    expect(COMPANY_HERO_FALLBACK_ALT.length).toBeGreaterThan(0);
    expect(COMPANY_HERO_FALLBACK_ALT).not.toBe(COMMODITY_HERO_FALLBACK_ALT);
    for (const sector of Object.keys(EXPECTED_ALIASES)) {
      const mapped = EXPECTED_ALIASES[sector];
      expect(companyHeroAlt(sector)).toBe(COMMODITY_HERO_ALT[mapped]);
      expect(companyHeroAlt(sector).length).toBeGreaterThan(0);
    }
    for (const sector of [...UNMAPPED, "xx-unknown", ""]) {
      expect(companyHeroAlt(sector)).toBe(COMPANY_HERO_FALLBACK_ALT);
    }
    // Exact-key: no case folding or trimming.
    expect(companyHeroAlt("MEDIA")).toBe(COMPANY_HERO_FALLBACK_ALT);
    expect(companyHeroAlt(" media")).toBe(COMPANY_HERO_FALLBACK_ALT);
  });

  it("renders a mapped company hero from the local bundle only", () => {
    render(
      <RouteHero
        image={companyHero("manufacturing")}
        alt={companyHeroAlt("manufacturing")}
        eyebrow="manufacturing"
        title="US-steel"
      />,
    );
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["steel"] });
    expect(hero.getAttribute("src")).toBe("/static/heroes/commodity-steel.webp");
    expect(hero.getAttribute("src")).not.toMatch(/^https?:\/\//);
  });

  it("renders the fallback accessible name for an unmapped sector", () => {
    render(
      <RouteHero
        image={companyHero("defense")}
        alt={companyHeroAlt("defense")}
        eyebrow="defense"
        title="US-defense"
      />,
    );
    const hero = screen.getByRole("img", { name: COMPANY_HERO_FALLBACK_ALT });
    expect(hero.getAttribute("src")).toBe("/static/heroes/actions.webp");
  });

  it("keeps the gradient and content when a company hero image fails", () => {
    render(
      <RouteHero
        image={companyHero("media")}
        alt={companyHeroAlt("media")}
        eyebrow="media"
        title="US-media"
      >
        <span>status</span>
      </RouteHero>,
    );
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["advertising"] });
    fireEvent.error(hero);
    expect(
      screen.queryByRole("img", { name: COMMODITY_HERO_ALT["advertising"] }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "US-media" })).toBeInTheDocument();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
  });

  it("pins the stock-market list band to the bundled NYSE art", () => {
    expect(MARKETS_LIST_HERO_IMAGE).toBe("/static/heroes/commodity-financial-services.webp");
  });
});

describe("MarketsPanel hero bands (#378)", () => {
  let MarketsPanel: Awaited<ReturnType<typeof loadPanel>>;
  // Hoisted: transforming MarketsPanel plus its panel deps can exceed the
  // per-test timeout under load; the import cost is paid once here.
  beforeAll(async () => {
    MarketsPanel = await loadPanel();
  });

  it("renders the list band with NYSE art, cash line and no external requests", async () => {
    render(<MarketsPanel markets={makeMarkets()} busy={false} onAction={vi.fn()} />);
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["financial_services"] });
    expect(hero.getAttribute("src")).toBe(MARKETS_LIST_HERO_IMAGE);
    expect(hero.getAttribute("src")).not.toMatch(/^https?:\/\//);
    expect(screen.getByRole("heading", { name: "Stock market" })).toBeInTheDocument();
    expect(screen.getByText(/0 listed companies\. Cash/i)).toBeInTheDocument();
    expect(screen.getByText(/No listed corporations\./i)).toBeInTheDocument();
  });

  it("renders a mapped company hero on detail for a previously-fallback sector", async () => {
    const user = userEvent.setup();
    const listing = {
      id: "US-media",
      ticker: "US.MEDI",
      name: "US-media",
      countryId: "US",
      countryName: "United States",
      sectorType: "media",
      sectorLabel: "media",
      sectorAsset: {
        id: "corporate-sector:US:media:US-media",
        corporationId: "US-media",
        countryId: "US",
        sectorType: "media",
        scope: "national",
        regionId: null,
        regionName: null,
        workers: 0,
        unionId: null,
        unionName: null,
        forSale: null,
        owner: "corporation",
      },
      currency: "USD",
      cashCurrencyMatches: true,
      sharePrice: 774,
      fundamentalSharePrice: 774,
      totalShares: 10_000_000,
      publicFloat: 4_900_000,
      liquidCapital: 50_000,
      revenue: 1000,
      currentGrowthRate: 3,
      profitMargin: 8,
      effectiveProfitMargin: 8,
      insolvent: false,
      foundedAtTurn: 0,
      isBank: false,
      playerShares: 0,
      playerAvgCostPerShare: null,
      npcShares: 5_100_000,
      shareholders: [{ holder: "npc", shares: 5_100_000, avgCostPerShare: null }],
      controllingHolder: "npc",
      earningsHistory: [],
      priceHistory: [],
      buy: { id: "buyShares", name: "Buy Shares", cost: 0, available: true },
      sell: { id: "sellShares", name: "Sell Shares", cost: 0, available: false },
    };
    render(
      <MarketsPanel
        markets={makeMarkets([listing as MarketListing])}
        busy={false}
        onAction={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /US\.MEDI US-media/i }));
    const hero = screen.getByRole("img", { name: COMMODITY_HERO_ALT["advertising"] });
    expect(hero.getAttribute("src")).toBe("/static/heroes/commodity-advertising.webp");
    expect(screen.getByRole("heading", { name: "US-media" })).toBeInTheDocument();
  });

  it("adapts both bands from phones to wider screens with no overflow", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)/);
    expect(css).toMatch(/min-height:\s*220px/);
    expect(css).toMatch(/\.ahd-route-hero-image[^{]*\{[^}]*object-fit:\s*cover/);
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*overflow:\s*hidden/);
  });
});

describe("hero bundle-size bound (#378)", () => {
  it("adds zero bytes: the company layer reuses bundled files only", () => {
    const dir = join(process.cwd(), "public", "static", "heroes");
    const files = readdirSync(dir).filter((file) => file.endsWith(".webp"));
    // actions, 3 bank, 14 commodity, parties, politicians, 4 executive
    // houses, us-overview = 25. This pins roster growth for this slice.
    expect(files.length).toBe(25);
    let total = 0;
    for (const file of files) {
      const bytes = statSync(join(dir, file)).size;
      expect(bytes).toBeGreaterThan(0);
      // No single hero may exceed 1.5 MB (largest current file is ~1.1 MB).
      expect(bytes).toBeLessThan(1_500_000);
      total += bytes;
    }
    // Whole offline hero set stays under 6 MB (currently ~5.3 MB).
    expect(total).toBeLessThan(6_000_000);
    // Every company-mapped file exists in the bundle.
    const mapped = new Set(Object.values(COMPANY_SECTOR_COMMODITY));
    for (const commodity of mapped) {
      const slug = commodity.replaceAll("_", "-");
      expect(
        existsSync(join(dir, `commodity-${slug}.webp`)),
        `commodity-${slug}.webp exists in the offline bundle`,
      ).toBe(true);
    }
    expect(existsSync(join(dir, MARKETS_LIST_HERO_IMAGE.replace("/static/heroes/", "")))).toBe(true);
  });
});
