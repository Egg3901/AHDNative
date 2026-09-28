/**
 * ProfileIdentity: shared presentational Profile hero + identity row for SP and MP.
 *
 * Extracted from ProfilePanel's SP hero (reference AHDGame
 * src/app/profile/components/ProfileHeader.tsx: banner strip with overlap
 * identity row). The banner is a RouteHero using the bundled offline
 * politicians asset (#371) with a saved custom header winning when present;
 * media failure falls back to the RouteHero gradient with identity intact.
 * The identity row carries the portrait-or-initials, name, party and office
 * chips, and the home/country places row with the era-aware CountryFlag
 * supplied by the caller.
 *
 * Mode contract: every row is data-driven and links render only when the
 * caller supplies onSelect. SP passes full ProfileView links (party, office
 * destination, home region, country) plus the "Independent" / "No office" /
 * "Home region not recorded" fallback texts. MP currently projects only
 * name, party string, home string and country string (MpCharacterView), so
 * it passes those with no avatar, no office, no fallback texts and no
 * onSelect handlers it cannot back: nothing renders for unknown offices,
 * avatars or destinations. Extra mode-specific links go in children, which
 * render at the end of the places row.
 *
 * Existing class names and accessible names are preserved so SP
 * player-flow tests and CSS apply unchanged.
 */
import type { ReactNode } from "react";
import { RouteHero } from "./RouteHero";

export interface ProfileIdentityParty {
  name: string;
  color?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface ProfileIdentityLink {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
}

export interface ProfileIdentityProps {
  name: string;
  heroImage: string;
  heroAlt: string;
  eyebrow?: string;
  avatarUrl?: string | null;
  party?: ProfileIdentityParty | null;
  /** Static chip text when party is absent (SP: "Independent"; MP omits it). */
  partyFallbackText?: string;
  office?: ProfileIdentityLink | null;
  /** Static chip text when office is absent (SP: "No office"; MP omits it). */
  officeFallbackText?: string;
  home?: ProfileIdentityLink | null;
  /** Muted hint when home is absent (SP: "Home region not recorded"; MP omits it). */
  homeFallbackText?: string;
  /** Country is always known; renders as a button only with onSelect. */
  country: ProfileIdentityLink;
  /** Era-aware country mark (SP: CountryFlag; MP omits until it has ids/era). */
  flag?: ReactNode;
  /** Mode-specific extra links, rendered at the end of the places row. */
  children?: ReactNode;
}

export function profileInitials(name: string): string {
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : "?";
}

export function ProfileIdentity({
  name,
  heroImage,
  heroAlt,
  eyebrow,
  avatarUrl,
  party,
  partyFallbackText,
  office,
  officeFallbackText,
  home,
  homeFallbackText,
  country,
  flag,
  children,
}: ProfileIdentityProps) {
  const hasPlaceBeforeCountry = home != null || homeFallbackText != null;
  return (
    <>
      <RouteHero
        image={heroImage}
        alt={heroAlt}
        eyebrow={eyebrow}
        title={name}
        className="ahd-profile-hero"
      />
      <div className="ahd-profile-hero-id">
        <div className="ahd-profile-photo">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={`${name} profile picture`}
              className="ahd-profile-photoimg"
            />
          ) : (
            <span aria-hidden="true" className="ahd-profile-initials">
              {profileInitials(name)}
            </span>
          )}
        </div>
        <div className="ahd-profile-idtext">
          <div className="ahd-profile-chips">
            {party ? (
              party.onSelect ? (
                <button
                  type="button"
                  className="ahd-profile-chip"
                  style={party.color ? { borderColor: party.color, color: party.color } : undefined}
                  onClick={party.onSelect}
                  disabled={party.disabled}
                >
                  {party.name}
                </button>
              ) : (
                <span className="ahd-profile-chip ahd-profile-chip-static">
                  {party.name}
                </span>
              )
            ) : (
              partyFallbackText ? (
                <span className="ahd-profile-chip ahd-profile-chip-static">{partyFallbackText}</span>
              ) : null
            )}
            {office ? (
              office.onSelect ? (
                <button
                  type="button"
                  className="ahd-profile-chip"
                  onClick={office.onSelect}
                  disabled={office.disabled}
                >
                  {office.label}
                </button>
              ) : (
                <span className="ahd-profile-chip ahd-profile-chip-static">
                  {office.label}
                </span>
              )
            ) : (
              officeFallbackText ? (
                <span className="ahd-profile-chip ahd-profile-chip-static">
                  {officeFallbackText}
                </span>
              ) : null
            )}
          </div>
          <div className="ahd-profile-places">
            {home ? (
              home.onSelect ? (
                <button
                  type="button"
                  className="ahd-profile-link"
                  onClick={home.onSelect}
                  disabled={home.disabled}
                >
                  {home.label}
                </button>
              ) : (
                <span>{home.label}</span>
              )
            ) : (
              homeFallbackText ? (
                <span className="ahd-muted">{homeFallbackText}</span>
              ) : null
            )}
            {hasPlaceBeforeCountry ? (
              <span aria-hidden="true" className="ahd-muted"> · </span>
            ) : null}
            {flag}
            {country.onSelect ? (
              <button
                type="button"
                className="ahd-profile-link"
                onClick={country.onSelect}
                disabled={country.disabled}
              >
                {country.label}
              </button>
            ) : (
              <span>{country.label}</span>
            )}
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
