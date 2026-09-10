import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GameScreen } from "./GameScreen";
import type { ElectionView, GameView } from "../game/types";

function makeElection(overrides: Partial<ElectionView> = {}): ElectionView {
  return {
    id: "e1",
    title: "General Election",
    status: "upcoming",
    date: "1954-11-02",
    filingDate: "1954-09-01",
    playerCandidate: false,
    candidateNames: ["Ada", "Bob"],
    winnerNames: [],
    candidacy: { id: "declareCandidacy", name: "Declare candidacy", description: "Run", cost: 1, available: true },
    ...overrides,
  };
}

function makeWorld(overrides: Partial<GameView> = {}): GameView {
  return {
    turn: 1,
    date: "1953-01-01",
    era: "1953",
    countryId: "US",
    countryName: "United States",
    player: { name: "Ada", cash: 1200, funds: 5000, actions: 3, influence: 12, favorability: 48, partyName: "Labor" },
    metrics: [{ id: "gdp", label: "GDP", value: 12345, format: "money" }],
    parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", members: 120, treasury: 9000, isPlayerParty: true }],
    elections: [makeElection()],
    news: [{ id: "n1", title: "Markets rally", body: "Stocks up.", date: "1953-02-01" }],
    actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" }],
    regions: [{ id: "r1", name: "Midwest" }],
    ...overrides,
  };
}

describe("GameScreen", () => {
  it("renders header with end turn and save and overview by default", () => {
    const world = makeWorld();
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end turn/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save game/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Overview");
    expect(screen.getAllByText(/united states/i).length).toBeGreaterThan(0);
  });

  it("switches tabs via accessible tablist", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Parties" }));
    expect(screen.getByRole("tab", { name: "Parties" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Labor")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Elections" }));
    expect(screen.getByText("General Election")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "News" }));
    expect(screen.getByText("Markets rally")).toBeInTheDocument();
  });

  it("supports keyboard arrow navigation", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Character" })).toHaveAttribute("aria-selected", "true");
  });

  it("tabs have proper roving tabindex", () => {
    const world = makeWorld();
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabIndex", "0");
    expect(tabs[1]).toHaveAttribute("tabIndex", "-1");
  });

  it("shows empty states explicitly for each collection", async () => {
    const user = userEvent.setup();
    const world = makeWorld({ metrics: [], parties: [], elections: [], news: [], actions: [] });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    expect(screen.getByText("No metrics for this world.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Character" }));
    expect(screen.getByText("No actions available.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Parties" }));
    expect(screen.getByText("No parties in this world.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Elections" }));
    expect(screen.getByText("No elections scheduled.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "News" }));
    expect(screen.getByText("No news yet.")).toBeInTheDocument();
  });

  it("reflects busy disabling actions and shows message and error", async () => {
    const world = makeWorld();
    const onAction = vi.fn();
    const { rerender } = render(<GameScreen world={world} busy={true} message="Advancing" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    expect(screen.getByText("Advancing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end turn/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save game/i })).toBeDisabled();
    rerender(<GameScreen world={world} busy={false} error="Save failed" onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
  });

  it("invokes onAdvanceTurn, onSave, onExit", async () => {
    const user = userEvent.setup();
    const world = makeWorld();
    const onAdvanceTurn = vi.fn();
    const onSave = vi.fn();
    const onExit = vi.fn();
    render(<GameScreen world={world} busy={false} onAdvanceTurn={onAdvanceTurn} onSave={onSave} onExit={onExit} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /end turn/i }));
    await user.click(screen.getByRole("button", { name: /save game/i }));
    await user.click(screen.getByRole("button", { name: /exit game/i }));
    expect(onAdvanceTurn).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("performs action with params and respects disabledReason", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      actions: [
        { id: "blocked", name: "Blocked", description: "no", cost: 1, available: false, disabledReason: "Need more influence" },
        { id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" },
      ],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Character" }));
    expect(screen.getAllByText("Need more influence").length).toBeGreaterThan(0);
    const takeButtons = screen.getAllByRole("button", { name: /take action/i });
    const available = takeButtons.find((b) => b.textContent?.includes("Fundraise"));
    expect(available).toBeTruthy();
    const amountInput = screen.getByLabelText(/amount for fundraise/i) as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "25");
    await user.click(available!);
    expect(onAction).toHaveBeenCalledWith("fundraise", expect.objectContaining({ amount: 25 }));
  });

  it("validates amount before invocation and shows error for invalid", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      actions: [{ id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" }],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Character" }));
    const amountInput = screen.getByLabelText(/amount for fundraise/i) as HTMLInputElement;
    await user.clear(amountInput);
    await user.type(amountInput, "0");
    await user.click(screen.getByRole("button", { name: /take action: fundraise/i }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText(/positive whole amount/i)).toBeInTheDocument();
  });

  it("action labels distinguish which action", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      actions: [
        { id: "fundraise", name: "Fundraise", description: "Raise money", cost: 1, available: true, requires: "amount" },
        { id: "advertise", name: "Advertise", description: "Run ads", cost: 1, available: true },
      ],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Character" }));
    expect(screen.getByRole("button", { name: /take action: fundraise/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take action: advertise/i })).toBeInTheDocument();
  });

  it("handles party and region required actions via actual props", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [{ id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", members: 80, treasury: 4000, isPlayerParty: false }],
      regions: [{ id: "r2", name: "North" }],
      actions: [
        { id: "endorse", name: "Endorse", description: "Endorse party", cost: 1, available: true, requires: "party" },
        { id: "tour", name: "Tour", description: "Tour region", cost: 1, available: true, requires: "region" },
      ],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Character" }));
    const buttons = screen.getAllByRole("button", { name: /take action:/i });
    await user.click(buttons[0]!);
    expect(onAction).toHaveBeenCalledWith("endorse", expect.objectContaining({ partyId: "p2" }));
    await user.click(buttons[1]!);
    expect(onAction).toHaveBeenCalledWith("tour", expect.objectContaining({ regionId: "r2" }));
  });

  it("does not invoke when party or region selection missing", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [],
      regions: [],
      actions: [
        { id: "joinParty", name: "Join Party", description: "Join", cost: 1, available: true, requires: "party" },
      ],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Character" }));
    await user.click(screen.getByRole("button", { name: /take action: join party/i }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not render fake disabled feature pages", () => {
    const world = makeWorld();
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    tabs.forEach((t) => expect(t).not.toBeDisabled());
    expect(tabs.map((t) => t.textContent)).toEqual(["Overview", "Character", "Parties", "Elections", "News"]);
  });

  it("renders percent metrics as fractions multiplied by 100", async () => {
    const world = makeWorld({
      metrics: [
        { id: "growth", label: "GDP growth", value: 0.031, format: "percent" },
        { id: "inflation", label: "Inflation", value: 0.046, format: "percent" },
      ],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    expect(screen.getByText("3.1%")).toBeInTheDocument();
    expect(screen.getByText("4.6%")).toBeInTheDocument();
  });

  it("election card shows filing deadline, badge, candidates and runs for office", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      elections: [makeElection({ playerCandidate: true, candidateNames: ["Ada", "Bob"] })],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Elections" }));
    const card = screen.getByRole("article", { name: "General Election" });
    expect(within(card).getByText(/1954-09-01/)).toBeInTheDocument();
    expect(within(card).getByText("Candidate")).toBeInTheDocument();
    expect(within(card).getByText(/Ada/)).toBeInTheDocument();
    const run = within(card).getByRole("button", { name: /run for office/i });
    expect(run).toBeEnabled();
    await user.click(run);
    expect(onAction).toHaveBeenCalledWith("declareCandidacy", { electionId: "e1" });
  });

  it("withdraw candidacy dispatches with electionId and shows reason when unavailable", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      elections: [
        makeElection({
          id: "e9",
          title: "Senate Race",
          candidacy: { id: "withdrawCandidacy", name: "Withdraw", description: "Out", cost: 0, available: false, disabledReason: "Filing closed" },
          winnerNames: ["Bob"],
        }),
      ],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Elections" }));
    const card = screen.getByRole("article", { name: "Senate Race" });
    expect(within(card).getByText(/winners:.*bob/i)).toBeInTheDocument();
    const withdraw = within(card).getByRole("button", { name: /withdraw candidacy/i });
    expect(withdraw).toBeDisabled();
    expect(within(card).getAllByText(/filing closed/i).length).toBeGreaterThan(0);
    await user.click(withdraw).catch(() => undefined);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("candidacy button is disabled while busy", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld();
    render(<GameScreen world={world} busy={true} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Elections" }));
    const card = screen.getByRole("article", { name: "General Election" });
    expect(within(card).getByRole("button", { name: /run for office/i })).toBeDisabled();
  });

  it("paginates elections 20 per page so every election stays reachable", async () => {
    const user = userEvent.setup();
    const elections = Array.from({ length: 25 }, (_, i) =>
      makeElection({ id: `e${i}`, title: `Race ${i}`, filingDate: "1954-09-01" }),
    );
    const world = makeWorld({ elections });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Elections" }));
    expect(screen.getByRole("article", { name: "Race 0" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Race 24" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("article", { name: "Race 24" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Race 0" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /previous page/i }));
    expect(screen.getByRole("article", { name: "Race 0" })).toBeInTheDocument();
  });

  it("party cards join and leave via world.actions availability with candidacy warning", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const world = makeWorld({
      parties: [
        { id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", members: 120, treasury: 9000, isPlayerParty: true },
        { id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", members: 80, treasury: 4000, isPlayerParty: false },
      ],
      actions: [
        { id: "joinParty", name: "Join Party", description: "Join", cost: 2, available: true, requires: "party" },
        { id: "leaveParty", name: "Leave Party", description: "Leave", cost: 0, available: true },
      ],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={onAction} />);
    await user.click(screen.getByRole("tab", { name: "Parties" }));
    expect(screen.getByText(/withdraws your candidacy/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /join tories/i }));
    expect(onAction).toHaveBeenCalledWith("joinParty", { partyId: "p2" });
    await user.click(screen.getByRole("button", { name: /leave labor/i }));
    expect(onAction).toHaveBeenCalledWith("leaveParty", undefined);
  });

  it("party join button surfaces disabled reason from world.actions", async () => {
    const user = userEvent.setup();
    const world = makeWorld({
      parties: [{ id: "p2", name: "Tories", abbreviation: "CON", color: "#1d4ed8", members: 80, treasury: 4000, isPlayerParty: false }],
      actions: [{ id: "joinParty", name: "Join Party", description: "Join", cost: 2, available: false, disabledReason: "Cooldown", requires: "party" }],
    });
    render(<GameScreen world={world} busy={false} onAdvanceTurn={vi.fn()} onSave={vi.fn()} onExit={vi.fn()} onAction={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Parties" }));
    expect(screen.getByRole("button", { name: /join tories/i })).toBeDisabled();
    expect(screen.getAllByText(/cooldown/i).length).toBeGreaterThan(0);
  });
});
