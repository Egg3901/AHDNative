import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { GameSession } from "./session";

const options = { era: "1953", countryId: "US", seed: "native-politics-v1", playerName: "Alex" };
const SAVED_AT = "2026-09-10T00:00:00.000Z";
const DEM = "US_DEM";
const REP = "US_REP";

function freshPolitics() {
  const session = new GameSession(); session.create(options); return session.politics();
}

describe("projectPolitics", () => {
  it("exposes country parties with ideology, tier, org and member roster", () => {
    const politics = freshPolitics();
    expect(politics.countryId).toBe("US");
    expect(politics.countryName).toMatch(/united states/i);
    expect(politics.playerPartyId).toBeNull();
    expect(politics.parties.map((p) => p.id).sort()).toEqual([DEM, REP]);
    const dem = politics.parties.find((p) => p.id === DEM)!;
    expect(dem).toMatchObject({ name: "Democratic Party", tier: "major", isPlayerParty: false });
    expect(typeof dem.economicPosition).toBe("number");
    expect(typeof dem.socialPosition).toBe("number");
    expect(typeof dem.organization).toBe("number");
    expect(typeof dem.politicalStrength).toBe("number");
    expect(dem.memberNames.length).toBeGreaterThan(0);
    expect(dem.join).toMatchObject({ id: "joinParty", available: true });
    expect(dem.leave).toMatchObject({ id: "leaveParty", available: false, disabledReason: "You are independent." });
  });

  it("marks the player party after joining and gates per party actions", () => {
    const session = new GameSession();
    session.create(options);
    expect(session.act("joinParty", { partyId: DEM }).ok).toBe(true);
    const politics = session.politics();
    expect(politics.playerPartyId).toBe(DEM);
    const dem = politics.parties.find((p) => p.id === DEM)!;
    expect(dem.isPlayerParty).toBe(true);
    expect(dem.join).toMatchObject({ available: false, disabledReason: "You are already a member of this party." });
    expect(dem.leave).toMatchObject({ id: "leaveParty", available: true });
    const rep = politics.parties.find((p) => p.id === REP)!;
    expect(rep.isPlayerParty).toBe(false);
    expect(rep.leave).toMatchObject({ available: false, disabledReason: "You are not a member of this party." });
  });

  it("starts with no elections and mirrors the session candidacy gate once races exist", () => {
    expect(freshPolitics().elections).toEqual([]);
    const session = new GameSession();
    const raw = gunzipSync(readFileSync(new URL("../../fixtures/career-t95-1953-US.save.json.gz", import.meta.url))).toString("utf8");
    session.load(raw);
    const politics = session.politics();
    const legacy = session.view().elections;
    expect(politics.elections.length).toBeGreaterThan(0);
    expect(politics.elections.map((e) => e.id)).toEqual(legacy.map((e) => e.id));
    for (const election of politics.elections) {
      const old = legacy.find((e) => e.id === election.id)!;
      expect(election.candidacy).toEqual(old.candidacy);
      expect(election.playerCandidate).toBe(old.playerCandidate);
      expect(election.winnerNames).toEqual(old.winnerNames);
    }
  });

  it("reports only tally backed vote data, never campaign strength as share", () => {
    const session = new GameSession();
    const raw = gunzipSync(readFileSync(new URL("../../fixtures/career-t95-1953-US.save.json.gz", import.meta.url))).toString("utf8");
    session.load(raw);
    const politics = session.politics();
    expect(politics.elections.length).toBeGreaterThan(0);
    for (const election of politics.elections) {
      if (election.totalVotes == null) {
        expect(election.candidates.every((c) => c.votes == null && c.voteShare == null)).toBe(true);
      } else {
        expect(election.candidates.reduce((n, c) => n + (c.votes ?? 0), 0)).toBe(election.totalVotes);
      }
    }
  });

  it("lists country politicians with actual engine fields", () => {
    const politics = freshPolitics();
    expect(politics.politicians.length).toBeGreaterThan(0);
    expect(politics.politicians.every((p) => p.partyName.length > 0)).toBe(true);
    const sample = politics.politicians[0]!;
    expect(sample.name.length).toBeGreaterThan(0);
    expect(typeof sample.age).toBe("number");
    expect(typeof sample.economic).toBe("number");
    expect(typeof sample.social).toBe("number");
    expect(typeof sample.influence).toBe("number");
    expect(typeof sample.favorability).toBe("number");
    expect(typeof sample.infamy).toBe("number");
    expect(Array.isArray(sample.activeRaceIds)).toBe(true);
  });
});

it('keeps detailed politics out of routine world updates', () => {
  const session = new GameSession();
  const view = session.create(options);
  expect(view).not.toHaveProperty('politics');
  expect(session.politics().parties.length).toBeGreaterThan(0);
});

it('shows the engine party-switch cooldown after leaving a party', () => {
  const session = new GameSession();
  session.create({ era: '1953', countryId: 'US', playerName: 'Alex', seed: 'party-gates' });
  expect(session.act('joinParty', { partyId: 'US_DEM' }).ok).toBe(true);
  expect(session.act('leaveParty').ok).toBe(true);
  const party = session.politics().parties.find(p => p.id === 'US_REP')!;
  expect(party.join.available).toBe(false);
  expect(party.join.disabledReason).toMatch(/switch cooldown/i);
});

it("includes the player's current party membership in the recorded roster across save and leave", () => {
  const session = new GameSession();
  session.create({ ...options, playerName: "Roster Player" });
  expect(session.act("joinParty", { partyId: DEM }).ok).toBe(true);
  expect(session.politics().parties.find(party => party.id === DEM)!.memberNames).toContain("Roster Player");
  const resumed = new GameSession();
  resumed.load(session.serialize(SAVED_AT));
  expect(resumed.politics().parties.find(party => party.id === DEM)!.memberNames).toContain("Roster Player");
  expect(resumed.act("leaveParty").ok).toBe(true);
  expect(resumed.politics().parties.find(party => party.id === DEM)!.memberNames).not.toContain("Roster Player");
});
