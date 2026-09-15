import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CabinetOfficePanel } from "./CabinetOfficePanel";
import type { CabinetOfficeView } from "../game/cabinetOffice";

function makeOffice(): CabinetOfficeView {
  return {
    countryId: "US",
    countryName: "United States",
    turn: 0,
    isExecutive: false,
    regions: [
      { id: "AL", name: "Alabama" },
      { id: "CA", name: "California" },
    ],
    positions: [
      {
        id: "secretary_of_treasury",
        name: "Secretary of the Treasury",
        holderName: "Alex",
        isPlayerHolder: true,
        isVacant: false,
        actionsRemaining: 3,
        canIssue: true,
        orders: [
          {
            id: "emergency_fiscal_stimulus",
            name: "Emergency Fiscal Stimulus",
            description: "Spend to cut unemployment.",
            duration: 24,
            effects: [{ metric: "economic.unemploymentRate", modifier: -0.03, scope: "national" }],
            targetsRegion: false,
            alreadyActive: false,
            available: true,
          },
          {
            id: "regional_investment_programme",
            name: "Regional Investment Programme",
            description: "Target a region for a GDP boost.",
            duration: 24,
            effects: [{ metric: "economic.gdpGrowth", modifier: 0.05, scope: "regional" }],
            targetsRegion: true,
            alreadyActive: false,
            available: true,
          },
          {
            id: "old_order",
            name: "Old Order",
            description: "Already in force.",
            duration: 24,
            effects: [],
            targetsRegion: false,
            alreadyActive: true,
            available: false,
            disabledReason: "This order is already active for this position",
          },
        ],
      },
      {
        id: "secretary_of_state",
        name: "Secretary of State",
        holderName: null,
        isPlayerHolder: false,
        isVacant: true,
        actionsRemaining: null,
        canIssue: false,
        eligibilityReason: "No cabinet holder for this position",
        orders: [],
      },
    ],
    activeOrders: [
      {
        id: "minord_0_1",
        positionId: "secretary_of_treasury",
        positionName: "Secretary of the Treasury",
        orderId: "old_order",
        orderName: "Old Order",
        targetRegionId: null,
        targetRegionName: null,
        expiresTurn: 24,
        turnsRemaining: 24,
        effects: [],
      },
    ],
  };
}

describe("CabinetOfficePanel", () => {
  it("renders position, order, eligibility and the live active order", () => {
    render(<CabinetOfficePanel office={makeOffice()} busy={false} notice={null} onIssue={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Cabinet office" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Ministerial order" })).toBeInTheDocument();
    expect(screen.getByText(/Alex.*3 ministerial actions remaining/)).toBeInTheDocument();
    expect(screen.getByText("Old Order")).toBeInTheDocument();
    expect(screen.getByText(/expires turn 24 \(24 turns left\)/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Target region" })).not.toBeInTheDocument();
  });

  it("reveals the target select for regional orders and issues with the target", async () => {
    const user = userEvent.setup();
    const onIssue = vi.fn();
    render(<CabinetOfficePanel office={makeOffice()} busy={false} notice={null} onIssue={onIssue} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Ministerial order" }), "regional_investment_programme");
    const target = screen.getByRole("combobox", { name: "Target region" });
    expect(target).toBeInTheDocument();
    await user.selectOptions(target, "CA");
    await user.click(screen.getByRole("button", { name: "Issue ministerial order" }));
    expect(onIssue).toHaveBeenCalledWith({
      positionId: "secretary_of_treasury",
      orderId: "regional_investment_programme",
      targetRegionId: "CA",
    });
  });

  it("disables issuing for already-active orders and vacant offices", async () => {
    const user = userEvent.setup();
    const onIssue = vi.fn();
    render(<CabinetOfficePanel office={makeOffice()} busy={false} notice={null} onIssue={onIssue} />);
    const activeOption = screen.getByRole("option", { name: /Old Order.*already active/ });
    expect(activeOption).toBeDisabled();

    await user.selectOptions(screen.getByRole("combobox", { name: "Cabinet office" }), "secretary_of_state");
    expect(screen.getByText(/This office is vacant/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue ministerial order" })).toBeDisabled();
    expect(onIssue).not.toHaveBeenCalled();
  });

  it("shows refusal and result notices", () => {
    const { rerender } = render(
      <CabinetOfficePanel office={makeOffice()} busy={false} notice={{ kind: "error", text: "Only the cabinet holder or admin can issue orders" }} onIssue={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Only the cabinet holder or admin can issue orders");
    rerender(
      <CabinetOfficePanel office={makeOffice()} busy={false} notice={{ kind: "ok", text: "Issued Emergency Fiscal Stimulus" }} onIssue={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Issued Emergency Fiscal Stimulus");
  });
});
