import { readFileSync } from "node:fs";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionsHub, type ActionsCategoryFilter } from "./ActionsHub";
import { GameSession } from "../game/session";
import type { ActionView } from "../game/types";
import { applyPresidentialResolution, corporateSectorAssets, createWorld, serializeSave, type ElectionRecord } from "@ahdclient/engine";

function StatefulHub({ actions }: { actions: ActionView[] }) {
  const [category, setCategory] = useState<ActionsCategoryFilter>("all");
  return <ActionsHub actions={actions} {...props} category={category} onCategoryChange={setCategory} />;
}

const actions: ActionView[] = [
  { id: "campaign", name: "Campaign", description: "Influence work.", cost: 1, available: true, requires: "region", category: "influence", fundCost: 20000, cooldownTurns: 0, prerequisite: "Choose a region." },
  { id: "advertise", name: "Run Advertisements", description: "Ads.", cost: 5, available: false, disabledReason: "Not enough action points.", category: "influence", fundCost: 100000, cooldownTurns: 0 },
  { id: "fundraise", name: "Fundraise", description: "Raise money.", cost: 3, available: false, disabledReason: "No donor base. Use Build Donor Network first.", category: "fundraising", fundCost: 0, cooldownTurns: 0, prerequisite: "Requires a donor network." },
  { id: "poll", name: "Quick Poll", description: "Poll.", cost: 2, available: true, category: "intelligence", fundCost: 25000, cooldownTurns: 0 },
  { id: "debatePrep", name: "Debate Prep", description: "Study briefing books and rehearse.", cost: 1, available: false, disabledReason: "Needs a research briefing.", category: "intelligence", fundCost: 0, cooldownTurns: 0 },
];

const props = {
  regions: [{ id: "r1", name: "Midwest" }],
  parties: [{ id: "p1", name: "Labor", abbreviation: "LAB", color: "#dc2626", logoUrl: null, members: 1, treasury: 0, isPlayerParty: true }],
  busy: false,
  currency: "USD",
  onAction: vi.fn(),
};

describe("ActionsHub", () => {
  it("shows category tabs with eligible-of-total counts from current availability", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} />);
    const tabs = screen.getByRole("tablist", { name: /filter actions by category/i });
    expect(within(tabs).getByRole("tab", { name: /all, 2 of 5 available/i })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /influence, 1 of 2 available/i })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /fundraising, 0 of 1 available/i })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /intelligence, 1 of 2 available/i })).toBeInTheDocument();
  });

  it("filters to the selected category and shows projection details on each card", async () => {
    const user = userEvent.setup();
    render(<StatefulHub actions={actions} />);
    await user.click(screen.getByRole("tab", { name: /intelligence/i }));
    expect(screen.getByText("Quick Poll")).toBeInTheDocument();
    expect(screen.queryByText("Fundraise")).not.toBeInTheDocument();
    const card = screen.getByRole("article", { name: /quick poll/i });
    expect(within(card).getByText(/2 AP/i)).toBeInTheDocument();
    expect(within(card).getByText(/25,000/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /take action: quick poll/i })).toBeEnabled();
  });

  it("shows cooldown, prerequisite and funds cost from the projection", () => {
    const cooling: ActionView[] = [
      { id: "advertise", name: "Run Advertisements", description: "Ads.", cost: 5, available: false, disabledReason: "Available in 2 turns.", category: "influence", fundCost: 100000, cooldownTurns: 2 },
    ];
    render(<ActionsHub actions={cooling} {...props} category="all" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /run advertisements/i });
    expect(within(card).getByText(/available in 2 turns/i)).toBeInTheDocument();
    expect(within(card).queryByText(/cooldown: ready/i)).not.toBeInTheDocument();
  });

  it("keeps every supported action reachable through All", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} />);
    for (const action of actions) {
      expect(screen.getByRole("article", { name: new RegExp(action.name, "i") })).toBeInTheDocument();
    }
  });

  it("marks each card with a compact code-native category symbol and state", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} />);
    const available = screen.getByRole("article", { name: /^campaign$/i }).querySelector(".ahd-action-mark") as HTMLElement;
    const locked = screen.getByRole("article", { name: /^debate prep$/i }).querySelector(".ahd-action-mark") as HTMLElement;
    expect(available).toHaveAttribute("data-category", "influence");
    expect(available).toHaveAttribute("data-state", "available");
    expect(locked).toHaveAttribute("data-category", "intelligence");
    expect(locked).toHaveAttribute("data-state", "locked");
    expect(locked.textContent?.length).toBeGreaterThan(0);
  });

  it("keeps the disabled reason visible on a compact locked card", () => {
    render(<ActionsHub actions={actions} {...props} category="intelligence" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /^debate prep$/i });
    expect(within(card).getByText(/needs a research briefing/i)).toBeInTheDocument();
    expect(within(card).getByText("locked")).toBeInTheDocument();
  });

  it("renders one decorative code-native banner per card, reusing the shared category glyph", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /^campaign$/i });
    // Single mark per card: the shared glyph tile lives inside the banner, hidden
    // from assistive tech, while the card name stays the one accessible name.
    expect(card.getAttribute("aria-label")).toBe("Campaign");
    const banners = card.querySelectorAll(".ahd-action-banner");
    expect(banners).toHaveLength(1);
    const banner = banners[0] as HTMLElement;
    expect(banner).toHaveAttribute("aria-hidden", "true");
    expect(banner).toHaveAttribute("data-category", "influence");
    expect(banner).toHaveAttribute("data-state", "available");
    const marks = card.querySelectorAll(".ahd-action-mark");
    expect(marks).toHaveLength(1);
    expect(banner.contains(marks[0])).toBe(true);
    expect(marks[0]?.textContent?.length).toBeGreaterThan(0);

    const lockedCard = screen.getByRole("article", { name: /^debate prep$/i });
    const lockedBanner = lockedCard.querySelector(".ahd-action-banner") as HTMLElement;
    expect(lockedBanner).toHaveAttribute("data-category", "intelligence");
    expect(lockedBanner).toHaveAttribute("data-state", "locked");
  });

  it("styles the banner per category with a compact phone-first crop", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    for (const category of ["influence", "fundraising", "intelligence", "executive"]) {
      expect(css).toMatch(new RegExp(`\\.ahd-action-banner\\[data-category="${category}"\\]`));
    }
    expect(css).toMatch(/\.ahd-action-banner[^{]*\{[^}]*min-height:\s*3\.25rem/);
  });

  it("renders structured recent outcomes with targets, changes and follow-ups", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} outcomes={[{
      id: "t0-action:campaign:1", actionId: "campaign", title: "Campaign complete", message: "Campaigned successfully.",
      turn: 0, date: "1953-01-01", destination: { route: "actions" },
      target: { kind: "region", id: "r1", label: "Midwest" },
      changes: [
        { field: "actions", label: "Actions", before: 25, after: 24, delta: -1 },
        { field: "politicalInfluence", label: "Influence", before: 10, after: 11.5, delta: 1.5 },
      ],
      followUps: ["No cooldown. You can use Campaign again this turn."],
    }]} />);
    const history = screen.getByRole("region", { name: "Recent action results" });
    expect(within(history).getByText("Midwest")).toBeInTheDocument();
    expect(within(history).getByText(/Influence.*\+1.5/)).toBeInTheDocument();
    expect(within(history).getByText(/use Campaign again this turn/i)).toBeInTheDocument();
  });

  it("exposes explicit success status and result copy on each history entry", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} outcomes={[{
      id: "t0-action:fundraise:1", actionId: "fundraise", title: "Fundraiser complete", message: "Raised 1,200 from donors.",
      turn: 0, date: "1953-01-01", destination: { route: "actions" },
      changes: [
        { field: "actions", label: "Actions", before: 25, after: 22, delta: -3 },
        { field: "funds", label: "Campaign funds", before: 5_000, after: 6_200, delta: 1_200 },
      ],
      followUps: ["No cooldown. You can use Fundraise again this turn."],
    }]} />);
    const history = screen.getByRole("region", { name: "Recent action results" });
    const entry = within(history).getByRole("article", { name: /fundraiser complete: succeeded/i });
    expect(within(entry).getByText("Succeeded")).toBeInTheDocument();
    expect(within(entry).getByText("Raised 1,200 from donors.")).toBeInTheDocument();
    expect(within(entry).getByText(/Campaign funds.*\+1200/)).toBeInTheDocument();
  });

  it("omits the history section when no outcomes are recorded", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} outcomes={[]} />);
    expect(screen.queryByRole("region", { name: "Recent action results" })).not.toBeInTheDocument();
  });

  it("keeps the history compact at five entries", () => {
    const entry = (n: number) => ({
      id: `t0-action:campaign:${n}`, actionId: "campaign", title: `Campaign ${n}`, message: `Campaigned ${n}.`,
      turn: 0, date: "1953-01-01", destination: { route: "actions" as const },
      changes: [{ field: "actions", label: "Actions", before: 25, after: 24, delta: -1 }],
      followUps: ["No cooldown."],
    });
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} outcomes={[1, 2, 3, 4, 5, 6].map(entry)} />);
    const history = screen.getByRole("region", { name: "Recent action results" });
    expect(within(history).getAllByRole("article")).toHaveLength(5);
    expect(within(history).queryByText("Campaigned 6.")).not.toBeInTheDocument();
  });

  it("renders Debate Prep from the live session projection under Intelligence (#37)", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "debate-hub-seed", playerName: "Alex" });
    const live = session.view().actions;
    expect(live.find((action) => action.id === "debatePrep")).toMatchObject({
      cost: 1, fundCost: 0, cooldownTurns: 0, category: "intelligence",
    });
    const user = userEvent.setup();
    render(<StatefulHub actions={live} />);
    await user.click(screen.getByRole("tab", { name: /intelligence/i }));
    const card = screen.getByRole("article", { name: /^debate prep$/i });
    expect(within(card).getByText(/1 AP/i)).toBeInTheDocument();
  });

  it("opens the dedicated voter targeting flow without charging a proxy action (#57)", async () => {
    const session = new GameSession();
    const live = session.create({ era: "1953", countryId: "US", seed: "canvass-hub", playerName: "Alex" });
    const onAction = vi.fn();
    const onCanvass = vi.fn();
    const user = userEvent.setup();
    render(<ActionsHub actions={live.actions} {...props} onAction={onAction} onCanvass={onCanvass} category="all" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /^canvass$/i });
    expect(within(card).getByText(/1 AP/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: /voter canvassing/i }));
    expect(onCanvass).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
  });

  it("omits character canvassing in spectator mode (#57)", () => {
    const session = new GameSession();
    const live = session.create({ era: "1953", countryId: "US", seed: "canvass-spectator", playerName: "Alex", mode: "worldsim" });
    render(<ActionsHub actions={live.actions} {...props} onCanvass={vi.fn()} category="all" onCategoryChange={() => {}} />);
    expect(screen.queryByRole("article", { name: /^canvass$/i })).not.toBeInTheDocument();
    expect(screen.getByText("No actions available.")).toBeInTheDocument();
  });

  it("locks the hub Join Party row with the cooldown reason from the live projection", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "join-hub-cooldown", playerName: "Alex" });
    expect(session.act("joinParty", { partyId: "US_DEM" }).ok).toBe(true);
    const live = session.view();
    expect(live.actions.find((action) => action.id === "joinParty")).toMatchObject({
      available: false,
      disabledReason: "Party switch cooldown: 24 turn(s) remaining",
    });
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<ActionsHub actions={live.actions} regions={live.regions} parties={live.parties} busy={false} currency="USD" onAction={onAction} category="all" onCategoryChange={() => {}} />);
    // The row stays (hub contract) but locked with the explicit engine reason.
    const card = screen.getByRole("article", { name: /^join party$/i });
    expect(within(card).getByRole("button", { name: /unavailable: join party/i })).toBeDisabled();
    expect(within(card).getByText(/party switch cooldown: 24 turn\(s\) remaining/i)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: /unavailable: join party/i }));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("sends the picked party with an eligible hub Join Party action", async () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "join-hub-eligible", playerName: "Alex" });
    const live = session.view();
    expect(live.actions.find((action) => action.id === "joinParty")).toMatchObject({ available: true });
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<ActionsHub actions={live.actions} regions={live.regions} parties={live.parties} busy={false} currency="USD" onAction={onAction} category="all" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /^join party$/i });
    await user.click(within(card).getByRole("button", { name: /take action: join party/i }));
    expect(onAction).toHaveBeenCalledWith("joinParty", { partyId: live.parties[0]!.id });
  });

  it("shows the corporate seizure target and sends it through the action command", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const nationalize: ActionView = {
      id: "nationalizeCorporation",
      name: "Nationalize Distressed Corporation",
      description: "Seize a distressed domestic issuer.",
      cost: 0,
      available: true,
      requires: "corporation",
      choices: [
        { id: "US-media", label: "Daily Media" },
        { id: "US-manufacturing", label: "National Manufacturing" },
      ],
      category: "executive",
    };
    render(<ActionsHub actions={[nationalize]} {...props} onAction={onAction} category="all" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /nationalize distressed corporation/i });
    await user.selectOptions(within(card).getByRole("combobox", { name: /corporation for/i }), "US-manufacturing");
    await user.click(within(card).getByRole("button", { name: /take action: nationalize distressed corporation/i }));
    expect(onAction).toHaveBeenCalledWith("nationalizeCorporation", { corporationId: "US-manufacturing", tier: "seizure" });
  });

  it("surfaces nationalization with its recorded-office gate in a live session", () => {
    const session = new GameSession();
    session.create({ era: "1953", countryId: "US", seed: "nationalization-actions-hub", playerName: "Alex" });
    expect(session.view().actions.find((action) => action.id === "nationalizeCorporation")).toMatchObject({
      available: false,
      requires: "corporation",
      category: "executive",
      disabledReason: expect.stringMatching(/sitting head of government/i),
    });
  });

  it("executes nationalization from the elected player's live action projection and preserves unowned assets", async () => {
    const world = createWorld({ era: "1953", countryId: "US", playerName: "Alex", seed: "nationalization-live-action" });
    const corporation = world.corporations["US-media"]!;
    corporation.insolventSinceTurn = world.meta.turn;
    const election: ElectionRecord = {
      id: "US-president-elected-player",
      electionType: "president",
      countryId: "US",
      cycle: 1,
      status: "active",
      startTurn: world.meta.turn,
      primaryEndTurn: world.meta.turn,
      endTurn: world.meta.turn,
      totalSeats: 1,
      chamberKey: "president",
      candidates: [{ id: "player", name: world.player.name, partyId: "US_DEM", isNPP: false, incumbent: false }],
      tally: { player: 1000 },
    };
    world.elections.push(election);
    applyPresidentialResolution(world, election);
    const asset = Object.values(corporateSectorAssets(world)).find((row) => row.corporationId === corporation.id)!;
    const unownedBefore = structuredClone(world.unownedSectors[`${corporation.countryId}:${corporation.sectorType}`]);
    const session = new GameSession();
    session.load(serializeSave(world, "2026-10-01T00:00:00Z"));
    const action = session.view().actions.find((candidate) => candidate.id === "nationalizeCorporation")!;
    expect(action).toMatchObject({ available: true, requires: "corporation", category: "executive" });
    expect(action.choices).toContainEqual({ id: corporation.id, label: corporation.name ?? corporation.tickerSymbol });

    const onAction = (id: string, params?: Record<string, string | number>) => session.act(id, {
      corporationId: String(params?.corporationId ?? ""),
      tier: "seizure",
    });
    const user = userEvent.setup();
    render(<ActionsHub actions={session.view().actions} regions={session.view().regions} parties={session.view().parties} busy={false} currency="USD" onAction={onAction} category="all" onCategoryChange={() => {}} />);
    const card = screen.getByRole("article", { name: /nationalize distressed corporation/i });
    await user.click(within(card).getByRole("button", { name: /take action: nationalize distressed corporation/i }));
    const saved = JSON.parse(session.serialize("2026-10-01T00:00:00Z")) as {
      world: {
        corporations: Record<string, { ownershipState?: string; countryOwnerId?: string }>;
        corporateSectors: Record<string, { corporationId: string; owner: string }>;
        unownedSectors: Record<string, unknown>;
      };
    };
    const nationalId = `NAT-${corporation.countryId}-${corporation.sectorType}`;
    expect(saved.world.corporations[nationalId]).toMatchObject({ ownershipState: "stateOwned", countryOwnerId: "US" });
    expect(saved.world.corporateSectors[asset.id]).toMatchObject({ corporationId: nationalId, owner: "corporation" });
    expect(saved.world.unownedSectors[`${corporation.countryId}:${corporation.sectorType}`]).toEqual(unownedBefore);
  });

  it("renders a Debate Prep result with the stat change in recent outcomes (#37)", () => {
    render(<ActionsHub actions={actions} {...props} category="all" onCategoryChange={() => {}} outcomes={[{
      id: "t0-action:debatePrep:1", actionId: "debatePrep",
      title: "Breakthrough in the briefing room: your Debate skill improved (+1).",
      message: "Breakthrough in the briefing room: your Debate skill improved (+1).",
      turn: 0, date: "1953-01-01", destination: { route: "actions" },
      changes: [
        { field: "actions", label: "Actions", before: 25, after: 24, delta: -1 },
        { field: "debate", label: "Debate", before: 1, after: 2, delta: 1 },
      ],
      followUps: ["No cooldown. You can use Debate Prep again this turn."],
    }]} />);
    const history = screen.getByRole("region", { name: "Recent action results" });
    expect(within(history).getByText(/Debate: 1 to 2 \(\+1\)/)).toBeInTheDocument();
    expect(within(history).getByText(/use Debate Prep again this turn/i)).toBeInTheDocument();
  });
});
