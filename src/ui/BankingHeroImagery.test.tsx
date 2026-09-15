/**
 * Banking hero imagery (#386, slice of #143, stacked on the #378 pipeline).
 *
 * Rendered contract for the offline banking hero set: the 3 central-bank
 * `public/static/heroes/{federal-reserve,bank-of-england,bank-of-japan}.webp`
 * files byte-identical to AHDGame render through `RouteHero` (reference
 * image-error gradient fallback) keyed by Native country id, with the
 * `actions.webp` fallback for every other country. Deposit/withdraw
 * mechanics and validation are preserved under the hero. No remote fetch,
 * upload pipeline, or logo route is involved.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  BANKING_HERO_ALT,
  BANKING_HERO_FALLBACK_ALT,
  BANKING_HERO_IMAGE,
  RouteHero,
  bankingHero,
  bankingHeroAlt,
} from "./RouteHero";
import { FinancePanel } from "./FinancePanel";
import type { FinanceView } from "../game/types";

/** Native country ids whose central-bank hero art ships offline in this slice. */
const BUNDLED = ["US", "UK", "JP"];

function heroPath(countryId: string): string {
  return join(process.cwd(), "public", BANKING_HERO_IMAGE[countryId].replace(/^\//, ""));
}

function makeFinance(overrides: Partial<FinanceView> = {}): FinanceView {
  return {
    cash: 1000,
    savings: 500,
    currency: "USD",
    savingsHolder: "Central Bank",
    holdings: [],
    deposit: { id: "depositSavings", name: "Deposit", description: "Move cash to savings.", cost: 0, available: true },
    withdraw: { id: "withdrawSavings", name: "Withdraw", description: "Move savings to cash.", cost: 0, available: true },
    ...overrides,
  };
}

describe("banking hero imagery", () => {
  it("maps exactly the 3 bundled central-bank countries to their offline files", () => {
    expect(Object.keys(BANKING_HERO_IMAGE).sort()).toEqual([...BUNDLED].sort());
    expect(BANKING_HERO_IMAGE["US"]).toBe("/static/heroes/federal-reserve.webp");
    expect(BANKING_HERO_IMAGE["UK"]).toBe("/static/heroes/bank-of-england.webp");
    expect(BANKING_HERO_IMAGE["JP"]).toBe("/static/heroes/bank-of-japan.webp");
    for (const countryId of BUNDLED) {
      expect(BANKING_HERO_ALT[countryId]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("resolves every bundled country to local art, never a remote URL", () => {
    for (const countryId of BUNDLED) {
      const src = bankingHero(countryId);
      expect(src).toBe(BANKING_HERO_IMAGE[countryId]);
      expect(src).not.toMatch(/^https?:\/\//);
    }
  });

  it("falls back to the Actions artwork for unbundeled and unknown countries", () => {
    for (const countryId of ["DD", "CN", "DE", "IE", "XX-unknown", "", "us", " Uk"]) {
      expect(bankingHero(countryId)).toBe("/static/heroes/actions.webp");
    }
  });

  it("bundles decodable webp bytes for every mapped hero", () => {
    for (const countryId of BUNDLED) {
      const path = heroPath(countryId);
      expect(existsSync(path), `${path} exists in the offline bundle`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("renders a bundled banking hero from the local bundle only", () => {
    render(
      <RouteHero
        image={bankingHero("US")}
        alt={bankingHeroAlt("US")}
        eyebrow="Banking"
        title="Banking"
      />,
    );
    const hero = screen.getByRole("img", { name: bankingHeroAlt("US") });
    expect(hero.getAttribute("src")).toBe("/static/heroes/federal-reserve.webp");
    expect(hero.getAttribute("src")).not.toMatch(/^https?:\/\//);
    expect(screen.getByRole("heading", { name: "Banking" })).toBeInTheDocument();
  });

  it("keeps the gradient and content when a banking hero image fails, matching the reference fallback", () => {
    render(
      <RouteHero
        image={bankingHero("UK")}
        alt={bankingHeroAlt("UK")}
        eyebrow="Banking"
        title="Banking"
      >
        <span>balances</span>
      </RouteHero>,
    );
    const hero = screen.getByRole("img", { name: bankingHeroAlt("UK") });
    fireEvent.error(hero);
    expect(screen.queryByRole("img", { name: bankingHeroAlt("UK") })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Banking" })).toBeInTheDocument();
    expect(screen.getByText("balances")).toBeInTheDocument();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
  });

  it("uses truthful alts grounded in the bundled bytes and the reference hero config", () => {
    // Reference `centralBank.heroAlt` (AHDGame `src/lib/constants/countries.ts`)
    // matches the inspected local WebP: the Eccles facade with the FEDERAL
    // RESERVE inscription, and the Threadneedle Street building. JP carries no
    // reference alt, so the alt follows the upstream file identity
    // (File:Bank of Japan 2010.jpg, "Bank of Japan, Chuo-ku Tokyo Japan"):
    // the historic stone head office, not the modern towers behind it.
    expect(BANKING_HERO_ALT["US"]).toBe("Marriner S. Eccles Federal Reserve Board Building, Washington D.C.");
    expect(BANKING_HERO_ALT["UK"]).toBe("Bank of England, Threadneedle Street, London");
    expect(BANKING_HERO_ALT["JP"]).toBe("Bank of Japan head office, Tokyo");
  });

  it("resolves alt text totally with a nonempty fallback and exact-key matching", () => {
    expect(BANKING_HERO_FALLBACK_ALT.length).toBeGreaterThan(0);
    for (const countryId of BUNDLED) {
      expect(bankingHeroAlt(countryId)).toBe(BANKING_HERO_ALT[countryId]);
      expect(bankingHeroAlt(countryId).length).toBeGreaterThan(0);
    }
    for (const countryId of ["DD", "CN", "XX-unknown", ""]) {
      expect(bankingHeroAlt(countryId)).toBe(BANKING_HERO_FALLBACK_ALT);
    }
    expect(bankingHeroAlt("us")).toBe(BANKING_HERO_FALLBACK_ALT);
    expect(bankingHeroAlt(" Uk")).toBe(BANKING_HERO_FALLBACK_ALT);
  });

  it("renders the fallback accessible name for an unbundled country", () => {
    render(
      <RouteHero
        image={bankingHero("DD")}
        alt={bankingHeroAlt("DD")}
        eyebrow="Banking"
        title="Banking"
      />,
    );
    const hero = screen.getByRole("img", { name: BANKING_HERO_FALLBACK_ALT });
    expect(hero.getAttribute("src")).toBe("/static/heroes/actions.webp");
  });

  it("renders the banking hero with balances and transfer context on the Banking surface", () => {
    const onAction = vi.fn();
    render(<FinancePanel finance={makeFinance()} section="banking" countryId="US" busy={false} onAction={onAction} />);
    expect(screen.getByRole("img", { name: BANKING_HERO_ALT["US"] })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Banking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deposit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeInTheDocument();
  });

  it("preserves deposit/withdraw mechanics and validation under the hero", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <FinancePanel
        finance={makeFinance({ cash: 1000, savings: 500 })}
        section="banking"
        countryId="JP"
        busy={false}
        onAction={onAction}
      />,
    );
    expect(screen.getByRole("img", { name: BANKING_HERO_ALT["JP"] })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /deposit/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/positive amount/i);
    expect(onAction).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Amount"), "200");
    await user.click(screen.getByRole("button", { name: /deposit/i }));
    expect(onAction).toHaveBeenCalledWith("depositSavings", { amount: 200 });
    await user.click(screen.getByRole("button", { name: /withdraw/i }));
    expect(onAction).toHaveBeenCalledWith("withdrawSavings", { amount: 200 });
  });

  it("adapts the hero crop from phones to wider screens (320/390 use the compact crop)", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)/);
    expect(css).toMatch(/min-height:\s*220px/);
  });
});
