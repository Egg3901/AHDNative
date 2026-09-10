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
      action: { id: "foundParty", name: "Found Party", description: "", cost: 8, available: true },
    },
    parties: [
      { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3333ff",
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
    render(<PartyManagementPanel management={makeManagement()} busy={false} onAction={onAction} />);
    expect(screen.getByText("Start a party")).toBeTruthy();
    expect(screen.queryByText("US_DEM")).toBeNull();
    expect(screen.queryByText("charter-x")).toBeNull();
    expect(screen.getByText("New Frontier")).toBeTruthy();
    await user.type(screen.getByLabelText("Party name"), "Second Wave");
    await user.type(screen.getByLabelText("Abbreviation"), "SWP");
    await user.click(screen.getByRole("button", { name: "Found party" }));
    expect(onAction).toHaveBeenCalledWith("foundParty", { foundPartyName: "Second Wave", foundPartyAbbr: "SWP" });
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

  it("shows the engine disabled reason when founding is unavailable", () => {
    const management = makeManagement();
    management.founding = { ...management.founding, available: false, disabledReason: "Not enough funds. Founding needs 100000 funds available." };
    render(<PartyManagementPanel management={management} busy={false} onAction={vi.fn()} />);
    expect(screen.getAllByText("Not enough funds. Founding needs 100000 funds available.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Found party" }).hasAttribute("disabled")).toBe(true);
  });
});
