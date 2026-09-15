import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoalitionMark, coalitionMarkKey } from "./CoalitionMark";
import { partyMarkColor } from "./PartyMark";

describe("coalitionMarkKey", () => {
  it("scopes the fallback key by lowercase country and canonical numeric id", () => {
    expect(coalitionMarkKey("US", "12")).toBe("us-12");
    expect(coalitionMarkKey("US", "012")).toBe("us-12");
    expect(coalitionMarkKey("GB", "lab")).toBe("gb-lab");
    expect(coalitionMarkKey(null, "lab")).toBe("lab");
    expect(coalitionMarkKey("US", null)).toBeNull();
    expect(coalitionMarkKey("US", "  ")).toBeNull();
  });
});

describe("CoalitionMark", () => {
  it("renders an authored image only when both id and logo URL are present", () => {
    render(
      <CoalitionMark name="Unity Bloc" abbreviation="UB" coalitionId="us-unity" countryId="US" color="#6366f1" logoUrl="/coalition-logos/us-unity-1.png" label="Unity Bloc" />,
    );
    const mark = screen.getByRole("img", { name: "Unity Bloc" });
    expect(mark.querySelector("img")).toHaveAttribute("src", "/coalition-logos/us-unity-1.png");
  });

  it("never attempts an image without an explicit logo URL (offline: no route lookup)", () => {
    const { container } = render(
      <CoalitionMark name="Unity Bloc" abbreviation="UB" coalitionId="us-unity" countryId="US" color="#6366f1" label="Unity Bloc" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".ahd-mark-initials")?.textContent).toBe("UB");
  });

  it("never attempts an image without a coalition id even when a URL is passed", () => {
    const { container } = render(
      <CoalitionMark name="Unity Bloc" abbreviation="UB" color="#6366f1" logoUrl="/coalition-logos/us-unity-1.png" label="Unity Bloc" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".ahd-mark-initials")?.textContent).toBe("UB");
  });

  it("falls back to initials when the authored image fails to load", () => {
    const { container } = render(
      <CoalitionMark name="Unity Bloc" abbreviation="UB" coalitionId="us-unity" countryId="US" color="#6366f1" logoUrl="/coalition-logos/us-unity-1.png" label="Unity Bloc" />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".ahd-mark-initials")?.textContent).toBe("UB");
  });

  it("derives a stable country-scoped fallback color when the DTO has none", () => {
    const { container } = render(<CoalitionMark name="Unity Bloc" coalitionId="7" countryId="US" />);
    const mark = container.querySelector(".ahd-mark-coalition") as HTMLElement;
    expect(mark).toHaveStyle({ background: partyMarkColor("us-7") });
    expect(mark).toHaveAttribute("data-coalition-mark", "UB");
  });

  it("honors a fixed caller size so rows cannot overflow at 320px or 390px", () => {
    const { container } = render(<CoalitionMark name="Unity Bloc" abbreviation="UB" coalitionId="us-unity" size={20} />);
    const mark = container.querySelector(".ahd-mark-coalition") as HTMLElement;
    expect(mark).toHaveStyle({ width: "20px", height: "20px" });
  });

  it("stays decorative when no accessible label is supplied", () => {
    const { container } = render(<CoalitionMark name="Unity Bloc" abbreviation="UB" coalitionId="us-unity" />);
    const mark = container.querySelector(".ahd-mark-coalition") as HTMLElement;
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).not.toHaveAttribute("role");
  });
});
