import { useState, type ReactNode } from "react";

export function RouteHero({ image, alt, eyebrow, title, children, className = "" }: {
  image: string;
  alt: string;
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <header className={`ahd-route-hero ${className}`.trim()}>
      {!failed ? <img src={image} alt={alt} className="ahd-route-hero-image" onError={() => setFailed(true)} /> : null}
      <div className="ahd-route-hero-shade" aria-hidden="true" />
      <div className="ahd-route-hero-content">
        {eyebrow ? <p className="ahd-eyebrow">{eyebrow}</p> : null}
        <h1 className="ahd-h1">{title}</h1>
        {children}
      </div>
    </header>
  );
}

/**
 * Bundled offline route art for the Profile hero (issue #371): the same
 * `politicians.webp` character creation uses, byte-identical to AHDGame
 * (SHA-256 `bb3078558687f426d939f74672e339033147e241b21495b269b59cc12acb7a00`).
 */
export const PROFILE_HERO_IMAGE = "/static/heroes/politicians.webp";

/**
 * Profile hero source: a saved custom header wins, otherwise the bundled
 * politicians asset. Never a remote URL — the header is a local data URL and
 * the fallback is bundled offline.
 */
export function profileHeroImage(profileHeaderUrl: string | null): string {
  return profileHeaderUrl ?? PROFILE_HERO_IMAGE;
}

export function nationOverviewHero(countryId: string): string {
  if (countryId === "US") return "/static/heroes/us-overview-mount-rushmore.webp";
  return "/static/heroes/actions.webp";
}

/**
 * Elections hub band (#377). Reuses the already-bundled `politicians.webp`
 * chamber art (byte-identical to AHDGame, SHA-256 `bb3078558687f426d939f...`,
 * see docs/UI-REFERENCE.md) instead of the reference `ElectionsHero` remote
 * Wikimedia voting photo, which must never be copied or hotlinked. The
 * reference image-error gradient fallback in `RouteHero` still applies.
 */
export function electionsHero(): string {
  return "/static/heroes/politicians.webp";
}

export function executiveHero(countryId: string): string {
  if (countryId === "US") return "/static/heroes/white-house.webp";
  if (countryId === "UK") return "/static/heroes/downing-street.webp";
  if (countryId === "DD") return "/static/heroes/reichstag.webp";
  if (countryId === "CN") return "/static/heroes/zhongnanhai.webp";
  return "/static/heroes/actions.webp";
}

/**
 * Offline commodity hero art (#378, slice of #143).
 *
 * The reference maps all 28 commodity types to hero slugs
 * (`COMMODITY_HERO_SLUGS` in AHDGame `src/lib/constants/commodities.ts`,
 * served remotely through `/api/images/hero/[slug]`). Only the 14 entries
 * below ship in the Native offline bundle, byte-identical to AHDGame
 * `public/static/heroes/` at rev `e364c04` (SHA-256 provenance in
 * `docs/UI-REFERENCE.md`). The remaining 14 reference types (fertilizers,
 * construction_services, healthcare_services, real_estate_services, iron,
 * coal, oil, rare_earth, timber, natural_gas, ordnance, plastics,
 * network_services, entertainment_services) have no local file, mirroring
 * the reference `SECTOR_TYPE_HERO` partial record: unported and unknown keys
 * fall back to the Actions artwork, never a broken image or a remote fetch.
 */
export const COMMODITY_HERO_IMAGE: Record<string, string> = {
  steel: "/static/heroes/commodity-steel.webp",
  electronics: "/static/heroes/commodity-electronics.webp",
  energy: "/static/heroes/commodity-energy.webp",
  chemicals: "/static/heroes/commodity-chemicals.webp",
  pharmaceuticals: "/static/heroes/commodity-pharmaceuticals.webp",
  food: "/static/heroes/commodity-food.webp",
  building_materials: "/static/heroes/commodity-building-materials.webp",
  software: "/static/heroes/commodity-software.webp",
  financial_services: "/static/heroes/commodity-financial-services.webp",
  advertising: "/static/heroes/commodity-advertising.webp",
  vehicles: "/static/heroes/commodity-vehicles.webp",
  retail: "/static/heroes/commodity-retail.webp",
  freight: "/static/heroes/commodity-freight.webp",
  consulting_services: "/static/heroes/commodity-consulting-services.webp",
};

/** Reference alt text (`COMMODITY_HERO_ALTS`) for the bundled commodity heroes. */
export const COMMODITY_HERO_ALT: Record<string, string> = {
  steel: "Showa Steel Works industrial facility",
  electronics: "TSMC semiconductor fabrication plant",
  energy: "High-voltage power lines at sunset",
  chemicals: "BASF chemical plant in Ludwigshafen",
  pharmaceuticals: "Pharmaceutical manufacturing line with packaged medicines",
  food: "Combine harvester gathering wheat",
  building_materials: "Construction site with building materials",
  software: "Wikimedia Foundation server room",
  financial_services: "New York Stock Exchange building on Wall Street",
  advertising: "Broadway and Times Square lit up at night",
  vehicles: "Hyundai car assembly line",
  retail: "Macy's department store at Herald Square",
  freight: "Sovereign Maersk container ship at sea",
  consulting_services: "Booz Allen Hamilton office in Washington D.C.",
};

export function commodityHero(commodity: string): string {
  return COMMODITY_HERO_IMAGE[commodity] ?? "/static/heroes/actions.webp";
}
