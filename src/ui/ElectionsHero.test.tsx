/**
 * Elections hero band and race framing (#377, slice of #143).
 *
 * Rendered contract for the Elections surface: a source-grounded hero band
 * (title, tagline, Races/Contested/Next-to-close strip with Contested
 * prominent, so zero candidates reads as open ground) above the unchanged
 * race lists. Composition follows AHDGame
 * `src/app/country/[code]/elections/components/ElectionsHero.tsx` at
 * `e364c04954ed`; the art is the already-bundled offline
 * `public/static/heroes/politicians.webp` (byte-identical to AHDGame,
 * SHA-256 `bb3078558687f426d939f74672e339033147e241b21495b269b59cc12acb7a00`),
 * never the reference remote Wikimedia photo. No mechanics, tally, or
 * forecast is invented: the strip is pure composition over the projected
 * race list.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PoliticsPanel, summarizeElectionRaces } from "./PoliticsPanel";
import { electionsHero } from "./RouteHero";
import { formatGameDate } from "../game/gameDate";
import type { PoliticsView } from "../game/politics";

const CLOCK = { turn: 1, date: "1953-01-13" };

type Race = PoliticsView["elections"][number];

function makeRace(overrides: Partial<Race> = {}): Race {
  return {
    id: "house:US:AL:c1",
    title: "house · AL",
    status: "active",
    date: "1954-11-02",
    filingDate: "1954-09-01",
    phase: "primary",
    playerCandidate: true,
    candidates: [
      { id: "player", name: "Alex", partyId: "US_DEM", partyName: "Democratic Party", incumbent: false, isPlayer: true, votes: null, voteShare: null, winner: false },
    ],
    winnerNames: [],
    winnerIds: [],
    totalVotes: null,
    stages: [
      { key: "filing", label: "Filing", state: "done", when: "1954-09-01", detail: "Filing has closed." },
      { key: "primary", label: "Primary", state: "current", when: "1954-09-01", detail: "Primary detail." },
      { key: "general", label: "General", state: "upcoming", when: "1954-11-02", detail: "General detail." },
      { key: "results", label: "Results", state: "upcoming", when: "1954-11-02", detail: "Results detail." },
    ],
    primary: {
      applicable: true, open: true, resolved: false, endTurn: 10, endDate: "1954-09-01",
      snapshotTurn: null, totalBallots: null, parties: [],
    },
    candidacy: { id: "withdrawCandidacy", name: "Withdraw candidacy", description: "", cost: 1, available: true },
    playerCampaign: null,
    presidential: null,
    projection: {
      resolved: false, countedVotes: null,
      leaderName: null, leaderShare: null, runnerUpName: null, marginPct: null,
      seats: null, snapshotTurn: null, drivers: [], projected: null,
    },
    ...overrides,
  };
}

function makePolitics(races: Race[]): PoliticsView {
  return {
    countryId: "US",
    countryName: "United States",
    currency: "USD",
    playerPartyId: null,
    parties: [],
    elections: races,
    referendums: [],
    referendumRequest: {
      applicable: false,
      note: "Referendums are only available in the UK in this local slice.",
      regions: [],
      action: { id: "requestReferendum", name: "Request Referendum", description: "", cost: 0, available: false, disabledReason: "Referendums are UK-only." },
    },
    politicians: [],
  };
}

const CONTESTED = makeRace();
const OPEN = makeRace({
  id: "senate:US:TX:c1",
  title: "senate · TX",
  playerCandidate: false,
  candidates: [],
  candidacy: { id: "declareCandidacy", name: "Run for office", description: "", cost: 1, available: true },
});

describe("summarizeElectionRaces", () => {
  it("counts contested races and picks the soonest open filing deadline", () => {
    expect(summarizeElectionRaces([CONTESTED, OPEN])).toEqual({
      total: 2,
      contested: 1,
      nextDeadline: "1954-09-01",
    });
  });

  it("ignores resolved races when picking the next deadline", () => {
    const resolved = makeRace({ status: "resolved", filingDate: "1952-09-01", date: "1952-11-04" });
    expect(summarizeElectionRaces([resolved, OPEN]).nextDeadline).toBe("1954-09-01");
    expect(summarizeElectionRaces([resolved])).toEqual({ total: 1, contested: 1, nextDeadline: null });
  });

  it("reports no deadline when no open race carries a usable date", () => {
    const dateless = makeRace({ filingDate: "", date: "" });
    expect(summarizeElectionRaces([dateless]).nextDeadline).toBeNull();
    expect(summarizeElectionRaces([])).toEqual({ total: 0, contested: 0, nextDeadline: null });
  });
});

describe("Elections hero band", () => {
  it("resolves the offline bundled hero, never a remote photo", () => {
    expect(electionsHero()).toBe("/static/heroes/politicians.webp");
  });

  it("renders the band with title, tagline, and stat strip above the unchanged race lists", () => {
    render(<PoliticsPanel politics={makePolitics([CONTESTED, OPEN])} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    const hero = screen.getByRole("img", { name: "United States elections" });
    expect(hero).toHaveAttribute("src", "/static/heroes/politicians.webp");
    expect(hero.getAttribute("src")).not.toMatch(/^https?:/);
    expect(screen.getByRole("heading", { name: "United States Elections" })).toBeInTheDocument();
    expect(screen.getByText("Pick an office, find your seat, and file to stand.")).toBeInTheDocument();

    const strip = document.querySelector(".ahd-hero-stats");
    expect(strip).not.toBeNull();
    expect(strip).toHaveAttribute("aria-label", "Election overview");
    expect(within(strip as HTMLElement).getByText("Races")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByText("Contested")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByText("Next to close")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByText("1 of 2")).toBeInTheDocument();
    expect(within(strip as HTMLElement).getByText(formatGameDate("1954-09-01", CLOCK))).toBeInTheDocument();

    // Existing race-list behavior is unchanged below the band.
    expect(screen.getByText(/2 of 2 races/)).toBeInTheDocument();
    expect(screen.getByLabelText("Race status")).toBeInTheDocument();
    expect(screen.getByLabelText("Race")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw candidacy" })).toBeInTheDocument();
  });

  it("frames zero candidates as open ground instead of an empty page", () => {
    render(<PoliticsPanel politics={makePolitics([OPEN])} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("0 of 1")).toBeInTheDocument();
    expect(screen.getByText(/Open ground/)).toBeInTheDocument();
    expect(screen.getByLabelText("Race")).toBeInTheDocument();
  });

  it("hides the open-ground note once a race is contested", () => {
    render(<PoliticsPanel politics={makePolitics([CONTESTED])} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.queryByText(/Open ground/)).not.toBeInTheDocument();
  });

  it("shows no deadline and no open-ground note when there are no races", () => {
    render(<PoliticsPanel politics={makePolitics([])} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByText("No deadline")).toBeInTheDocument();
    expect(screen.queryByText(/Open ground/)).not.toBeInTheDocument();
    expect(screen.getByText("No races match these filters.")).toBeInTheDocument();
  });

  it("keeps the reference image-error gradient fallback", () => {
    render(<PoliticsPanel politics={makePolitics([CONTESTED])} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    fireEvent.error(screen.getByRole("img", { name: "United States elections" }));
    expect(screen.queryByRole("img", { name: "United States elections" })).toBeNull();
    expect(screen.getByRole("heading", { name: "United States Elections" })).toBeInTheDocument();
    expect(screen.getByLabelText("Race")).toBeInTheDocument();
  });

  it("keeps the band and stat density phone-safe with no fixed widths", () => {
    const css = readFileSync("src/ui/ui.css", "utf8");
    expect(css).toMatch(/\.ahd-route-hero[^{]*\{[^}]*min-height:\s*172px/);
    expect(css).toMatch(/\.ahd-hero-stats\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.ahd-hero-stats[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it("keeps every filter and reachability control below the band", () => {
    render(<PoliticsPanel politics={makePolitics([CONTESTED, OPEN])} section="elections" clock={CLOCK} busy={false} onAction={vi.fn()} />);
    expect(screen.getByLabelText("Race status")).toBeVisible();
    expect(screen.getByLabelText("Only my races")).toBeVisible();
    expect(screen.getByLabelText("Only decided races")).toBeVisible();
    expect(screen.getByLabelText("Race")).toBeVisible();
  });
});
