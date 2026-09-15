import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PartyMark, partyInitials, partyMarkTextColor, partyMarkColor, partyMarkKey, normalizeMarkIdSegment } from "./PartyMark";

describe("partyInitials", () => {
  it("uses a recorded abbreviation before deriving letters from the name", () => {
    expect(partyInitials("Democratic Party", "DEM")).toBe("DEM");
    expect(partyInitials("Labour Party", "lab")).toBe("LAB");
    expect(partyInitials("Democratic Party", null)).toBe("DP");
    expect(partyInitials("Labour", "")).toBe("LA");
    expect(partyInitials("   ", "")).toBe("?");
  });
});

describe("partyMarkTextColor", () => {
  it("picks a readable foreground for the deterministic party color", () => {
    expect(partyMarkTextColor("#ffffff")).toBe("#14141c");
    expect(partyMarkTextColor("#3333ff")).toBe("#ffffff");
    expect(partyMarkTextColor("not-a-color")).toBe("#ffffff");
  });
});

describe("PartyMark", () => {
  it("renders a party-authored image when a real URL exists", () => {
    render(
      <PartyMark name="Labour Party" abbreviation="LAB" color="#dc2626" logoUrl="/party-logos/gb-lab-1.png" label="Labour Party" />,
    );
    const mark = screen.getByRole("img", { name: "Labour Party" });
    const img = mark.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/party-logos/gb-lab-1.png");
  });

  it("falls back to initials when the authored image fails to load", () => {
    const { container } = render(
      <PartyMark name="Labour Party" abbreviation="LAB" color="#dc2626" logoUrl="/party-logos/gb-lab-1.png" label="Labour Party" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".ahd-mark-initials")?.textContent).toBe("LAB");
  });

  it("retries a new logo URL after a previous URL failed", () => {
    const { container, rerender } = render(
      <PartyMark name="Labour Party" abbreviation="LAB" color="#dc2626" logoUrl="/party-logos/gb-lab-1.png" label="Labour Party" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    rerender(
      <PartyMark name="Labour Party" abbreviation="LAB" color="#dc2626" logoUrl="/party-logos/gb-lab-2.png" label="Labour Party" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/party-logos/gb-lab-2.png");
  });

  it("renders an initials mark in the party color when the DTO carries no URL", () => {
    render(<PartyMark name="Democratic Party" abbreviation="DEM" color="#3333ff" label="Democratic Party" />);
    const mark = screen.getByRole("img", { name: "Democratic Party" });
    expect(mark).toHaveAttribute("data-party-mark", "DEM");
    expect(mark.querySelector("img")).toBeNull();
    expect(mark.querySelector(".ahd-mark-initials")?.textContent).toBe("DEM");
    expect(mark).toHaveStyle({ backgroundColor: "#3333ff" });
  });

  it("shades the fallback tile as a gradient from the party color", () => {
    const { container } = render(<PartyMark name="Democratic Party" abbreviation="DEM" color="#3333ff" />);
    const mark = container.querySelector(".ahd-mark") as HTMLElement;
    expect(mark.style.backgroundImage).toContain("linear-gradient");
    expect(mark.style.backgroundImage).toContain("#3333ff");
    expect(mark.style.backgroundColor).toBe("rgb(51, 51, 255)");
  });

  it("loads an authored image lazily without leaking a referrer", () => {
    const { container } = render(
      <PartyMark name="Labour Party" abbreviation="LAB" color="#dc2626" logoUrl="/party-logos/gb-lab-1.png" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("stays decorative when no accessible label is supplied", () => {
    const { container } = render(<PartyMark name="Independent" abbreviation="" color="#8f8f9d" />);
    const mark = container.querySelector(".ahd-mark") as HTMLElement;
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).not.toHaveAttribute("role");
  });

  it("derives a stable fallback color and initials from the party id when the DTO has none", () => {
    expect(partyMarkColor("US_DEM")).toBe(partyMarkColor("US_DEM"));
    const { container } = render(<PartyMark name="Democratic Party" id="US_DEM" />);
    const mark = container.querySelector(".ahd-mark") as HTMLElement;
    expect(mark).toHaveStyle({ backgroundColor: partyMarkColor("US_DEM") });
    expect(mark).toHaveAttribute("data-party-mark", "DP");
  });
});

describe("partyMarkKey (country/party-id lookup)", () => {
  it("scopes the fallback key by lowercase country with storage-prefix parity", () => {
    expect(partyMarkKey("US", "US_DEM")).toBe("us-US_DEM");
    expect(partyMarkKey("GB", "lab")).toBe("gb-lab");
    expect(partyMarkKey(null, "US_DEM")).toBe("US_DEM");
    expect(partyMarkKey("US", null)).toBeNull();
    expect(partyMarkKey("US", "  ")).toBeNull();
  });

  it("canonicalizes padded sequential ids so 01 and 1 share a key", () => {
    expect(normalizeMarkIdSegment("01")).toBe("1");
    expect(partyMarkKey("US", "01")).toBe("us-1");
    expect(partyMarkKey("US", "1")).toBe("us-1");
  });

  it("seeds the deterministic fallback from the scoped key when a country is passed", () => {
    const { container } = render(<PartyMark name="Democratic Party" id="US_DEM" countryId="US" />);
    const mark = container.querySelector(".ahd-mark") as HTMLElement;
    expect(mark).toHaveStyle({ backgroundColor: partyMarkColor("us-US_DEM") });
  });

  it("never constructs a fetch URL from the ids: no image without an explicit logoUrl", () => {
    const { container } = render(<PartyMark name="Democratic Party" id="US_DEM" countryId="US" label="Democratic Party" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".ahd-mark-initials")?.textContent).toBe("DP");
  });

  it("honors a fixed caller size so roster rows cannot overflow at 320px or 390px", () => {
    const { container } = render(<PartyMark name="Democratic Party" id="US_DEM" countryId="US" size={20} />);
    const mark = container.querySelector(".ahd-mark") as HTMLElement;
    expect(mark).toHaveStyle({ width: "20px", height: "20px" });
  });
});
