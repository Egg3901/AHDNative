import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaucusPanel } from "./CaucusPanel";
import type { CaucusManagementView } from "../game/caucusManagement";
import type { ActionView } from "../game/types";

afterEach(() => {
  vi.restoreAllMocks();
});

function action(id: string, available: boolean, cost: number, disabledReason?: string, consequences?: string[]): ActionView {
  return { id, name: id, description: "", cost, available,
    ...(disabledReason ? { disabledReason } : {}),
    ...(consequences ? { consequences } : {}) };
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
      effect: {
        partyFundsDelta: -25_000, partyMembership: "none", caucusMembership: "create",
        clearsCaucusMembership: false, startsPartySwitchCooldown: false,
      },
      consequences: ["Charges 25,000 campaign funds", "Creates the caucus and makes you its first member"],
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
        isPlayerChair: false,
        chairName: "Pat",
        chairState: "known",
        viceChairName: null,
        viceChairState: "vacant",
        playerRole: "non-member",
        join: action("joinCaucus", true, 2, undefined, ["Joins you to this caucus"]),
        leave: action("leaveCaucus", false, 1, "You are not a member of this caucus."),
        setTax: action("setCaucusTaxRate", false, 0, "Only the caucus chair can set the tax rate"),
        disband: action("disbandCaucus", false, 0, "Only the caucus chair can disband the caucus"),
      },
    ],
  };
}

function makeChairManagement(): CaucusManagementView {
  const management = makeManagement();
  return {
    ...management,
    playerCaucusId: "caucus-blue-dog-caucus-99-0",
    playerCaucusName: "Blue Dog Caucus",
    caucuses: [{
      ...management.caucuses[0]!,
      isPlayerCaucus: true,
      isPlayerChair: true,
      chairName: "Alex",
      chairState: "known",
      playerRole: "chair",
      join: action("joinCaucus", false, 2, "Already in a caucus; leave it first"),
      leave: action("leaveCaucus", true, 1),
      setTax: action("setCaucusTaxRate", true, 0),
      disband: action("disbandCaucus", true, 0, undefined, ["Clears all members and vacates the chair seats"]),
    }],
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

  it("states the engine consequences of founding and joining before confirmation", () => {
    render(<CaucusPanel management={makeManagement()} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/Charges 25,000 campaign funds/)).toBeTruthy();
    expect(screen.getByText(/Creates the caucus and makes you its first member/)).toBeTruthy();
    expect(screen.getByText(/Joins you to this caucus/)).toBeTruthy();
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

  it("offers the chair tax edit and disband only to the chair and dispatches real ids", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CaucusPanel management={makeChairManagement()} busy={false} onAction={onAction} />);
    expect(screen.getByLabelText("Caucus tax for Blue Dog Caucus")).toBeTruthy();
    await user.clear(screen.getByLabelText("Caucus tax for Blue Dog Caucus"));
    await user.type(screen.getByLabelText("Caucus tax for Blue Dog Caucus"), "4.5");
    await user.click(screen.getByRole("button", { name: "Save Blue Dog Caucus tax" }));
    expect(onAction).toHaveBeenCalledWith("setCaucusTaxRate", {
      caucusId: "caucus-blue-dog-caucus-99-0",
      caucusTaxRate: 4.5,
    });
    onAction.mockClear();
    await user.click(screen.getByRole("button", { name: "Disband Blue Dog Caucus" }));
    expect(onAction).toHaveBeenCalledWith("disbandCaucus", { caucusId: "caucus-blue-dog-caucus-99-0" });
  });

  it("warns with the caucus and member impact before disbanding", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CaucusPanel management={makeChairManagement()} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Disband Blue Dog Caucus" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    const message = confirm.mock.calls[0]?.[0] ?? "";
    expect(message).toContain("Blue Dog Caucus");
    expect(message).toContain("1");
    expect(message.toLowerCase()).toContain("member");
    expect(onAction).toHaveBeenCalledWith("disbandCaucus", { caucusId: "caucus-blue-dog-caucus-99-0" });
  });

  it("does not dispatch disband when the chair cancels the confirmation", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CaucusPanel management={makeChairManagement()} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Disband Blue Dog Caucus" }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("dispatches disband exactly once when the chair accepts the confirmation", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CaucusPanel management={makeChairManagement()} busy={false} onAction={onAction} />);
    await user.click(screen.getByRole("button", { name: "Disband Blue Dog Caucus" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith("disbandCaucus", { caucusId: "caucus-blue-dog-caucus-99-0" });
  });

  it("hides the chair controls from a non-chair member", () => {
    render(<CaucusPanel management={makeManagement()} busy={false} onAction={vi.fn()} />);
    expect(screen.queryByLabelText("Caucus tax for Blue Dog Caucus")).toBeNull();
    expect(screen.queryByRole("button", { name: "Disband Blue Dog Caucus" })).toBeNull();
  });

  it("shows recorded chair, vice-chair and player role without hiding chair controls", () => {
    render(<CaucusPanel management={makeChairManagement()} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/Chair: Alex/)).toBeTruthy();
    expect(screen.getByText(/Your role: chair/)).toBeTruthy();
    expect(screen.getByLabelText("Caucus tax for Blue Dog Caucus")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disband Blue Dog Caucus" })).toBeTruthy();
  });

  it("shows explicit unknown copy when seats were never recorded", () => {
    const management = makeManagement();
    management.caucuses = [{
      ...management.caucuses[0]!,
      chairName: null,
      chairState: "unknown",
      viceChairName: null,
      viceChairState: "unknown",
    }];
    render(<CaucusPanel management={management} busy={false} onAction={vi.fn()} />);
    expect(screen.getAllByText(/unknown \(not recorded in this save\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Your role: not a member/)).toBeTruthy();
  });

  it("names health, whip, recruitment and elections as unrecorded instead of inventing values", () => {
    render(<CaucusPanel management={makeManagement()} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText(/Health, whip, recruitment and elections are not recorded/)).toBeTruthy();
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
