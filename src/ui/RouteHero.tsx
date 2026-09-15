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

export function executiveHero(countryId: string): string {
  if (countryId === "US") return "/static/heroes/white-house.webp";
  if (countryId === "UK") return "/static/heroes/downing-street.webp";
  if (countryId === "DD") return "/static/heroes/reichstag.webp";
  if (countryId === "CN") return "/static/heroes/zhongnanhai.webp";
  return "/static/heroes/actions.webp";
}
