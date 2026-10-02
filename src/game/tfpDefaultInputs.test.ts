import { describe, expect, it } from "vitest";
import { GameSession } from "./session";
import { tfpBasket, TFP_METRIC_PATHS } from "../../packages/engine/src/demographics/laborForce";

/**
 * Public GameSession contract for issue #40: default-world TFP seed, then a
 * real HoS Education appointment. Education is year-gated to 1979 in the
 * source cabinet table. The 1979 US founding pack authors an empty Senate, so
 * confirmation has no NPP voters. Public `startDate` keeps the 1953 Senate
 * composition while the calendar year unlocks the office. No cabinet row is
 * injected into a save.
 */

const CREATE_1953 = {
  era: "1953",
  countryId: "US",
  seed: "native-tfp-default-40",
  playerName: "Alex",
  mode: "hos" as const,
};
const OPTIONS = {
  era: "1953",
  countryId: "US",
  seed: "native-tfp-default-40-education",
  playerName: "Alex",
  mode: "hos" as const,
  startDate: "1979-01-20",
};
const POSITION = "secretary_of_education";
const ORDER = "workforce_skills_initiative";
const METRIC = "education.workforceSkill";
const SAVED_AT = "2026-10-01T00:00:00.000Z";

interface SavedWorld {
  world: {
    ministerialOrders: Array<{ orderId?: string; lastAppliedTurn?: number }>;
    nationalMetrics: Record<string, Record<string, { value: number }>>;
    regionalMetrics: Record<string, Record<string, { value: number }>>;
    countries: Record<string, { economy: { outputGap: number; growthRate: number } }>;
  };
}

function readSave(session: GameSession): SavedWorld {
  return JSON.parse(session.serialize(SAVED_AT)) as SavedWorld;
}

function seatPlayerEducation(session: GameSession): void {
  const nomination = session.act("sponsorCabinetNomination", {
    countryId: "US",
    positionId: POSITION,
    nomineeId: "player",
  });
  if (!nomination.ok) throw new Error(`Education nomination failed: ${nomination.error}`);
  for (let turn = 0; turn < 25; turn++) {
    if (session.cabinetOffice().positions.find((entry) => entry.id === POSITION)?.isPlayerHolder) {
      return;
    }
    session.advance();
  }
  throw new Error("Public nomination never seated the player as Secretary of Education by turn 24");
}

describe("default TFP inputs through GameSession (#40)", () => {
  it("creates a 1953 US world with Game-seeded TFP leaves through the public session", () => {
    const session = new GameSession();
    session.create(CREATE_1953);
    const created = readSave(session);
    expect(created.world.regionalMetrics.CA?.[METRIC]?.value).toBe(50);
    expect(created.world.regionalMetrics.MS?.[METRIC]?.value).toBe(34);
    expect(created.world.nationalMetrics.US[METRIC]!.value).toBeGreaterThan(30);
    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    expect(readSave(resumed).world.regionalMetrics.CA?.[METRIC]?.value).toBe(50);
    expect(readSave(resumed).world.nationalMetrics.US[METRIC]!.value).toBe(
      created.world.nationalMetrics.US[METRIC]!.value,
    );
  });

  it("progresses Education workforce skill through public nomination, turn, and reload", () => {
    const session = new GameSession();
    session.create(OPTIONS);
    const created = readSave(session);
    expect(created.world.regionalMetrics.CA?.[METRIC]?.value).toBe(50);
    const skillAtCreate = created.world.nationalMetrics.US[METRIC]!.value;
    expect(skillAtCreate).toBeGreaterThan(30);
    expect(skillAtCreate).toBeLessThan(90);

    seatPlayerEducation(session);
    const seatedSave = session.serialize(SAVED_AT);
    const control = new GameSession();
    control.load(seatedSave);

    const issued = session.issueCabinetOrder({ positionId: POSITION, orderId: ORDER });
    expect(issued.result).toEqual({
      ok: true,
      message: expect.stringContaining("Workforce Skills Initiative"),
    });

    session.advance();
    const afterFirst = readSave(session);
    control.advance();
    const controlAfterFirst = readSave(control);
    // Game writes the national order to each region. A transient national
    // overlay is erased by the next aggregation and does not progress TFP.
    expect(afterFirst.world.regionalMetrics.CA[METRIC]!.value).toBe(50.05);
    // The actual source cabinet effect is the +0.05 CA regional record above.
    // The board dynamics phase consumes the previous order snapshot, so the
    // first-turn national value must match a control loaded from the exact same
    // seated save; it cannot be asserted as an absolute +0.05 overlay.
    expect(afterFirst.world.regionalMetrics.CA[METRIC]!.value
      - controlAfterFirst.world.regionalMetrics.CA[METRIC]!.value).toBeCloseTo(0.05, 10);
    expect(afterFirst.world.nationalMetrics.US[METRIC]!.value)
      .toBe(controlAfterFirst.world.nationalMetrics.US[METRIC]!.value);
    expect(afterFirst.world.ministerialOrders[0]?.lastAppliedTurn).toBeGreaterThan(0);

    // macroCountryTurn reads prev-turn nationalMetrics, so the order's TFP
    // hit lands on the second advance after issue.
    session.advance();
    control.advance();
    const treated = readSave(session);
    const untreated = readSave(control);
    expect(treated.world.nationalMetrics.US[METRIC]!.value).toBeGreaterThan(
      untreated.world.nationalMetrics.US[METRIC]!.value,
    );
    const basket = (saved: SavedWorld) => tfpBasket(Object.fromEntries(
      Object.entries(TFP_METRIC_PATHS).map(([field, path]) => [field, saved.world.nationalMetrics.US[path]?.value]),
    ));
    // The Game .04 policy modifier produces two +.05 regional increments.
    // Political-board dynamics also feeds the recorded cabinet snapshot into
    // the same-turn projection, so isolate the complete basket consequence
    // against the exact saved-state control instead of predicting it from the
    // regional leaf alone.
    expect(basket(treated)).toBeGreaterThan(basket(untreated));

    const resumed = new GameSession();
    resumed.load(session.serialize(SAVED_AT));
    const reloaded = readSave(resumed);
    expect(treated.world.regionalMetrics.CA[METRIC]!.value
      - untreated.world.regionalMetrics.CA[METRIC]!.value).toBeCloseTo(0.1, 10);
    expect(reloaded.world.regionalMetrics.CA?.[METRIC]?.value)
      .toBe(treated.world.regionalMetrics.CA[METRIC]!.value);
    expect(reloaded.world.nationalMetrics.US[METRIC]!.value).toBe(
      treated.world.nationalMetrics.US[METRIC]!.value,
    );
    expect(reloaded.world.countries.US.economy.outputGap).toBe(
      treated.world.countries.US.economy.outputGap,
    );
    expect(resumed.cabinetOffice().activeOrders[0]).toMatchObject({
      positionId: POSITION,
      orderId: ORDER,
    });
    expect(resumed.cabinetOffice().positions.find((entry) => entry.id === POSITION)?.isPlayerHolder).toBe(true);

    resumed.advance();
    session.advance();
    expect(readSave(resumed).world.countries.US.economy.outputGap).toBe(
      readSave(session).world.countries.US.economy.outputGap,
    );
  }, 180_000);
});
