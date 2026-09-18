/**
 * Cabinet-office hero imagery (#378, slice of #143).
 *
 * Rendered contract for wiring the existing country-appropriate executive
 * hero into the cabinet-office destination: the 4 executive-house
 * `public/static/heroes/{white-house,downing-street,reichstag,zhongnanhai}.webp`
 * files byte-identical to AHDGame render through `RouteHero` (reference
 * image-error gradient fallback) keyed by the cabinet `countryId`, with the
 * `actions.webp` fallback for every other country. All cabinet
 * controls/data are preserved under the hero. No new image, no remote
 * fetch, no corporation/market model change.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CabinetOfficePanel } from "./CabinetOfficePanel";
import { executiveHero } from "./RouteHero";
import type { CabinetOfficeView } from "../game/cabinetOffice";

/** Native cabinet countries whose executive hero art ships offline in this slice. */
const BUNDLED: Record<string, string> = {
  US: "/static/heroes/white-house.webp",
  UK: "/static/heroes/downing-street.webp",
  DD: "/static/heroes/reichstag.webp",
  CN: "/static/heroes/zhongnanhai.webp",
};

function makeOffice(overrides: Partial<CabinetOfficeView> = {}): CabinetOfficeView {
  return {
    countryId: "US",
    countryName: "United States",
    turn: 0,
    isExecutive: false,
    regions: [{ id: "CA", name: "California" }],
    positions: [
      {
        id: "secretary_of_treasury",
        name: "Secretary of the Treasury",
        holderName: "Alex",
        isPlayerHolder: true,
        isVacant: false,
        actionsRemaining: 3,
        canIssue: true,
        orders: [
          {
            id: "emergency_fiscal_stimulus",
            name: "Emergency Fiscal Stimulus",
            description: "Spend to cut unemployment.",
            duration: 24,
            effects: [{ metric: "economic.unemploymentRate", modifier: -0.03, scope: "national" }],
            targetsRegion: false,
            alreadyActive: false,
            available: true,
          },
        ],
      },
    ],
    activeOrders: [],
    ...overrides,
  };
}

function renderPanel(office: CabinetOfficeView) {
  return render(<CabinetOfficePanel office={office} busy={false} notice={null} onIssue={vi.fn()} />);
}

describe("cabinet-office hero imagery", () => {
  it("maps exactly the 4 bundled executive-house countries to their offline files", () => {
    for (const [countryId, image] of Object.entries(BUNDLED)) {
      expect(executiveHero(countryId)).toBe(image);
    }
  });

  it("resolves every bundled country to local art, never a remote URL", () => {
    for (const countryId of Object.keys(BUNDLED)) {
      const src = executiveHero(countryId);
      expect(src).not.toMatch(/^https?:\/\//);
      expect(src.startsWith("/static/heroes/")).toBe(true);
    }
  });

  it("falls back to the Actions artwork for unsupported and unknown countries", () => {
    for (const countryId of ["JP", "DE", "IE", "XX-unknown", "", "us", " Uk"]) {
      expect(executiveHero(countryId)).toBe("/static/heroes/actions.webp");
    }
  });

  it("bundles decodable webp bytes for every mapped hero", () => {
    for (const image of Object.values(BUNDLED)) {
      const path = join(process.cwd(), "public", image.replace(/^\//, ""));
      expect(existsSync(path), `${path} exists in the offline bundle`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("renders a bundled cabinet hero from the local bundle only, with an accessible name", () => {
    renderPanel(makeOffice());
    const hero = screen.getByRole("img", { name: "United States cabinet office" });
    expect(hero.getAttribute("src")).toBe("/static/heroes/white-house.webp");
    expect(hero.getAttribute("src")).not.toMatch(/^https?:\/\//);
    expect(screen.getByRole("heading", { name: "Cabinet office" })).toBeInTheDocument();
  });

  it("renders no external image URL anywhere on the cabinet surface", () => {
    const { container } = renderPanel(makeOffice({ countryId: "UK", countryName: "United Kingdom" }));
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.getAttribute("src") ?? "").not.toMatch(/^https?:\/\//);
    }
    expect(screen.getByRole("img", { name: "United Kingdom cabinet office" })).toBeInTheDocument();
  });

  it("keeps the gradient and content when a cabinet hero image fails, matching the reference fallback", () => {
    renderPanel(makeOffice());
    const hero = screen.getByRole("img", { name: "United States cabinet office" });
    fireEvent.error(hero);
    expect(screen.queryByRole("img", { name: "United States cabinet office" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cabinet office" })).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cabinet office" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue ministerial order" })).toBeInTheDocument();
    expect(document.querySelector(".ahd-route-hero-shade")).not.toBeNull();
  });

  it("renders the Actions fallback with an accessible name for an unsupported country", () => {
    renderPanel(makeOffice({ countryId: "XX-unknown", countryName: "Nowhere" }));
    const hero = screen.getByRole("img", { name: "Nowhere cabinet office" });
    expect(hero.getAttribute("src")).toBe("/static/heroes/actions.webp");
    expect(screen.getByRole("heading", { name: "Cabinet office" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cabinet office" })).toBeInTheDocument();
  });

  it("preserves all cabinet controls and data under the hero", () => {
    renderPanel(makeOffice());
    expect(screen.getByRole("combobox", { name: "Cabinet office" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ministerial order" })).toBeInTheDocument();
    expect(screen.getByText(/Alex.*3 ministerial actions remaining/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue ministerial order" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active orders" })).toBeInTheDocument();
  });

  it("adapts the hero crop from phones to wider screens (320/390 use the compact crop)", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/@media\s*\(min-width:\s*700px\)/);
    expect(css).toMatch(/min-height:\s*220px/);
  });
});

describe("cabinet-office hero 320px/390px/desktop contract (#378)", () => {
  // jsdom performs no layout, so these cases assert the shipped shrink/wrap
  // styles on the issue controls and the shared crop breakpoints, matching
  // the banking hero convention.
  it("wraps the issue controls instead of clipping at 320px", () => {
    renderPanel(makeOffice());
    const issue = screen.getByRole("button", { name: "Issue ministerial order" });
    const controls = issue.closest("div") as HTMLElement;
    expect(controls.style.display).toBe("flex");
    expect(controls.style.flexWrap).toBe("wrap");
  });

  it("constrains the selects to the phone column at 390px", () => {
    renderPanel(makeOffice());
    const office = screen.getByRole("combobox", { name: "Cabinet office" });
    const field = office.closest("label") as HTMLElement;
    expect(field.style.maxWidth).toBe("24rem");
  });

  it("keeps the shared crop caps for short-landscape phones and desktop", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*500px\)/);
    expect(css).toMatch(/min-height:\s*120px/);
  });
});
