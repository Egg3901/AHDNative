import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PartyMark, partyInitials, partyMarkTextColor, partyMarkColor } from "./PartyMark";

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

  it("renders an initials mark in the party color when the DTO carries no URL", () => {
    render(<PartyMark name="Democratic Party" abbreviation="DEM" color="#3333ff" label="Democratic Party" />);
    const mark = screen.getByRole("img", { name: "Democratic Party" });
    expect(mark).toHaveAttribute("data-party-mark", "DEM");
    expect(mark.querySelector("img")).toBeNull();
    expect(mark.querySelector(".ahd-mark-initials")?.textContent).toBe("DEM");
    expect(mark).toHaveStyle({ background: "#3333ff" });
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
    expect(mark).toHaveStyle({ background: partyMarkColor("US_DEM") });
    expect(mark).toHaveAttribute("data-party-mark", "DP");
  });
});
