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
