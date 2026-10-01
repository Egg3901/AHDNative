import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { corporateSectorAssets, createWorld, openBargainingCampaignAction, serializeSave } from "@ahdclient/engine";
import { GameSession } from "../game/session";
import type { GameCommand } from "../game/protocol";
import { UnionManagementPanel } from "./UnionManagementPanel";

const unionId = "US-manufacturing";

describe("UnionManagementPanel", () => {
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
    refresh();
    await user.clear(within(union).getByRole("spinbutton", { name: "Annual dues per member for United Steelworkers" }));
    await user.type(within(union).getByRole("spinbutton", { name: "Annual dues per member for United Steelworkers" }), "100000");
    await user.click(within(union).getByRole("button", { name: "Set annual dues" }));
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
    expect(commands.filter((command) => command.op === "organizeSector")).toHaveLength(7);
    expect(commands.find((command) => command.op === "call")).toMatchObject({ op: "call", unionId, employerId: unionId });
    expect(session.unionBargaining().campaigns).toHaveLength(1);
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
