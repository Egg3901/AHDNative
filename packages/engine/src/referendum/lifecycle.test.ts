import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { advanceTurn } from "../engine.js";
import { resolveReferendumVote, runReferendumLifecycle } from "./lifecycle.js";
import { referendumYesShare } from "./cohort.js";
import { seededVariance } from "./seededVariance.js";
import type { ReferendumRecord } from "./types.js";

const OPTS = {
  seed: "referendum-test",
  playerName: "Tester",
  countryId: "US",
  era: "1953",
} as const;

describe("resolveReferendumVote (W25, verbatim port)", () => {
  it("passes above 50% and fails at/below, after variance swing", () => {
    const passes = resolveReferendumVote({ yesShare: 60, varianceRoll: 0 });
    expect(passes.passed).toBe(true);
    expect(passes.finalYesShare).toBe(60);

    const fails = resolveReferendumVote({ yesShare: 40, varianceRoll: 0 });
    expect(fails.passed).toBe(false);

    const atThreshold = resolveReferendumVote({
      yesShare: 50,
      varianceRoll: 0,
    });
    expect(atThreshold.passed).toBe(false); // strictly > 50
  });

  it("clamps varianceRoll to [-1,1] and yesShare/finalYesShare to [0,100]", () => {
    const r = resolveReferendumVote({ yesShare: 99, varianceRoll: 5 });
    expect(r.finalYesShare).toBe(100); // 99 + clamp(5,-1,1)*4 = 99+4 = 103 -> clamped 100
    const r2 = resolveReferendumVote({ yesShare: 1, varianceRoll: -5 });
    expect(r2.finalYesShare).toBe(0);
  });

  it("turnout rises with how polarised the result is", () => {
    const close = resolveReferendumVote({ yesShare: 50.5, varianceRoll: 0 });
    const polarised = resolveReferendumVote({ yesShare: 95, varianceRoll: 0 });
    expect(polarised.turnout).toBeGreaterThan(close.turnout);
  });
});

describe("runReferendumLifecycle (W25)", () => {
  function pollingReferendum(yesShare: number): ReferendumRecord {
    return {
      id: "ref-test-1",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      yesShare,
      requestedTurn: 0,
      grantedTurn: 0,
    };
  }

  it("only advances records in 'polling' status; others are untouched", () => {
    const w = createWorld(OPTS);
    const untouched: ReferendumRecord = {
      ...pollingReferendum(70),
      status: "campaigning",
      id: "ref-untouched",
    };
    w.referendums.push(untouched);
    runReferendumLifecycle(w);
    expect(w.referendums.find((r) => r.id === "ref-untouched")!.status).toBe(
      "campaigning",
    );
  });

  it("opens supported UK campaigns with source-backed cohort inputs", () => {
    const w = createWorld({
      ...OPTS,
      countryId: "UK",
      homeRegionId: "SCO",
      era: "2019",
    });
    w.referendums.push({
      id: "referendum-SCO-0",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "granted",
      yesShare: 62,
      campaignBaseYesShare: 62,
      campaignOpenTurn: 0,
      campaignCloseTurn: 48,
      requestedTurn: 0,
      grantedTurn: 0,
    });

    runReferendumLifecycle(w);

    const ref = w.referendums[0]!;
    expect(ref.cohortBaseline).toBeDefined();
    expect(ref.cohortBaseline!.length).toBeGreaterThan(1);
    expect(
      ref.cohortBaseline!.some((cohort) => cohort.groupId === "age:young"),
    ).toBe(true);
    expect(
      ref.cohortBaseline!.reduce((sum, cohort) => sum + cohort.share, 0),
    ).toBeCloseTo(1, 8);
    expect(referendumYesShare(ref)).toBeCloseTo(62, 8);
  });

  it("creates the Westminster consent gate when an independence vote passes", () => {
    const w = createWorld({
      ...OPTS,
      countryId: "UK",
      homeRegionId: "SCO",
      era: "2019",
    });
    w.referendums.push({
      id: "referendum-SCO-0",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      yesShare: 90,
      requestedTurn: 0,
      grantedTurn: 0,
    });

    runReferendumLifecycle(w);

    const ref = w.referendums[0]!;
    const bill = w.bills.find(
      (candidate) => candidate.id === ref.westminsterBillId,
    );
    expect(ref.status).toBe("actuating");
    expect(ref.conversionDeadlineTurn).toBe(w.meta.turn + 24);
    expect(ref.westminsterBillId).toBe("referendum-SCO-0-westminster-consent");
    expect(bill).toMatchObject({
      id: "referendum-SCO-0-westminster-consent",
      countryId: "UK",
      category: "independence",
      status: "active",
      currentChamber: "commons",
      votingEndsOnTurn: w.meta.turn + 24,
      adminProposed: true,
    });
  });

  it("waits for signed consent, then completes independence idempotently", () => {
    const w = createWorld({
      ...OPTS,
      countryId: "UK",
      homeRegionId: "SCO",
      era: "2019",
    });
    w.referendums.push({
      id: "referendum-SCO-0",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      yesShare: 90,
      requestedTurn: 0,
      grantedTurn: 0,
    });

    runReferendumLifecycle(w);
    const ref = w.referendums[0]!;
    expect(ref.status).toBe("actuating");

    runReferendumLifecycle(w);
    expect(ref.status).toBe("actuating");
    w.bills.find((bill) => bill.id === ref.westminsterBillId)!.status =
      "signed";

    runReferendumLifecycle(w);
    expect(ref.status).toBe("completed");
    expect(w.regions.SCO!.countryId).toBe("SCO");
    expect(w.countries.SCO).toMatchObject({
      id: "SCO",
      name: "Scotland",
      playable: true,
    });

    runReferendumLifecycle(w);
    expect(ref.status).toBe("completed");
    expect(w.regions.SCO!.countryId).toBe("SCO");
  });

  it("requires both Westminster and Dáil consent before reunification", () => {
    const w = createWorld({
      ...OPTS,
      countryId: "UK",
      homeRegionId: "NIR",
      era: "2019",
    });
    w.referendums.push({
      id: "referendum-NIR-0",
      countryId: "UK",
      regionId: "NIR",
      kind: "reunification",
      targetCountryId: "IE",
      status: "polling",
      yesShare: 90,
      requestedTurn: 0,
      grantedTurn: 0,
    });

    runReferendumLifecycle(w);
    const ref = w.referendums[0]!;
    expect(ref.status).toBe("actuating");
    expect(w.bills).toHaveLength(2);
    expect(
      w.bills.find((bill) => bill.id === ref.westminsterBillId)?.countryId,
    ).toBe("UK");
    expect(w.bills.find((bill) => bill.id === ref.dailBillId)?.countryId).toBe(
      "IE",
    );

    w.bills.find((bill) => bill.id === ref.westminsterBillId)!.status =
      "signed";
    runReferendumLifecycle(w);
    expect(ref.status).toBe("actuating");

    w.bills.find((bill) => bill.id === ref.dailBillId)!.status = "signed";
    runReferendumLifecycle(w);
    expect(ref.status).toBe("completed");
    expect(w.regions.NIR!.countryId).toBe("IE");
    expect(w.regions.NIR!.name).toBe("Ulster");
    expect(w.player.countryId).toBe("IE");
  });

  it("cancels conversion when consent fails without moving the region", () => {
    const w = createWorld({
      ...OPTS,
      countryId: "UK",
      homeRegionId: "SCO",
      era: "2019",
    });
    w.referendums.push({
      id: "referendum-SCO-0",
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      yesShare: 90,
      requestedTurn: 0,
      grantedTurn: 0,
    });

    runReferendumLifecycle(w);
    const ref = w.referendums[0]!;
    const bill = w.bills.find(
      (candidate) => candidate.id === ref.westminsterBillId,
    )!;
    bill.status = "failed";

    runReferendumLifecycle(w);

    expect(ref.status).toBe("cancelled");
    expect(ref.cooldownReadyAtTurn).toBeNull();
    expect(w.regions.SCO!.countryId).toBe("UK");
  });

  it("a high-yesShare referendum resolves to 'actuating' (passed) deterministically via seeded hash", () => {
    const w = createWorld(OPTS);
    w.referendums.push(pollingReferendum(90));
    runReferendumLifecycle(w);
    const ref = w.referendums.find((r) => r.id === "ref-test-1")!;
    expect(ref.status).toBe("actuating");
    expect(ref.passed).toBe(true);
    expect(ref.resolvedTurn).toBe(w.meta.turn);
    expect(w.news.some((n) => n.headline.includes("Yes"))).toBe(true);
  });

  it("a low-yesShare referendum resolves to 'settled' (failed)", () => {
    const w = createWorld(OPTS);
    w.regions.SCO!.independenceDesire = 70;
    w.referendums.push(pollingReferendum(10));
    runReferendumLifecycle(w);
    const ref = w.referendums.find((r) => r.id === "ref-test-1")!;
    expect(ref.status).toBe("settled");
    expect(ref.passed).toBe(false);
    expect(ref.cooldownReadyAtTurn).toBe(480);
    expect(w.regions.SCO!.independenceDesire).toBe(25);
  });

  it("is wired into advanceTurn and deterministic across two identical-seed worlds", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    a.referendums.push(pollingReferendum(55));
    b.referendums.push(pollingReferendum(55));
    advanceTurn(a);
    advanceTurn(b);
    expect(JSON.stringify(a.referendums)).toBe(JSON.stringify(b.referendums));
  });
});

describe("seededVariance (M02, reference-exact vs AHDGame)", () => {
  it("matches independently computed AHDGame hash vectors", () => {
    expect(seededVariance("SCO-1953-0", 10)).toBe(-0.6077080130595034);
    expect(seededVariance("SCO-1953-0", 11)).toBe(-0.6155207007228212);
    expect(seededVariance("WAL-1953-0", 10)).toBe(-0.8706948011812509);
    expect(seededVariance("ref-test-1", 0)).toBe(0.22314065769853553);
  });

  it("stays in [-1,1] and varies by id and turn", () => {
    const a = seededVariance("SCO-1953-0", 10);
    expect(a).toBeGreaterThanOrEqual(-1);
    expect(a).toBeLessThanOrEqual(1);
    expect(seededVariance("WAL-1953-0", 10)).not.toBe(a);
    expect(seededVariance("SCO-1953-0", 11)).not.toBe(a);
  });

  it("pins the resolveReferendumVote seam at rolls -1/0/1", () => {
    expect(resolveReferendumVote({ yesShare: 50, varianceRoll: 0 })).toEqual({
      finalYesShare: 50,
      turnout: 55,
      passed: false,
    });
    expect(resolveReferendumVote({ yesShare: 50, varianceRoll: 1 })).toEqual({
      finalYesShare: 54,
      turnout: 57.4,
      passed: true,
    });
    expect(resolveReferendumVote({ yesShare: 50, varianceRoll: -1 })).toEqual({
      finalYesShare: 46,
      turnout: 57.4,
      passed: false,
    });
  });
});

describe("referendum RNG policy (M02, advanceTurn/replay boundary)", () => {
  function polling(id: string, yesShare: number): ReferendumRecord {
    return {
      id,
      countryId: "UK",
      regionId: "SCO",
      kind: "independence",
      status: "polling",
      yesShare,
      requestedTurn: 0,
      grantedTurn: 0,
    };
  }

  it("same yesShare diverges deterministically by id, matching reference outcomes", () => {
    // advanceCalendar runs first, so the referendum phase sees turn 1.
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    a.referendums.push(polling("SCO-1953-0", 52));
    b.referendums.push(polling("WAL-1953-0", 52));
    advanceTurn(a);
    advanceTurn(b);
    const ra = a.referendums[0]!;
    const rb = b.referendums[0]!;
    expect(ra.resolvedTurn).toBe(1);
    expect(rb.resolvedTurn).toBe(1);
    expect(ra.finalYesShare).toBeCloseTo(50.29910150410121, 10);
    expect(rb.finalYesShare).toBeCloseTo(55.74570027174095, 10);
    expect(ra.finalYesShare).not.toBe(rb.finalYesShare);
  });

  it("advanceTurn replay is byte-identical across a JSON save/load round trip", () => {
    const w = createWorld(OPTS);
    w.referendums.push(polling("SCO-1953-0", 52));
    advanceTurn(w);
    const revived = JSON.parse(JSON.stringify(w)) as typeof w;
    advanceTurn(w);
    advanceTurn(revived);
    expect(JSON.stringify(revived)).toBe(JSON.stringify(w));
  });

  it("referendum resolution consumes no world RNG", () => {
    const plain = createWorld(OPTS);
    const withRef = createWorld(OPTS);
    withRef.referendums.push(polling("SCO-1953-0", 90));
    const seen: Record<string, string> = {};
    const seenRef: Record<string, string> = {};
    advanceTurn(plain, {
      afterPhase: (name, _w, rng) => {
        seen[name] = JSON.stringify(rng);
      },
    });
    advanceTurn(withRef, {
      afterPhase: (name, _w, rng) => {
        seenRef[name] = JSON.stringify(rng);
      },
    });
    expect(seenRef["referendumLifecycle"]).toBe(seen["referendumLifecycle"]);
  });

  it("no-referendum worlds advance deterministically (twin worlds byte-identical)", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    advanceTurn(a);
    advanceTurn(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
