import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { corporateSectorAssets, createWorld, openBargainingCampaignAction, serializeSave } from "@ahdclient/engine";
import { GameSession } from "../game/session";
import type { GameCommand } from "../game/protocol";
import { UnionManagementPanel } from "./UnionManagementPanel";

const unionId = "US-manufacturing";

describe("UnionManagementPanel", () => {
  it("proves the saved 0% control and 50% treatment exact same-turn funding and treasury delta", async () => {
    const user = userEvent.setup();
    const makeSession = () => {
      const world = createWorld({ seed: "union-contribution-rate-twin", playerName: "Alex", countryId: "US", era: "1953" });
      const union = world.unions[unionId]!;
      union.ownerType = "player";
      union.ownerId = "player";
      union.treasury = 100_000;
      union.strength = 100;
      union.duesPerWorkerAnnual = 5;
      world.unionOrganizers = { [`${unionId}:player`]: { id: `${unionId}:player`, unionId, characterId: "player", strength: 100, organizeCount: 10, createdAtTurn: 0, updatedAtTurn: 0 } };
      const session = new GameSession();
      session.load(serializeSave(world, "2026-10-02T00:00:00Z"));
      return session;
    };
    const control = makeSession();
    const treatment = makeSession();
    const command = (session: GameSession) => (item: Extract<GameCommand, { type: "unionCommand" }>) => {
      if (item.op === "contributions") session.setUnionPoliticalContributions(item.unionId, item.politicalContributionPct);
    };
    const controlRender = render(<UnionManagementPanel state={control.unionManagement()} busy={false} onCommand={command(control)} />);
    const treatmentRender = render(<UnionManagementPanel state={treatment.unionManagement()} busy={false} onCommand={command(treatment)} />);
    const controlUnion = within(controlRender.container).getByTestId(`union-${unionId}`);
    const treatmentUnion = within(treatmentRender.container).getByTestId(`union-${unionId}`);
    await user.click(within(controlUnion).getByRole("button", { name: "Set political contributions" }));
    fireEvent.change(within(treatmentUnion).getByRole("slider", { name: /Political contributions as a percent/ }), { target: { value: "50" } });
    treatmentRender.rerender(<UnionManagementPanel state={treatment.unionManagement()} busy={false} onCommand={command(treatment)} />);
    await user.click(within(treatmentUnion).getByRole("button", { name: "Set political contributions" }));

    const controlBefore = control.unionManagement().unions.find((row) => row.id === unionId)!;
    const treatmentBefore = treatment.unionManagement().unions.find((row) => row.id === unionId)!;
    expect(controlBefore.politicalContributionPct).toBe(0);
    expect(treatmentBefore.politicalContributionPct).toBe(0.5);
    const controlFunds = control.view().player.funds;
    const treatmentFunds = treatment.view().player.funds;
    control.advance();
    treatment.advance();
    const controlSave = control.serialize("2026-10-03T00:00:00Z");
    const treatmentSave = treatment.serialize("2026-10-03T00:00:00Z");
    const controlWorld = JSON.parse(controlSave).world;
    const treatmentWorld = JSON.parse(treatmentSave).world;
    const paid = treatmentWorld.unionContributionLedger.filter((row: { unionId: string; turn: number }) => row.unionId === unionId && row.turn === 1)
      .reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
    expect(controlWorld.unionContributionLedger ?? []).toEqual([]);
    expect(paid).toBeGreaterThan(0);
    expect(treatmentWorld.player.funds - treatmentFunds - (controlWorld.player.funds - controlFunds)).toBeCloseTo(paid, 8);
    expect(
      (controlWorld.unions[unionId].treasury - controlBefore.treasury) -
      (treatmentWorld.unions[unionId].treasury - treatmentBefore.treasury),
    ).toBeCloseTo(paid, 2);
    expect(treatmentWorld.unions[unionId].politicalContributionPct).toBe(0.5);

    const resumed = new GameSession();
    resumed.load(treatmentSave);
    resumed.advance();
    treatment.advance();
    expect(JSON.parse(resumed.serialize("2026-10-04T00:00:00Z")).world).toEqual(JSON.parse(treatment.serialize("2026-10-04T00:00:00Z")).world);
  }, 45_000);

  it("offers the public quiet and mass drives while a ban suspends legal union actions", async () => {
    const user = userEvent.setup();
    const world = createWorld({ seed: "union-panel-underground", playerName: "Alex", countryId: "US", era: "1953" });
    world.budgets.US!.unionsBanned = true;
    world.unions[unionId]!.suspended = true;
    world.player.actions = 20;
    const session = new GameSession();
    session.load(serializeSave(world, "2026-10-02T00:00:00Z"));
    const commands: Extract<GameCommand, { type: "unionCommand" }>[] = [];
    const dispatch = (command: Extract<GameCommand, { type: "unionCommand" }>) => {
      commands.push(command);
      if (command.op === "organizeUnderground") session.organizeUnionUnderground(command.unionId, command.mode);
    };
    const { rerender } = render(<UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />);
    const union = screen.getByTestId(`union-${unionId}`);
    expect(within(union).getByText(/National ban active/)).toBeTruthy();
    expect(within(union).queryByRole("button", { name: "Organize United Steelworkers" })).toBeNull();
    await user.click(within(union).getByRole("button", { name: "Quiet underground drive (10 AP)" }));
    rerender(<UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />);
    expect(commands).toContainEqual({ type: "unionCommand", op: "organizeUnderground", unionId, mode: "quiet" });
    expect(within(union).getByText(/Underground strength 4\.0/)).toBeTruthy();
  });

  it("routes organizing, weighted vote, acceptance, and bargaining through public session commands", async () => {
    const user = userEvent.setup();
    const world = createWorld({ seed: "union-panel-flow", playerName: "Alex", countryId: "US", era: "1953" });
    world.player.actions = 57;
    world.unions[unionId]!.treasury = 100_000;
    const session = new GameSession();
    session.load(serializeSave(world, "2026-10-01T00:00:00Z"));
    const commands: Extract<GameCommand, { type: "unionCommand" }>[] = [];
    const dispatch = (command: Extract<GameCommand, { type: "unionCommand" }>) => {
      commands.push(command);
      if (command.op === "organize") session.organizeUnion(command.unionId);
      else if (command.op === "organizeSector") session.organizeUnionSector(command.unionId, command.assetId);
      else if (command.op === "dues") session.setUnionDues(command.unionId, command.duesPerWorkerAnnual);
      else if (command.op === "contributions") session.setUnionPoliticalContributions(command.unionId, command.politicalContributionPct);
      else if (command.op === "vote") session.castUnionLeadershipVote(command.unionId);
      else if (command.op === "accept") session.acceptUnionLeadership(command.unionId);
      else if (command.op === "call") session.callUnionBargaining(command.unionId, command.employerId, command.terms);
      else if (command.op === "move") session.moveUnionBargaining(command.campaignId, command.action, command.terms);
      else session.castUnionRatificationBallot(command.campaignId, command.vote);
    };
    const { rerender } = render(
      <UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />,
    );
    const refresh = () => rerender(<UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />);
    const union = screen.getByTestId(`union-${unionId}`);

    for (let drive = 0; drive < 10; drive++) {
      await user.click(within(union).getByRole("button", { name: "Organize United Steelworkers" }));
      refresh();
    }
    await user.click(within(union).getByRole("button", { name: "Vote to lead" }));
    refresh();
    await user.click(within(union).getByRole("button", { name: "Accept presidency" }));
    rerender(<UnionManagementPanel state={session.unionManagement()} busy={true} onCommand={dispatch} />);
    expect(within(union).getByRole("spinbutton", { name: "Annual dues per member for United Steelworkers" })).toBeDisabled();
    refresh();
    await user.clear(within(union).getByRole("spinbutton", { name: "Annual dues per member for United Steelworkers" }));
    await user.type(within(union).getByRole("spinbutton", { name: "Annual dues per member for United Steelworkers" }), "100000");
    await user.click(within(union).getByRole("button", { name: "Set annual dues" }));
    refresh();
    const contributions = within(union).getByRole("slider", { name: "Political contributions as a percent of remaining budget for United Steelworkers" });
    fireEvent.change(contributions, { target: { value: "50" } });
    refresh();
    await user.click(within(union).getByRole("button", { name: "Set political contributions" }));
    refresh();
    for (let drive = 0; drive < 7; drive++) {
      await user.click(within(union).getByRole("button", { name: /Organize sector US-manufacturing/ }));
      refresh();
    }
    await user.click(within(union).getByRole("button", { name: `Call ${unionId} to bargain` }));

    expect(commands.filter((command) => command.op === "organize")).toHaveLength(10);
    expect(commands).toContainEqual({ type: "unionCommand", op: "vote", unionId });
    expect(commands).toContainEqual({ type: "unionCommand", op: "accept", unionId });
    expect(commands.find((command) => command.op === "dues")).toMatchObject({ op: "dues", unionId });
    expect(commands.find((command) => command.op === "contributions")).toMatchObject({ op: "contributions", unionId, politicalContributionPct: 0.5 });
    expect(commands.filter((command) => command.op === "organizeSector")).toHaveLength(7);
    expect(commands.find((command) => command.op === "call")).toMatchObject({ op: "call", unionId, employerId: unionId });
    expect(session.unionBargaining().campaigns).toHaveLength(1);

    const beforeTurn = JSON.parse(session.serialize("2026-10-02T00:00:00Z")).world;
    expect(beforeTurn.unions[unionId].politicalContributionPct).toBe(0.5);
    const playerFundsBefore = beforeTurn.player.funds;
    session.advance();
    const firstTurnSave = session.serialize("2026-10-02T00:00:00Z");
    const firstTurn = JSON.parse(firstTurnSave).world;
    const contributionRows = firstTurn.unionContributionLedger.filter((row: { unionId: string }) => row.unionId === unionId);
    expect(contributionRows.length).toBeGreaterThan(0);
    const totalPaid = contributionRows.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
    expect(totalPaid).toBeGreaterThan(0);
    expect(contributionRows).toEqual([
      expect.objectContaining({ recipientId: "player", turn: 1, amount: expect.any(Number), source: "union_pac" }),
    ]);
    expect(firstTurn.player.funds - playerFundsBefore).toBeGreaterThanOrEqual(totalPaid);
    const sameTurnPayroll = session.unionManagement().unions.find((row) => row.id === unionId)!;
    expect(totalPaid).toBeCloseTo(sameTurnPayroll.duesIncomePerTurn * 0.5, 2);
    const reloaded = new GameSession();
    reloaded.load(firstTurnSave);
    expect(JSON.parse(reloaded.serialize("2026-10-02T00:00:00Z")).world.unionContributionLedger).toEqual(firstTurn.unionContributionLedger);
    reloaded.advance();
    const continued = JSON.parse(reloaded.serialize("2026-10-03T00:00:00Z")).world;
    expect(continued.unionContributionLedger.filter((row: { unionId: string; turn: number }) => row.unionId === unionId && row.turn === 1).length).toBe(contributionRows.length);
    expect(continued.unionContributionLedger.some((row: { unionId: string; turn: number }) => row.unionId === unionId && row.turn === 2)).toBe(true);
  }, 15_000);

  it("surfaces the source dispute escalation, strike, and withdrawal actions", async () => {
    const user = userEvent.setup();
    const world = createWorld({ seed: "union-panel-strike", playerName: "Alex", countryId: "US", era: "1953" });
    world.meta.turn = 2;
    const union = world.unions[unionId]!;
    union.ownerType = "player";
    union.ownerId = "player";
    union.strength = 100;
    union.approval = 85;
    union.treasury = 100_000;
    world.player.actions = 50;
    for (let drive = 0; drive < 10; drive++) {
      const organizerId = `${unionId}:player`;
      const organizer = world.unionOrganizers?.[organizerId];
      if (!organizer) world.unionOrganizers = { ...(world.unionOrganizers ?? {}), [organizerId]: { id: organizerId, unionId, characterId: "player", strength: 10, organizeCount: 1, createdAtTurn: world.meta.turn, updatedAtTurn: world.meta.turn } };
      else organizer.strength += 10;
    }
    for (const asset of Object.values(corporateSectorAssets(world))) {
      if (asset.representingUnionId === unionId) asset.unionization = 80;
    }
    const campaign = openBargainingCampaignAction(world, {
      unionId,
      employerCorporationId: unionId,
      terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: world.meta.turn,
    });
    campaign.status = "dispute";
    campaign.lastActionTurn = world.meta.turn - 1;
    campaign.mandate.support = 80;
    campaign.currentOffer.proposedBy = "employer";

    const session = new GameSession();
    session.load(serializeSave(world, "2026-10-01T00:00:00Z"));
    const commands: Extract<GameCommand, { type: "unionCommand" }>[] = [];
    const dispatch = (command: Extract<GameCommand, { type: "unionCommand" }>) => {
      commands.push(command);
      if (command.op === "move") session.moveUnionBargaining(command.campaignId, command.action, command.terms);
      else if (command.op === "ratify") session.castUnionRatificationBallot(command.campaignId, command.vote);
    };
    const { rerender } = render(<UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />);
    const refresh = () => rerender(<UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />);
    const playerUnion = screen.getByTestId(`union-${unionId}`);

    await user.click(within(playerUnion).getByRole("button", { name: "Escalate to overtime ban" }));
    refresh();
    expect(within(playerUnion).getByText(/industrial action overtime ban/)).toBeTruthy();
    session.advance();
    refresh();
    await user.click(within(playerUnion).getByRole("button", { name: "Escalate to selective strike" }));
    refresh();
    expect(within(playerUnion).getByRole("button", { name: /currently on strike/ })).toBeTruthy();
    await user.click(within(playerUnion).getByRole("button", { name: "Withdraw bargaining" }));
    expect(commands.filter((command) => command.op === "move").map((command) => command.op === "move" ? command.action : "")).toEqual(["escalate", "escalate", "withdraw"]);
    expect(session.unionBargaining().campaigns[0]?.status).toBe("withdrawn");
  }, 15_000);

  it("casts the player's weighted ratification ballot and settles through the session", async () => {
    const user = userEvent.setup();
    const world = createWorld({ seed: "union-panel-ratification", playerName: "Alex", countryId: "US", era: "1953" });
    const union = world.unions[unionId]!;
    union.ownerType = "player";
    union.ownerId = "player";
    union.strength = 100;
    union.treasury = 100_000;
    for (const asset of Object.values(corporateSectorAssets(world))) {
      if (asset.representingUnionId === unionId) asset.unionization = 80;
    }
    const organizerId = `${unionId}:player`;
    world.unionOrganizers = { ...(world.unionOrganizers ?? {}), [organizerId]: { id: organizerId, unionId, characterId: "player", strength: 100, organizeCount: 10, createdAtTurn: world.meta.turn, updatedAtTurn: world.meta.turn } };
    const campaign = openBargainingCampaignAction(world, {
      unionId,
      employerCorporationId: unionId,
      terms: { wageLevel: 1.05, agreementDurationTurns: 48, noStrikeTurns: 24 },
      turn: world.meta.turn,
    });
    campaign.currentOffer.proposedBy = "employer";
    campaign.ratification = {
      offerRevision: campaign.currentOffer.revision,
      status: "open",
      openedAtTurn: world.meta.turn,
      closesAtTurn: world.meta.turn + 3,
      closedAtTurn: null,
      weights: [{ characterId: "player", strength: 100 }],
      totalStrength: 100,
    };
    const session = new GameSession();
    session.load(serializeSave(world, "2026-10-01T00:00:00Z"));
    const dispatch = (command: Extract<GameCommand, { type: "unionCommand" }>) => {
      if (command.op === "ratify") session.castUnionRatificationBallot(command.campaignId, command.vote);
    };
    const { rerender } = render(<UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />);
    const refresh = () => rerender(<UnionManagementPanel state={session.unionManagement()} busy={false} onCommand={dispatch} />);
    const playerUnion = screen.getByTestId(`union-${unionId}`);

    await user.click(within(playerUnion).getByRole("button", { name: "Vote to ratify offer" }));
    refresh();
    expect(session.unionBargaining().agreements).toHaveLength(1);
    expect(session.unionBargaining().campaigns[0]?.ratification?.status).toBe("ratified");
    expect(within(playerUnion).getByText(/Active agreement with US-manufacturing/)).toBeTruthy();
  }, 15_000);
});
