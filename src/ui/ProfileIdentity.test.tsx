/**
 * ProfileIdentity shared seam: minimal authoritative MP props.
 *
 * MP currently projects only name, party string, home string and country
 * string (MpCharacterView: name/party/homeState/countryId). The seam must
 * render those honestly with no fabricated office, avatar or destination
 * link; Root mounts it in MpModeScreen. SP parity stays covered by
 * ProfileHero.test.tsx and ProfilePanel.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileIdentity } from "./ProfileIdentity";
import { PROFILE_HERO_IMAGE } from "./RouteHero";

const MP_MINIMAL = {
  name: "June Park",
  heroImage: PROFILE_HERO_IMAGE,
  heroAlt: "Politicians meeting in a national chamber",
  eyebrow: "United States",
  party: { name: "Labor Caucus" },
  home: { label: "New York" },
  country: { label: "United States" },
};

function heroHeader(): HTMLElement {
  const hero = document.querySelector(".ahd-profile-header .ahd-route-hero.ahd-profile-hero")
    ?? document.querySelector(".ahd-route-hero.ahd-profile-hero");
  if (!(hero instanceof HTMLElement)) throw new Error("profile route hero is not rendered");
  return hero;
}

describe("ProfileIdentity with minimal authoritative MP props", () => {
  it("renders name, party, home and country strings from the bundled hero", () => {
    render(
      <section aria-label="Character" className="ahd-card ahd-card-pad ahd-profile-header ahd-hero">
        <ProfileIdentity {...MP_MINIMAL} />
      </section>,
    );
    expect(screen.getByRole("heading", { name: "June Park" })).toBeInTheDocument();
    expect(screen.getByText("Labor Caucus")).toBeInTheDocument();
    expect(screen.getByText("New York")).toBeInTheDocument();
    expect(screen.getByText("United States", { selector: ".ahd-profile-places span" })).toBeInTheDocument();
    const hero = within(heroHeader()).getByRole("img", { name: "Politicians meeting in a national chamber" });
    expect(hero).toHaveAttribute("src", "/static/heroes/politicians.webp");
  });

  it("fabricates no office, avatar, flag or destination link", () => {
    render(<ProfileIdentity {...MP_MINIMAL} />);
    expect(screen.queryByText("No office")).not.toBeInTheDocument();
    expect(screen.queryByText("Independent")).not.toBeInTheDocument();
    expect(screen.queryByAltText("June Park profile picture")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Labor Caucus" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New York" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "United States" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-country-flag]")).toBeNull();
  });

  it("falls back to name initials with no avatar data", () => {
    render(<ProfileIdentity {...MP_MINIMAL} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("wires mode-specific links only when the caller supplies them", async () => {
    const user = userEvent.setup();
    const onSelectParty = vi.fn();
    const onSelectCountry = vi.fn();
    render(
      <ProfileIdentity
        {...MP_MINIMAL}
        party={{ name: "Labor Caucus", color: "#2563eb", onSelect: onSelectParty }}
        country={{ label: "United States", onSelect: onSelectCountry }}
      >
        <button type="button" className="ahd-profile-link" onClick={() => {}}>
          View standing
        </button>
      </ProfileIdentity>,
    );
    await user.click(screen.getByRole("button", { name: "Labor Caucus" }));
    expect(onSelectParty).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "United States" }));
    expect(onSelectCountry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "View standing" })).toBeInTheDocument();
  });

  it("renders the SP fallback texts when the caller passes them", () => {
    render(
      <ProfileIdentity
        name="Ada Crane"
        heroImage={PROFILE_HERO_IMAGE}
        heroAlt="Politicians meeting in a national chamber"
        eyebrow="United States"
        party={null}
        partyFallbackText="Independent"
        office={null}
        officeFallbackText="No office"
        home={null}
        homeFallbackText="Home region not recorded"
        country={{ label: "United States" }}
      />,
    );
    expect(screen.getByText("Independent")).toBeInTheDocument();
    expect(screen.getByText("No office")).toBeInTheDocument();
    expect(screen.getByText("Home region not recorded")).toBeInTheDocument();
  });
});
