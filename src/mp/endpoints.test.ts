import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MP_BATCHABLE_ACTION_TYPES,
  MP_EXECUTE_ACTIONS,
  MP_EXECUTE_COUNTS,
  MP_NOTIFICATION_TYPES,
  MP_ORIGIN,
  MP_MAIL_BODY_MAX,
  MP_MAIL_SUBJECT_MAX,
  MP_SNOOZE_MINUTES_DEFAULT,
  MP_SNOOZE_MINUTES_MAX,
  MP_SNOOZE_MINUTES_MIN,
  isMpBatchableActionType,
  isMpNotificationType,
  type MpFetchOpId,
} from "./endpoints";

/**
 * Pins the nine action names/descriptions to the audited AHDGame catalog
 * (src/lib/actions.ts at e364c0495). The UI renders these into button labels
 * and aria descriptions, so drift here is player-visible copy drift.
 */
describe("MP_EXECUTE_ACTIONS audit pin", () => {
  it("matches the nine server action names and descriptions exactly", () => {
    expect(MP_EXECUTE_ACTIONS).toEqual([
      { type: "fundraise", name: "Fundraise", description: "Raise money from your donor base" },
      {
        type: "campaign",
        name: "Campaign",
        description:
          "Increase your political influence — up to +1%, with diminishing returns above 50% (cost scales with current influence and state GDP)",
      },
      {
        type: "advertise",
        name: "Run Advertisements",
        description: "Run ads to boost your favorability rating",
      },
      {
        type: "buildDonorBase",
        name: "Build Donor Network",
        description: "Expand your donor base to increase fundraising effectiveness",
      },
      {
        type: "poll",
        name: "Quick Poll",
        description:
          "Commission a quick poll — see your topline appeal and best/worst demographic groups ($25,000)",
      },
      {
        type: "pollLarge",
        name: "Full Demographic Poll",
        description:
          "Commission a comprehensive poll — full breakdown across every demographic group and category ($75,000)",
      },
      {
        type: "convertCash",
        name: "Personal Campaign Donation",
        description:
          "Convert personal cash on hand into campaign funds at a 50% rate (infamy scales with amount)",
      },
      { type: "rest", name: "Rest", description: "Take a break (does nothing)" },
      {
        type: "debatePrep",
        name: "Debate Prep",
        description:
          "Study briefing books and rehearse. 10% chance to raise your Debate skill by 1. No fund cost.",
      },
    ]);
  });

  it("keeps the bridge pinned to the exact live-site origin", () => {
    expect(MP_ORIGIN).toBe("https://ahousedividedgame.com");
  });
});

describe("MP batch + inbox pins (#361)", () => {
  it("lists exactly the six server-batchable action types", () => {
    expect(MP_BATCHABLE_ACTION_TYPES).toEqual([
      "fundraise",
      "campaign",
      "advertise",
      "buildDonorBase",
      "poll",
      "pollLarge",
    ]);
    for (const type of MP_BATCHABLE_ACTION_TYPES) {
      expect(isMpBatchableActionType(type)).toBe(true);
    }
    for (const type of ["convertCash", "rest", "debatePrep", "nuke", null]) {
      expect(isMpBatchableActionType(type)).toBe(false);
    }
  });

  it("allows only the server batch counts", () => {
    expect(MP_EXECUTE_COUNTS).toEqual([1, 5, 10]);
  });

  it("pins the server snooze window and default", () => {
    expect(MP_SNOOZE_MINUTES_MIN).toBe(5);
    expect(MP_SNOOZE_MINUTES_MAX).toBe(10080);
    expect(MP_SNOOZE_MINUTES_DEFAULT).toBe(720);
  });

  it("pins the notification preference type allowlist", () => {
    expect(MP_NOTIFICATION_TYPES).toHaveLength(135);
    for (const type of ["turn_advance", "system", "ask_watch", "bill_signed", "coalition_invite_received"]) {
      expect(isMpNotificationType(type)).toBe(true);
    }
    for (const bad of ["", "TURN_ADVANCE", "turn-advance", "nuke", null, 42]) {
      expect(isMpNotificationType(bad)).toBe(false);
    }
    expect(MP_NOTIFICATION_TYPES[0]).toBe("welcome");
    expect(MP_NOTIFICATION_TYPES[MP_NOTIFICATION_TYPES.length - 1]).toBe("ask_watch");
    for (const type of MP_NOTIFICATION_TYPES) {
      expect(type).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("MP player-mail pins (#359 chat slice)", () => {
  it("pins sendMailSchema UTF-16 length limits", () => {
    expect(MP_MAIL_SUBJECT_MAX).toBe(80);
    expect(MP_MAIL_BODY_MAX).toBe(1000);
  });
});

describe("MP players-online pin (#359 presence slice)", () => {
  it("models the public GET as a fetch op with absent-on-failure semantics", () => {
    const op: MpFetchOpId = "players-online";
    expect(op).toBe("players-online");
    const source = readFileSync(new URL("./endpoints.ts", import.meta.url), "utf8");
    expect(source).toMatch(/GET \/api\/players\/online/);
    expect(source).toMatch(/absent, never zero/);
    const fetchBlock = source.slice(source.indexOf("export type MpFetchOpId"), source.indexOf("export type MpMutateOpId"));
    expect(fetchBlock).toMatch(/players-online/);
    const mutateBlock = source.slice(source.indexOf("export type MpMutateOpId"), source.indexOf("export type MpExecuteActionType"));
    expect(mutateBlock).not.toMatch(/players-online/);
  });
});

describe("MP admin-maintenance pin (#359)", () => {
  it("models the GET as a fetch op and keeps the PATCH sibling absent", () => {
    const op: MpFetchOpId = "admin-maintenance";
    expect(op).toBe("admin-maintenance");
    const source = readFileSync(new URL("./endpoints.ts", import.meta.url), "utf8");
    expect(source).toMatch(/GET \/api\/admin\/maintenance/);
    expect(source).toMatch(/PATCH sibling \(maintenance mode[\s\S]*writes\) is deliberately absent/);
    const mutateBlock = source.slice(source.indexOf("export type MpMutateOpId"), source.indexOf("export type MpExecuteActionType"));
    expect(mutateBlock).not.toMatch(/admin/i);
  });

  it("pins the election-detail summary read next to the other fetch ops", () => {
    const op: MpFetchOpId = "election-detail";
    expect(op).toBe("election-detail");
    const source = readFileSync(new URL("./endpoints.ts", import.meta.url), "utf8");
    const fetchBlock = source.slice(source.indexOf("export type MpFetchOpId"), source.indexOf("export type MpMutateOpId"));
    expect(fetchBlock).toMatch(/election-detail/);
    const docBlock = source.slice(0, source.indexOf("export const MP_AUDIT_REVISION"));
    expect(docBlock).toMatch(/election-detail/);
    expect(docBlock).toMatch(/\/api\/elections\?id=/);
    expect(docBlock).toMatch(/view=summary/);
    expect(docBlock).toMatch(/no-store/);
  });

  it("keeps player mail fetch ops next to the admin-maintenance read", () => {
    const source = readFileSync(new URL("./endpoints.ts", import.meta.url), "utf8");
    const fetchBlock = source.slice(source.indexOf("export type MpFetchOpId"), source.indexOf("export type MpMutateOpId"));
    const mutateBlock = source.slice(source.indexOf("export type MpMutateOpId"), source.indexOf("export type MpExecuteActionType"));
    expect(fetchBlock).toMatch(/mail-inbox/);
    expect(fetchBlock).toMatch(/mail-sent/);
    expect(fetchBlock).toMatch(/admin-maintenance/);
    expect(source).toMatch(/GET \/api\/mail/);
    expect(fetchBlock).not.toMatch(/mail-reports/);
    expect(mutateBlock).not.toMatch(/mail-reports/);
    expect(mutateBlock).not.toMatch(/admin/i);
  });
});
