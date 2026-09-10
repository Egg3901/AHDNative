import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaucusPanel } from "./CaucusPanel";
import type { CaucusManagementView } from "../game/caucusManagement";
import type { ActionView } from "../game/types";

function action(id: string, available: boolean, cost: number, disabledReason?: string): ActionView {
  return { id, name: id, description: "", cost, available, ...(disabledReason ? { disabledReason } : {}) };
}

function makeManagement(): CaucusManagementView {
  return {
    countryId: "US",
    countryName: "United States",
    currency: "USD",
    playerPartyId: "US_DEM",
    playerPartyName: "Democratic Party",
    playerCaucusId: null,
    playerCaucusName: null,
    caucusCount: 1,
    create: {
      actionCost: 4, fundCost: 25_000, fundsRequired: 25_000,
      funds: 152_000, actions: 9, cooldownRemaining: 0,
      taxMin: 0, taxMax: 5, nameMinLength: 3,
      available: true,
      action: action("createCaucus", true, 4),
    },
    caucuses: [
      {
        id: "caucus-blue-dog-caucus-99-0",
        name: "Blue Dog Caucus",
        taxRate: 2.5,
        treasury: 0,
        memberCount: 1,
        memberNames: ["Pat"],
        isPlayerCaucus: false,
        join: action("joinCaucus", true, 2),
        leave: action("leaveCaucus", false, 1, "You are not a member of this caucus."),
      },
    ],
  };
}

describe("CaucusPanel", () => {
  it("renders founding, tax and roster without raw ids, and dispatches createCaucus", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<CaucusPanel management={makeManagement()} busy={false} onAction={onAction} />);
    expect(screen.getByText("Found a caucus")).toBeTruthy();
    expect(screen.getByText("Blue Dog Caucus")).toBeTruthy();
    expect(screen.getByText(/Tax 2.5%/)).toBeTruthy();
    expect(screen.queryByText("caucus-blue-dog-caucus-99-0")).toBeNull();
    expect(screen.queryByText("US_DEM")).toBeNull();
    await user.type(screen.getByLabelText("Caucus name"), "New Democrats");
    await user.clear(screen.getByLabelText("Caucus tax"));
    await user.type(screen.getByLabelText("Caucus tax"), "2");
    await user.click(screen.getByRole("button", { name: "Found caucus" }));
    expect(onAction).toHaveBeenCalledWith("createCaucus", { caucusName: "New Democrats", caucusTaxRate: 2 });
  });

  it("dispatches join and leave from the roster with real action ids", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const management = makeManagement();
    const { rerender } = render(<CaucusPanel management={management} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Join Blue Dog Caucus" }));
    expect(onAction).toHaveBeenCalledWith("joinCaucus", { caucusId: "caucus-blue-dog-caucus-99-0" });

    onAction.mockClear();
    const member = {
      ...management,
      playerCaucusId: "caucus-blue-dog-caucus-99-0",
      playerCaucusName: "Blue Dog Caucus",
      caucuses: [{
        ...management.caucuses[0]!,
        isPlayerCaucus: true,
        join: action("joinCaucus", false, 2, "Already in a caucus; leave it first"),
        leave: action("leaveCaucus", true, 1),
      }],
    };
    rerender(<CaucusPanel management={member} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Leave Blue Dog Caucus" }));
    expect(onAction).toHaveBeenCalledWith("leaveCaucus");
  });

  it("disables founding with the validation message when the name is invalid", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<CaucusPanel management={makeManagement()} busy={false} onAction={onAction} />);
    await user.type(screen.getByLabelText("Caucus name"), "AB");
    expect(screen.getByText("Caucus name too short")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Found caucus" }).hasAttribute("disabled")).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows the engine disabled reason when founding is unavailable", () => {
    const management = makeManagement();
    management.create = {
      ...management.create,
      available: false,
      disabledReason: "Not enough funds. Creating a caucus needs 25000 funds available.",
      action: action("createCaucus", false, 4, "Not enough funds. Creating a caucus needs 25000 funds available."),
    };
    render(<CaucusPanel management={management} busy={false} onAction={vi.fn()} />);
    expect(screen.getAllByText("Not enough funds. Creating a caucus needs 25000 funds available.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Found caucus" }).hasAttribute("disabled")).toBe(true);
  });
});
