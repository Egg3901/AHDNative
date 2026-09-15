import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartyManagementPanel } from "./PartyManagementPanel";
import type { PartyManagementView } from "../game/partyManagement";

function makeManagement(): PartyManagementView {
  return {
    countryId: "US", countryName: "United States", currency: "USD",
    playerPartyName: null, partyCount: 2, foundedCount: 0, charterDeadlineTurns: 14,
    founding: {
      actionCost: 8, fundCost: 100_000, fundsRequired: 100_000,
      funds: 152_000, actions: 9, cooldownRemaining: 0, charterDeadlineTurns: 14,
      available: true,
      effect: {
        partyFundsDelta: -100_000, partyMembership: "found", caucusMembership: "none",
        clearsCaucusMembership: true, startsPartySwitchCooldown: true,
      },
      consequences: [
        "Charges 100,000 campaign funds",
        "Creates the party and joins you to it immediately",
        "Ends any caucus membership you hold",
        "Starts the 24-turn party-switch cooldown",
      ],
      action: { id: "foundParty", name: "Found Party", description: "", cost: 8, available: true },
    },
    parties: [
      { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3333ff", logoUrl: null,
        members: 260, treasury: 1000000, isPlayerParty: false,
        economicPosition: -2, socialPosition: -1, tier: "major", founded: false },
    ],
    charters: [
      { id: "charter-x", partyName: "New Frontier", status: "ratified", expiresOnTurn: null },
    ],
  };
}

describe("PartyManagementPanel", () => {
  it("renders the founding form, cost and charter roster without raw ids", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { container } = render(<PartyManagementPanel management={makeManagement()} busy={false} onAction={onAction} />);
    expect(screen.getByText("Start a party")).toBeTruthy();
    expect(screen.queryByText("US_DEM")).toBeNull();
    expect(screen.queryByText("charter-x")).toBeNull();
    expect(screen.getByText("New Frontier")).toBeTruthy();
    expect(container.querySelector('.ahd-mark[data-party-mark="DEM"]')).not.toBeNull();
    await user.type(screen.getByLabelText("Party name"), "Second Wave");
    await user.type(screen.getByLabelText("Abbreviation"), "SWP");
    await user.click(screen.getByRole("button", { name: "Found party" }));
    expect(onAction).toHaveBeenCalledWith("foundParty", { foundPartyName: "Second Wave", foundPartyAbbr: "SWP" });
  });

  it("states the engine consequences of founding before confirmation", () => {
    render(<PartyManagementPanel management={makeManagement()} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/Charges 100,000 campaign funds/)).toBeTruthy();
    expect(screen.getByText(/Starts the 24-turn party-switch cooldown/)).toBeTruthy();
    expect(screen.getByText(/Creates the party and joins you to it immediately/)).toBeTruthy();
  });

  it("disables founding with the validation message when the name is invalid", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<PartyManagementPanel management={makeManagement()} busy={false} onAction={onAction} />);
    await user.type(screen.getByLabelText("Party name"), "X");
    await user.type(screen.getByLabelText("Abbreviation"), "SWP");
    expect(screen.getByText("Party name too short")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Found party" }).hasAttribute("disabled")).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("renders one offline identity mark per party with no constructed image URL", () => {
    const management = makeManagement();
    management.parties = [
      ...management.parties,
      { id: "US_GRN", name: "Green Union", abbreviation: "GRN", color: "#16a34a", logoUrl: null,
        members: 41, treasury: 9000, isPlayerParty: false,
        economicPosition: -1, socialPosition: -2, tier: "minor", founded: true },
    ];
    const { container } = render(<PartyManagementPanel management={management} busy={false} onAction={vi.fn()} />);
    const list = container.querySelector('ul[aria-label="Parties"]');
    expect(list?.querySelectorAll("li").length).toBe(2);
    // Authored packs carry no logoUrl, so the offline fallback renders and no
    // image URL is ever constructed from the country/party ids.
    expect(list?.querySelectorAll(".ahd-mark").length).toBe(2);
    expect(list?.querySelector("img")).toBeNull();
    expect(list?.querySelector('.ahd-mark[data-party-mark="DEM"]')).not.toBeNull();
    expect(list?.querySelector('.ahd-mark[data-party-mark="GRN"]')).not.toBeNull();
  });

  it("renders the authored image when the projection carries a real logo URL", () => {
    const management = makeManagement();
    management.parties = management.parties.map((party) =>
      party.id === "US_DEM" ? { ...party, logoUrl: "/party-logos/us-dem-1.png" } : party,
    );
    const { container } = render(<PartyManagementPanel management={management} busy={false} onAction={vi.fn()} />);
    const mark = container.querySelector('.ahd-mark[data-party-mark="DEM"]');
    expect(mark?.querySelector("img")).not.toBeNull();
    expect(mark?.querySelector("img")).toHaveAttribute("src", "/party-logos/us-dem-1.png");
  });

  it("shows the engine disabled reason when founding is unavailable", () => {
    const management = makeManagement();
    management.founding = { ...management.founding, available: false, disabledReason: "Not enough funds. Founding needs 100000 funds available." };
    render(<PartyManagementPanel management={management} busy={false} onAction={vi.fn()} />);
    expect(screen.getAllByText("Not enough funds. Founding needs 100000 funds available.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Found party" }).hasAttribute("disabled")).toBe(true);
  });
});
