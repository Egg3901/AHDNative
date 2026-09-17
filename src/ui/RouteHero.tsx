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
 * Offline banking hero art (#386, slice of #143).
 *
 * The reference keys central-bank photo heroes by country
 * (`centralBank.heroImage` in AHDGame `src/lib/constants/countries.ts`,
 * served remotely through `/api/images/hero/[slug]`): US drives
 * `federal-reserve`, GB (plus SCO/WAL, which share the record) drives
 * `bank-of-england`, JP drives `bank-of-japan`. Native country ids use UK
 * for Britain, so the Native mapping is US/UK/JP; only these three slugs
 * have a local file upstream, byte-identical to AHDGame
 * `public/static/heroes/` at rev `e364c04` (SHA-256 provenance in
 * `docs/UI-REFERENCE.md`). Every other Native country (DD, CN, DE, IE and
 * the rest, including the ECB-shared ones with no local file) falls back
 * to the Actions artwork, never a broken image or a remote fetch. The
 * reference BankingHub hero itself (`BankingHero` in
 * `src/app/banking/BankingHubClient.tsx`) is an icon/gradient composition,
 * not a photo, so the photo surface follows the central-bank detail
 * pattern (`InstitutionMasthead` in
 * `src/components/national/InstitutionMasthead.tsx`) instead.
 */
export const BANKING_HERO_IMAGE: Record<string, string> = {
  US: "/static/heroes/federal-reserve.webp",
  UK: "/static/heroes/bank-of-england.webp",
  JP: "/static/heroes/bank-of-japan.webp",
};

/**
 * Alt text for the bundled banking heroes.
 *
 * US/UK repeat the reference `centralBank.heroAlt` verbatim. JP carries
 * no reference alt, so the alt follows the upstream file identity
 * recorded in the hero-route manifest (File:Bank of Japan 2010.jpg,
 * "Bank of Japan, Chuo-ku Tokyo Japan"): the head office building, not
 * the surrounding towers.
 */
export const BANKING_HERO_ALT: Record<string, string> = {
  US: "Marriner S. Eccles Federal Reserve Board Building, Washington D.C.",
  UK: "Bank of England, Threadneedle Street, London",
  JP: "Bank of Japan head office, Tokyo",
};

export function bankingHero(countryId: string): string {
  return BANKING_HERO_IMAGE[countryId] ?? "/static/heroes/actions.webp";
}

/** Nonempty accessible-name fallback for countries with no bundled bank art. */
export const BANKING_HERO_FALLBACK_ALT = "Banking hero image";

/**
 * Total alt-text resolver: exact-key lookup, no case folding or trimming,
 * so `"us"`, `" Uk"` and `""` all take the fallback. Total over
 * strings — never undefined, never empty.
 */
export function bankingHeroAlt(countryId: string): string {
  return BANKING_HERO_ALT[countryId] ?? BANKING_HERO_FALLBACK_ALT;
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

/**
 * Alt text for the bundled commodity heroes.
 *
 * Source: reference `COMMODITY_HERO_ALTS` (AHDGame
 * `src/lib/constants/commodities.ts`) except where the reference wording
 * contradicts the bundled bytes. Three entries are corrected against the
 * inspected local WebP plus the upstream file identity recorded in the hero
 * route (`src/app/api/images/hero/[slug]/route.ts`): `energy` shows the
 * Anacortes oil refinery (distillation towers, steam plume, waterfront;
 * not power lines), `freight` shows a hull marked MAERSK SEALAND (no
 * "Sovereign" vessel name appears in the file or the route manifest), and
 * `pharmaceuticals` shows blister packs of pills (File:Pill 3.jpg; no
 * manufacturing line).
 */
export const COMMODITY_HERO_ALT: Record<string, string> = {
  steel: "Showa Steel Works industrial facility",
  electronics: "TSMC semiconductor fabrication plant",
  energy: "Anacortes oil refinery",
  chemicals: "BASF chemical plant in Ludwigshafen",
  pharmaceuticals: "Blister packs of assorted pills",
  food: "Combine harvester gathering wheat",
  building_materials: "Construction site with building materials",
  software: "Wikimedia Foundation server room",
  financial_services: "New York Stock Exchange building on Wall Street",
  advertising: "Broadway and Times Square lit up at night",
  vehicles: "Hyundai car assembly line",
  retail: "Macy's department store at Herald Square",
  freight: "Maersk Sealand container ship at sea",
  consulting_services: "Booz Allen Hamilton office in Washington D.C.",
};

export function commodityHero(commodity: string): string {
  return COMMODITY_HERO_IMAGE[commodity] ?? "/static/heroes/actions.webp";
}

/** Nonempty accessible-name fallback for commodity keys with no bundled art. */
export const COMMODITY_HERO_FALLBACK_ALT = "Commodity hero image";

/**
 * Total alt-text resolver: exact-key lookup, no case folding or trimming,
 * so `"STEEL"`, `" steel"` and `""` all take the fallback. Total over
 * strings — never undefined, never empty.
 */
export function commodityHeroAlt(commodity: string): string {
  return COMMODITY_HERO_ALT[commodity] ?? COMMODITY_HERO_FALLBACK_ALT;
}

/**
 * Offline company hero art (#378, slice of #143).
 *
 * Native company listings carry engine corporation sector types
 * (`CORPORATION_TYPES` in `packages/engine/src/corporation/types.ts`: 17
 * values), while the bundled offline set is keyed by reference commodity
 * types. Only `energy` and `retail` collide, so keying the company detail
 * hero directly through `commodityHero()` left 15 of 17 reachable sectors
 * on the generic Actions fallback. This layer maps each corporation sector
 * to the already-bundled commodity file whose bytes depict that industry;
 * no new binary asset, no remote fetch, no rights question. Four sectors
 * have no bundled depiction (defense, extraction, real_estate,
 * telecommunications) and keep the Actions fallback: the upstream
 * `sector-*.webp` files exist in AHDGame `public/static/heroes/` but carry
 * no upstream rights-manifest entry and would add ~2.5 MB, so they stay
 * unported (recorded in `docs/UI-REFERENCE.md`).
 */
export const COMPANY_SECTOR_COMMODITY: Record<string, string> = {
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

/** Nonempty accessible-name fallback for company sectors with no bundled art. */
export const COMPANY_HERO_FALLBACK_ALT = "Company hero image";

/**
 * Company hero image for an engine corporation sector type. Exact-key
 * lookup into the alias map, then through the commodity resolver (which
 * itself falls back to the bundled Actions artwork): unmapped, unported
 * and unknown keys render Actions art, never a broken image or a remote
 * fetch.
 */
export function companyHero(sectorType: string): string {
  return commodityHero(COMPANY_SECTOR_COMMODITY[sectorType] ?? sectorType);
}

/**
 * Total alt-text resolver for the company hero: the aliased commodity alt
 * describes the same bundled bytes, so it is reused verbatim. Total over
 * strings — never undefined, never empty; exact-key, no case folding or
 * trimming.
 */
export function companyHeroAlt(sectorType: string): string {
  const mapped = COMPANY_SECTOR_COMMODITY[sectorType] ?? sectorType;
  return COMMODITY_HERO_ALT[mapped] ?? COMPANY_HERO_FALLBACK_ALT;
}

/**
 * Stock-market list band (#378). The reference has no dedicated markets
 * hero file, so the list reuses the already-bundled NYSE financial-services
 * art (byte-identical to AHDGame, same SHA-256 provenance as the commodity
 * slice) instead of rendering with no hero band. Single source of truth so
 * the panel and its tests cannot drift.
 */
export const MARKETS_LIST_HERO_IMAGE = "/static/heroes/commodity-financial-services.webp";
