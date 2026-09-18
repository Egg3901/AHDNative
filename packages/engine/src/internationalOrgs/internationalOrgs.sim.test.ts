/**
 * Issue #113 — international organization dues, resolutions, leadership and
 * sanctions. Everything here drives the engine through the PUBLIC boundary:
 * createWorld -> advanceTurn (so the registered phase runs in pipeline order) ->
 * serializeSave/deserializeSave. The few direct calls to the exported
 * runInternationalOrganizationsTurn exist only to read the reference-shaped
 * report object (TurnPhase.run returns void).
 *
 * Reference: AHDGame e364c04954ed628beef73a993a8e9e156650a31e
 *   src/lib/turn/internationalOrganizationsPhase.ts
 *   src/lib/internationalOrganizations/{resolutionRules,organizationFund,orgMembership,sanctions}.ts
 *   src/lib/constants/internationalOrganizations.ts
 */
import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { deserializeSave, serializeSave } from "../save.js";
import {
  ballotIsPlayerOnly,
  ballotPasses,
  dedupeOrganizationVotes,
  requiresUnanimity,
  resolutionPasses,
  votesNeeded,
} from "./resolutionRules.js";
import { orgTributeRateAnnual, DEFAULT_ORG_DUES_RATE_ANNUAL, ORG_PROPOSAL_VOTING_TURNS } from "./constants.js";
import { memberDueUsd, clampDuesRate } from "./fund.js";
import { buildOrganizationSanctionEmbargoes } from "./sanctions.js";
import { computeOrgDerived } from "./derived.js";
import { runInternationalOrganizationsTurn } from "./phases.js";
import { castOrgVote, leaveOrg, proposeOrgMembership, proposeOrgResolution, standForOrgLeadership } from "./actions.js";
import type { WorldState } from "../types.js";
import type { OrgVoteValue } from "./types.js";

const OPTS = { seed: "intl-orgs-113", playerName: "Tester", countryId: "US", era: "1953" } as const;

function fresh(): WorldState {
  return createWorld(OPTS);
}

/** Force a ballot to close on the current turn, so the next advanceTurn resolves it. */
function closeNow(world: WorldState, ballot: { closesOnTurn: number }): void {
  ballot.closesOnTurn = world.meta.turn;
}

function vote(world: WorldState, orgId: string, kind: "proposal" | "resolution" | "election", ballotId: string, countryId: string, v: OrgVoteValue): void {
  const res = castOrgVote(world, { orgId, kind, ballotId, countryId, vote: v });
  if (!res.ok) throw new Error(res.error);
}

// ── Rules (verbatim port) ───────────────────────────────────────────────────

describe("#113 resolutionRules — verbatim port of resolutionRules.ts", () => {
  it("votesNeeded: unanimous kinds take the whole roll, others take a majority", () => {
    expect(votesNeeded("join_conflict", 4)).toBe(4);
    expect(votesNeeded("free_trade_agreement", 2)).toBe(2);
    expect(votesNeeded("membership_proposal", 3)).toBe(3);
    expect(votesNeeded("sanctions", 4)).toBe(3);
    expect(votesNeeded("leadership_election", 2)).toBe(2);
  });

  it("requiresUnanimity / ballotIsPlayerOnly classify exactly as the reference", () => {
    expect(requiresUnanimity("free_trade_agreement")).toBe(true);
    expect(requiresUnanimity("membership_proposal")).toBe(true);
    expect(requiresUnanimity("sanctions")).toBe(false);
    expect(ballotIsPlayerOnly("membership_proposal")).toBe(true);
    expect(ballotIsPlayerOnly("join_conflict")).toBe(true);
    expect(ballotIsPlayerOnly("free_trade_agreement")).toBe(false);
  });

  it("ballotPasses blocks an empty roll; dedupe keeps the latest vote per country", () => {
    expect(ballotPasses("membership_proposal", 0, 0)).toBe(false);
    const folded = dedupeOrganizationVotes([
      { countryId: "US", vote: "yes" as const, castOnTurn: 1 },
      { countryId: "UK", vote: "yes" as const, castOnTurn: 1 },
      { countryId: "US", vote: "no" as const, castOnTurn: 2 },
    ]);
    expect(folded).toHaveLength(2);
    expect(folded.find((v) => v.countryId === "US")?.vote).toBe("no");
  });

  it("resolutionPasses: FTA needs unanimous parties; UN permanent-member 'no' vetoes", () => {
    expect(
      resolutionPasses({
        type: "free_trade_agreement",
        members: ["US", "UK", "FR"],
        parties: ["US", "UK"],
        votes: [{ countryId: "US", vote: "yes", castOnTurn: 1 }, { countryId: "UK", vote: "abstain", castOnTurn: 1 }],
      }),
    ).toBe(false);
    expect(
      resolutionPasses({
        type: "sanctions",
        members: ["US", "UK", "FR", "RU"],
        parties: [],
        votes: [
          { countryId: "UK", vote: "yes", castOnTurn: 1 },
          { countryId: "FR", vote: "yes", castOnTurn: 1 },
          { countryId: "RU", vote: "yes", castOnTurn: 1 },
          { countryId: "US", vote: "no", castOnTurn: 1 },
        ],
        permanentMembers: ["US", "UK", "DE", "JP"],
      }),
    ).toBe(false);
  });
});

describe("#113 fund + sanctions + derived (source formulas)", () => {
  it("memberDueUsd = gdpUsd * rate / 48; 0 unless both are positive; clampDuesRate band [0, 0.01]", () => {
    expect(memberDueUsd(0, 0.00006)).toBe(0);
    expect(memberDueUsd(1_000_000, 0)).toBe(0);
    expect(memberDueUsd(1_000_000, 0.00006)).toBeCloseTo((1_000_000 * 0.00006) / 48, 12);
    expect(clampDuesRate(-1)).toBe(0);
    expect(clampDuesRate(5)).toBe(0.01);
    expect(clampDuesRate(Number.NaN)).toBe(DEFAULT_ORG_DUES_RATE_ANNUAL);
  });

  it("orgTributeRateAnnual: NATO 0.005 / WARSAW_PACT 0.0075 only in the 1953 preset", () => {
    expect(orgTributeRateAnnual("NATO", "1953-default")).toBe(0.005);
    expect(orgTributeRateAnnual("WARSAW_PACT", "1953-default")).toBe(0.0075);
    expect(orgTributeRateAnnual("UN", "1953-default")).toBe(0);
    expect(orgTributeRateAnnual("NATO", "1979-default")).toBe(0);
  });

  it("buildOrganizationSanctionEmbargoes: every member except the target, org origin, block/both", () => {
    const rows = buildOrganizationSanctionEmbargoes({
      resolutionId: "r1",
      targetCountryId: "RU",
      commodity: "all",
      members: ["US", "UK", "RU"],
      currentTurn: 5,
      expiresTurn: 53,
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sourceCountry)).toEqual(["US", "UK"]);
    expect(rows[0]).toMatchObject({ targetCountry: "RU", direction: "both", mode: "block", origin: "organization", createdTurn: 5, expiresTurn: 53, sourceResolutionId: "r1" });
  });

  it("computeOrgDerived: largest member influenceIndex 100, small member proportional", () => {
    const d = computeOrgDerived(
      [
        { countryId: "US", gdpMillions: 387000 },
        { countryId: "IE", gdpMillions: 952 },
      ],
      "IE",
    );
    expect(d.members.find((m) => m.countryId === "US")?.influenceIndex).toBe(100);
    expect(d.members.find((m) => m.countryId === "IE")?.influenceIndex).toBe(0); // 952/387000 rounds to 0
    expect(d.yourInfluence).toBe(0);
  });
});

// ── Registration + ordering through advanceTurn ─────────────────────────────

describe("#113 phase registration at the reference ordering", () => {
  it("advanceTurn runs internationalOrganizations before nuclearProduction/warsTurn and before newsMaintenance", () => {
    const world = fresh();
    const report = advanceTurn(world);
    const names = report.phaseTimings.map((p) => p.name);
    const at = (n: string) => names.indexOf(n);
    expect(at("internationalOrganizations")).toBeGreaterThanOrEqual(0);
    expect(at("internationalOrganizations")).toBeLessThan(at("nuclearProduction"));
    expect(at("internationalOrganizations")).toBeLessThan(at("warsTurn"));
    expect(at("internationalOrganizations")).toBeLessThan(at("coldWarTension"));
    expect(names[names.length - 1]).toBe("newsMaintenance");
  });

  it("seeds UN and NATO, then lazily materializes the runtime state on the first turn", () => {
    const world = fresh();
    expect(world.internationalOrgs["UN"]!.members.sort()).toEqual(["BR", "FR", "GR", "RU", "TR", "UK", "US"]);
    expect(world.internationalOrgs["NATO"]!.members.sort()).toEqual(["FR", "GR", "IT", "TR", "UK", "US"]);
    // Seed shape unchanged until the phase first runs.
    expect(world.internationalOrgs["UN"]!.fund).toBeUndefined();
    advanceTurn(world);
    const un = world.internationalOrgs["UN"]!;
    expect(un.leadership).toBeDefined();
    expect(un.fund!.duesRateAnnual).toBe(DEFAULT_ORG_DUES_RATE_ANNUAL);
    expect(un.resolutions).toEqual([]);
  });
});

// ── Contributions (dues + tribute) ──────────────────────────────────────────

describe("#113 dues and tribute", () => {
  it("charges UN dues from every priced member's treasury into the fund (unmatched members skipped)", () => {
    const world = fresh();
    const usBefore = world.budgets["US"]!.treasuryBalance;
    const ukBefore = world.budgets["UK"]!.treasuryBalance;
    const ruBefore = world.budgets["RU"]!.treasuryBalance;
    // FR/BR/TR/GR are UN members with NO budget row (macro members) — they must be skipped.
    expect(world.budgets["FR"]).toBeUndefined();

    const report = runInternationalOrganizationsTurn(world);

    expect(report.duesCharged).toBe(2); // UN + NATO both have priced dues payers
    expect(world.budgets["US"]!.treasuryBalance).toBeLessThan(usBefore);
    expect(world.budgets["UK"]!.treasuryBalance).toBeLessThan(ukBefore);
    expect(world.budgets["RU"]!.treasuryBalance).toBeLessThan(ruBefore);
    expect(world.internationalOrgs["UN"]!.fund!.balance).toBeGreaterThan(0);
  });

  it("NATO tribute is charged outside the voter roll, and doubles as gate-off no-op in a non-1953 world", () => {
    const world = fresh();
    const report1953 = runInternationalOrganizationsTurn(world);
    expect(report1953.tributeCharged).toBe(1); // NATO levies tribute; UN does not

    // The reference gate: orgTributeRateAnnual is 0 unless the world began at
    // 1953-default. Same world, era re-labelled — tribute must vanish.
    const world1979 = fresh();
    world1979.meta.era = "1979";
    const report1979 = runInternationalOrganizationsTurn(world1979);
    expect(report1979.tributeCharged).toBe(0);
    expect(report1979.duesCharged).toBe(report1953.duesCharged); // dues unaffected
  });

  it("is a no-op for ballots in a fresh world (nothing pending resolves)", () => {
    const world = fresh();
    const report = runInternationalOrganizationsTurn(world);
    expect(report.organizationsFounded).toBe(0);
    expect(report.proposalsResolved).toBe(0);
    expect(report.legislationResolved).toBe(0);
    expect(report.electionsResolved).toBe(0);
    expect(report.sanctionsExpired).toBe(0);
  });
});

// ── Membership, resolutions, leadership — through advanceTurn ───────────────

describe("#113 membership admission resolves at the close turn", () => {
  it("admits DD to NATO when every voting member votes yes", () => {
    const world = fresh();
    const res = proposeOrgMembership(world, { orgId: "NATO", countryId: "DD" });
    if (!res.ok) throw new Error(res.error);
    vote(world, "NATO", "proposal", res.proposalId, "US", "yes");
    vote(world, "NATO", "proposal", res.proposalId, "UK", "yes");
    closeNow(world, world.internationalOrgs["NATO"]!.membershipProposals!.find((p) => p.id === res.proposalId)!);

    // Not yet resolved before the close turn.
    const before = world.internationalOrgs["NATO"]!.membershipProposals!.find((p) => p.id === res.proposalId)!;
    expect(before.status).toBe("pending");

    advanceTurn(world);
    expect(world.internationalOrgs["NATO"]!.members.includes("DD")).toBe(true);
    expect(world.internationalOrgs["NATO"]!.membershipProposals!.find((p) => p.id === res.proposalId)!.status).toBe("approved");
  });

  it("rejects when a voting member withholds consent (unanimity)", () => {
    const world = fresh();
    const res = proposeOrgMembership(world, { orgId: "UN", countryId: "DD" });
    if (!res.ok) throw new Error(res.error);
    vote(world, "UN", "proposal", res.proposalId, "US", "yes"); // only 1 of {US,UK,RU}
    closeNow(world, world.internationalOrgs["UN"]!.membershipProposals!.find((p) => p.id === res.proposalId)!);
    advanceTurn(world);
    expect(world.internationalOrgs["UN"]!.members.includes("DD")).toBe(false);
    expect(world.internationalOrgs["UN"]!.membershipProposals!.find((p) => p.id === res.proposalId)!.status).toBe("rejected");
  });

  it("opens a 24-turn voting window and resolves only once the close turn is reached", () => {
    const world = fresh();
    const res = proposeOrgMembership(world, { orgId: "NATO", countryId: "DD" });
    if (!res.ok) throw new Error(res.error);
    const proposal = world.internationalOrgs["NATO"]!.membershipProposals!.find((p) => p.id === res.proposalId)!;
    expect(proposal.closesOnTurn).toBe(ORG_PROPOSAL_VOTING_TURNS); // 24-turn window (reference constant)
    vote(world, "NATO", "proposal", res.proposalId, "US", "yes");
    vote(world, "NATO", "proposal", res.proposalId, "UK", "yes");
    // Bring the close turn nearer; the resolver must not act while it is future.
    proposal.closesOnTurn = world.meta.turn + 3;
    advanceTurn(world);
    advanceTurn(world);
    expect(world.internationalOrgs["NATO"]!.members.includes("DD")).toBe(false);
    advanceTurn(world); // closesOnTurn reached
    expect(world.internationalOrgs["NATO"]!.members.includes("DD")).toBe(true);
  });
});

describe("#113 resolutions: sanctions + set_dues", () => {
  it("a passed sanctions resolution enacts org embargoes, then expires and lifts them", () => {
    const world = fresh();
    const proposed = proposeOrgResolution(world, {
      orgId: "NATO",
      countryId: "US",
      type: "sanctions",
      title: "Sanction on RU",
      sanctionsTargetCountryId: "RU",
      sanctionsCommodity: "all",
    });
    if (!proposed.ok) throw new Error(proposed.error);
    vote(world, "NATO", "resolution", proposed.resolution.id, "US", "yes");
    vote(world, "NATO", "resolution", proposed.resolution.id, "UK", "yes");
    closeNow(world, proposed.resolution);

    advanceTurn(world);
    const org = world.internationalOrgs["NATO"]!;
    const enacted = org.resolutions!.find((r) => r.id === proposed.resolution.id)!;
    expect(enacted.status).toBe("active");
    // NATO members US/UK/FR/IT/TR/GR, target RU -> 6 embargoes.
    expect(org.embargoes).toHaveLength(6);
    expect(org.embargoes!.every((e) => e.targetCountry === "RU" && e.origin === "organization")).toBe(true);
    expect(enacted.sanctionsExpiresOnTurn).toBe(world.meta.turn + 48); // SANCTIONS_DURATION_TURNS

    // Fast-forward the term to now and advance one turn: expiry lifts the
    // embargoes and terminates the resolution.
    enacted.sanctionsExpiresOnTurn = world.meta.turn;
    advanceTurn(world);
    expect(org.embargoes).toHaveLength(0);
    expect(enacted.status).toBe("terminated");
  });

  it("a rejected resolution changes no state (majority shortfall)", () => {
    const world = fresh();
    const proposed = proposeOrgResolution(world, {
      orgId: "NATO",
      countryId: "US",
      type: "sanctions",
      title: "Sanction on RU",
      sanctionsTargetCountryId: "RU",
      sanctionsCommodity: "all",
    });
    if (!proposed.ok) throw new Error(proposed.error);
    vote(world, "NATO", "resolution", proposed.resolution.id, "US", "yes"); // 1 of 2 -> no majority
    closeNow(world, proposed.resolution);
    advanceTurn(world);
    expect(proposed.resolution.status).toBe("rejected");
    expect(world.internationalOrgs["NATO"]!.embargoes).toHaveLength(0);
  });

  it("a passed set_dues resolution clamps and stores the fund rate", () => {
    const world = fresh();
    const proposed = proposeOrgResolution(world, {
      orgId: "NATO",
      countryId: "US",
      type: "set_dues",
      title: "Raise dues",
      duesRateAnnual: 99, // clamps to MAX 0.01
    });
    if (!proposed.ok) throw new Error(proposed.error);
    vote(world, "NATO", "resolution", proposed.resolution.id, "US", "yes");
    vote(world, "NATO", "resolution", proposed.resolution.id, "UK", "yes");
    closeNow(world, proposed.resolution);
    advanceTurn(world);
    expect(world.internationalOrgs["NATO"]!.fund!.duesRateAnnual).toBe(0.01);
  });
});

describe("#113 leadership elections", () => {
  it("a majority of the voting roll seats the chair and sets the term", () => {
    const world = fresh();
    const res = standForOrgLeadership(world, { orgId: "NATO", countryId: "US", candidateName: "Dean Acheson" });
    if (!res.ok) throw new Error(res.error);
    vote(world, "NATO", "election", res.electionId, "US", "yes");
    vote(world, "NATO", "election", res.electionId, "UK", "yes");
    closeNow(world, world.internationalOrgs["NATO"]!.leadershipElections!.find((e) => e.id === res.electionId)!);
    advanceTurn(world);
    const lead = world.internationalOrgs["NATO"]!.leadership!;
    expect(lead.holderCountryId).toBe("US");
    expect(lead.holderName).toBe("Dean Acheson");
    expect(lead.termEndsOnTurn).toBe(world.meta.turn + 96);
  });

  it("a shortfall leaves the seat unchanged", () => {
    const world = fresh();
    const res = standForOrgLeadership(world, { orgId: "NATO", countryId: "UK", candidateName: "Lord Ismay" });
    if (!res.ok) throw new Error(res.error);
    vote(world, "NATO", "election", res.electionId, "US", "yes"); // 1 of 2 -> fails
    closeNow(world, world.internationalOrgs["NATO"]!.leadershipElections!.find((e) => e.id === res.electionId)!);
    advanceTurn(world);
    expect(world.internationalOrgs["NATO"]!.leadership!.holderCountryId).toBeNull();
    expect(world.internationalOrgs["NATO"]!.leadershipElections!.find((e) => e.id === res.electionId)!.status).toBe("rejected");
  });
});

// ── Action validation: membership / authority / cost / status ───────────────

describe("#113 actions validate membership, authority, cost and status", () => {
  it("rejects a non-member and a non-voting member as proposer", () => {
    const world = fresh();
    expect(proposeOrgResolution(world, { orgId: "NATO", countryId: "RU", type: "sanctions", title: "x", sanctionsTargetCountryId: "US", sanctionsCommodity: "all" })).toEqual({ ok: false, error: "RU is not a member of NATO" });
    // FR is a NATO member but not playable -> no vote/authority in Native's roll.
    expect(proposeOrgResolution(world, { orgId: "NATO", countryId: "FR", type: "sanctions", title: "x", sanctionsTargetCountryId: "RU", sanctionsCommodity: "all" })).toEqual({ ok: false, error: "FR has no vote in NATO" });
  });

  it("rejects when the acting country is out of actions (cost)", () => {
    const world = fresh();
    world.player.actions = 0;
    const res = proposeOrgResolution(world, { orgId: "NATO", countryId: "US", type: "set_dues", title: "Raise dues", duesRateAnnual: 0.0001 });
    expect(res).toEqual({ ok: false, error: "US has no actions left" });
  });

  it("rejects a duplicate live proposal and a vote on a resolved ballot (status)", () => {
    const world = fresh();
    const first = proposeOrgResolution(world, { orgId: "NATO", countryId: "US", type: "set_dues", title: "Raise dues", duesRateAnnual: 0.0001 });
    expect(first.ok).toBe(true);
    const dup = proposeOrgResolution(world, { orgId: "NATO", countryId: "US", type: "set_dues", title: "Raise dues again", duesRateAnnual: 0.0002 });
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error("expected duplicate rejection");
    expect(dup.error).toMatch(/already has a pending/);

    if (!first.ok) throw new Error(first.error);
    closeNow(world, first.resolution);
    world.player.actions = 5;
    vote(world, "NATO", "resolution", first.resolution.id, "US", "yes");
    vote(world, "NATO", "resolution", first.resolution.id, "UK", "yes");
    advanceTurn(world);
    expect(first.resolution.status).toBe("active");
    const lateVote = castOrgVote(world, { orgId: "NATO", kind: "resolution", ballotId: first.resolution.id, countryId: "US", vote: "no" });
    expect(lateVote).toEqual({ ok: false, error: `resolution ballot ${first.resolution.id} is not pending` });
  });
});

describe("#113 withdrawal: leaveOrg validates and cleans up like removeOrganizationMembership", () => {
  it("rejects an unknown org, a non-member, and a player with no actions left", () => {
    const world = fresh();
    expect(leaveOrg(world, { orgId: "NOPE", countryId: "US" })).toEqual({ ok: false, error: "Unknown organization NOPE" });
    expect(leaveOrg(world, { orgId: "NATO", countryId: "DD" })).toEqual({ ok: false, error: "DD is not a member of NATO" });
    world.player.actions = 0;
    expect(leaveOrg(world, { orgId: "NATO", countryId: "US" })).toEqual({ ok: false, error: "US has no actions left" });
    expect(world.internationalOrgs["NATO"]!.members.includes("US")).toBe(true);
  });

  it("vacates the chair, rejects the leaver's pending election, and records news", () => {
    const world = fresh();
    const first = standForOrgLeadership(world, { orgId: "NATO", countryId: "UK", candidateName: "Anthony Eden" });
    if (!first.ok) throw new Error(first.error);
    vote(world, "NATO", "election", first.electionId, "US", "yes");
    vote(world, "NATO", "election", first.electionId, "UK", "yes");
    closeNow(world, world.internationalOrgs["NATO"]!.leadershipElections!.find((e) => e.id === first.electionId)!);
    advanceTurn(world);
    expect(world.internationalOrgs["NATO"]!.leadership!.holderCountryId).toBe("UK");

    const second = standForOrgLeadership(world, { orgId: "NATO", countryId: "UK", candidateName: "Anthony Eden" });
    if (!second.ok) throw new Error(second.error);

    const left = leaveOrg(world, { orgId: "NATO", countryId: "UK" });
    expect(left).toEqual({ ok: true });
    const org = world.internationalOrgs["NATO"]!;
    expect(org.members.includes("UK")).toBe(false);
    expect(org.leadership!.holderCountryId).toBeNull();
    expect(org.leadershipElections!.find((e) => e.id === first.electionId)!.status).toBe("elected");
    expect(org.leadershipElections!.find((e) => e.id === second.electionId)!.status).toBe("rejected");
    expect(world.news[world.news.length - 1]!.headline).toBe("United Kingdom withdrew from North Atlantic Treaty Organization.");
  });

  it("strips the leaver from surviving agreements and terminates the rest", () => {
    const world = fresh();
    const big = proposeOrgResolution(world, { orgId: "NATO", countryId: "US", type: "free_trade_agreement", title: "Big FTA", parties: ["US", "UK", "FR"] });
    if (!big.ok) throw new Error(big.error);
    const small = proposeOrgResolution(world, { orgId: "NATO", countryId: "UK", type: "free_trade_agreement", title: "Small FTA", parties: ["UK", "US"] });
    if (!small.ok) throw new Error(small.error);

    const left = leaveOrg(world, { orgId: "NATO", countryId: "UK" });
    expect(left).toEqual({ ok: true });
    expect(big.resolution.parties).toEqual(["US", "FR"]);
    expect(big.resolution.status).toBe("pending");
    expect(small.resolution.parties).toEqual(["UK", "US"]);
    expect(small.resolution.status).toBe("terminated");
    expect(small.resolution.terminatedOnTurn).toBe(world.meta.turn);
  });

  it("shrinks the voting roll at the close turn and survives save/reload", () => {
    const world = fresh();
    expect(leaveOrg(world, { orgId: "NATO", countryId: "UK" })).toEqual({ ok: true });
    // NATO's voting roll is now just the US: one yes carries unanimously.
    const app = proposeOrgMembership(world, { orgId: "NATO", countryId: "DD" });
    if (!app.ok) throw new Error(app.error);
    vote(world, "NATO", "proposal", app.proposalId, "US", "yes");
    closeNow(world, world.internationalOrgs["NATO"]!.membershipProposals!.find((p) => p.id === app.proposalId)!);
    advanceTurn(world);
    expect(world.internationalOrgs["NATO"]!.members.includes("DD")).toBe(true);

    const loaded = deserializeSave(serializeSave(world, "2026-09-10T00:00:00.000Z"));
    expect(loaded.internationalOrgs).toEqual(world.internationalOrgs);
    expect(loaded.internationalOrgs["NATO"]!.members.includes("UK")).toBe(false);
  });
});

// ── Founding (auto-found empty when the year arrives) ───────────────────────

describe("#113 founding", () => {
  it("founds NON_ALIGNED empty once the live year reaches 1961 in a 1953 world", () => {
    const world = fresh();
    expect(world.internationalOrgs["NON_ALIGNED"]).toBeUndefined();
    world.meta.date = "1961-01-03";
    advanceTurn(world);
    const na = world.internationalOrgs["NON_ALIGNED"];
    expect(na).toBeDefined();
    expect(na!.members).toEqual([]); // founding NEVER seats members
    // An org whose founding year has not arrived is not created.
    expect(world.internationalOrgs["EU"]).toBeUndefined();
  });
});

// ── Determinism + save/reload ───────────────────────────────────────────────

describe("#113 determinism through save/reload", () => {
  it("two identical seeds with an identical ballot stream stay byte-identical", () => {
    const a = fresh();
    const b = fresh();
    for (const w of [a, b]) {
      const proposed = proposeOrgResolution(w, { orgId: "NATO", countryId: "US", type: "sanctions", title: "Sanction on RU", sanctionsTargetCountryId: "RU", sanctionsCommodity: "all" });
      if (!proposed.ok) throw new Error(proposed.error);
      vote(w, "NATO", "resolution", proposed.resolution.id, "US", "yes");
      vote(w, "NATO", "resolution", proposed.resolution.id, "UK", "yes");
      closeNow(w, proposed.resolution);
    }
    for (let i = 0; i < 6; i++) {
      advanceTurn(a);
      advanceTurn(b);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("a mid-campaign save resumes to the same world as an unbroken run", () => {
    const live = fresh();
    const proposed = proposeOrgMembership(live, { orgId: "NATO", countryId: "DD" });
    if (!proposed.ok) throw new Error(proposed.error);
    vote(live, "NATO", "proposal", proposed.proposalId, "US", "yes");
    vote(live, "NATO", "proposal", proposed.proposalId, "UK", "yes");
    advanceTurn(live);
    advanceTurn(live);

    const resumed = deserializeSave(serializeSave(live, "2026-09-10T00:00:00.000Z"));

    advanceTurn(live);
    advanceTurn(live);
    advanceTurn(resumed);
    advanceTurn(resumed);

    expect(JSON.stringify(resumed)).toBe(JSON.stringify(live));
    // And the org state survives the round-trip intact.
    expect(resumed.internationalOrgs["NATO"]!.fund).toEqual(live.internationalOrgs["NATO"]!.fund);
    expect(resumed.internationalOrgs["UN"]!.embargoes).toBeDefined();
  });

  it("serialize/deserialize is lossless for org runtime state", () => {
    const world = fresh();
    const proposed = proposeOrgResolution(world, { orgId: "NATO", countryId: "US", type: "sanctions", title: "S", sanctionsTargetCountryId: "RU", sanctionsCommodity: "all" });
    if (!proposed.ok) throw new Error(proposed.error);
    vote(world, "NATO", "resolution", proposed.resolution.id, "US", "yes");
    vote(world, "NATO", "resolution", proposed.resolution.id, "UK", "yes");
    advanceTurn(world); // window not reached, but runtime state now exists
    const loaded = deserializeSave(serializeSave(world, "2026-09-10T00:00:00.000Z"));
    expect(loaded.internationalOrgs).toEqual(world.internationalOrgs);
  });
});
