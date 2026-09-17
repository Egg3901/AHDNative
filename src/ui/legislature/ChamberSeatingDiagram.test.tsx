import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ChamberSeatingDiagram,
  UNKNOWN_PARTY_FILL,
  VACANT_SEAT_FILL,
  resolveChamberLayout,
  type ChamberSeatGroup,
} from "./ChamberSeatingDiagram";

const GROUPS: ChamberSeatGroup[] = [
  { partyId: "LEFT", name: "Left Party", color: "#1d4ed8", economicPosition: -4, seats: 120 },
  { partyId: "MID", name: "Center Party", color: "#16a34a", economicPosition: 0, seats: 80 },
  { partyId: "RIGHT", name: "Right Party", color: "#dc2626", economicPosition: 4, seats: 60 },
];

function renderDiagram(overrides: Partial<Parameters<typeof ChamberSeatingDiagram>[0]> = {}) {
  return render(
    <ChamberSeatingDiagram
      chamberName="House of Representatives"
      total={260}
      seatsByParty={GROUPS}
      vacancies={0}
      {...overrides}
    />,
  );
}

describe("resolveChamberLayout", () => {
  it("routes UK commons and lords to benches like the Westminster reference", () => {
    expect(resolveChamberLayout("UK", "commons")).toBe("benches");
    expect(resolveChamberLayout("UK", "lords")).toBe("benches");
  });

  it("routes the Irish dail to a horseshoe like the Oireachtas reference", () => {
    expect(resolveChamberLayout("IE", "dail")).toBe("horseshoe");
  });

  it("defaults every other house to a hemicycle", () => {
    expect(resolveChamberLayout("US", "house")).toBe("hemicycle");
    expect(resolveChamberLayout("US", "senate")).toBe("hemicycle");
    expect(resolveChamberLayout("DE", "bundestag")).toBe("hemicycle");
  });
});

describe("ChamberSeatingDiagram", () => {
  it("renders one seat dot per total seat", () => {
    const { container } = renderDiagram();
    expect(container.querySelectorAll("circle[data-seat]").length).toBe(260);
  });

  it("fills party seats with party colors left to right and vacant seats with the vacant fill", () => {
    const { container } = renderDiagram({ total: 265, vacancies: 5 });
    const dots = [...container.querySelectorAll("circle[data-seat]")];
    expect(dots.length).toBe(265);
    const fills = dots.map((dot) => dot.getAttribute("fill"));
    expect(fills.slice(0, 120).every((fill) => fill === "#1d4ed8")).toBe(true);
    expect(fills.slice(120, 200).every((fill) => fill === "#16a34a")).toBe(true);
    expect(fills.slice(200, 260).every((fill) => fill === "#dc2626")).toBe(true);
    expect(fills.slice(260).every((fill) => fill === "#cbd5e1")).toBe(true);
  });

  it("renders the horseshoe and benches adaptations without inventing seats", () => {
    for (const layout of ["horseshoe", "benches"] as const) {
      const { container, unmount } = render(
        <ChamberSeatingDiagram
          chamberName="Chamber"
          total={100}
          seatsByParty={[{ partyId: "A", name: "A", color: "#111111", economicPosition: -1, seats: 60 }]}
          vacancies={0}
          layout={layout}
        />,
      );
      expect(container.querySelectorAll("circle[data-seat]").length).toBe(100);
      unmount();
    }
  });

  it("exposes an accessible equivalent text with chamber totals", () => {
    renderDiagram({ total: 265, vacancies: 5 });
    expect(screen.getByRole("img", { name: /house of representatives/i })).toBeInTheDocument();
    expect(screen.getByText(/left party.*120/i)).toBeInTheDocument();
    expect(screen.getByText(/vacant.*5/i)).toBeInTheDocument();
  });

  it("renders an explicit empty state and no seats when the total is zero", () => {
    const { container } = renderDiagram({ total: 0, seatsByParty: [], vacancies: 0 });
    expect(container.querySelectorAll("circle[data-seat]").length).toBe(0);
    expect(screen.getByText(/no seats recorded/i)).toBeInTheDocument();
  });

  it("renders an explicit unavailable state for unsupported shapes instead of invented seats", () => {
    const { container } = render(
      <ChamberSeatingDiagram
        chamberName="Chamber"
        total={50}
        seatsByParty={[]}
        vacancies={50}
        layout="unknown-shape"
      />,
    );
    expect(container.querySelectorAll("circle[data-seat]").length).toBe(0);
    expect(screen.getByText(/seating layout not available/i)).toBeInTheDocument();
  });

  it("renders an explicit unavailable state when no composition was recorded", () => {
    const { container } = render(
      <ChamberSeatingDiagram chamberName="Chamber" total={50} seatsByParty={undefined} vacancies={undefined} />,
    );
    expect(container.querySelectorAll("circle[data-seat]").length).toBe(0);
    expect(screen.getByText(/composition not recorded/i)).toBeInTheDocument();
  });

  it("sanitizes invalid seat values to finite nonnegative integers without inventing seats", () => {
    const { container } = render(
      <ChamberSeatingDiagram
        chamberName="Chamber"
        total={10}
        seatsByParty={[
          { partyId: "A", name: "A", color: "#111111", economicPosition: -1, seats: 4.9 },
          { partyId: "B", name: "B", color: "#222222", economicPosition: 1, seats: -3 },
          { partyId: "C", name: "C", color: "#333333", economicPosition: 2, seats: NaN },
        ]}
        vacancies={2.9}
      />,
    );
    expect(container.querySelectorAll("circle[data-seat]").length).toBe(10);
    expect(screen.getByRole("img", { name: /4 filled of 10, 6 vacant/i })).toBeInTheDocument();
  });

  it("counts a party color colliding with the vacant fill as filled", () => {
    const { container } = render(
      <ChamberSeatingDiagram
        chamberName="Chamber"
        total={5}
        seatsByParty={[
          { partyId: "A", name: "A Party", color: VACANT_SEAT_FILL, economicPosition: -1, seats: 3 },
        ]}
        vacancies={2}
      />,
    );
    expect(container.querySelectorAll("circle[data-seat]").length).toBe(5);
    expect(screen.getByRole("img", { name: /3 filled of 5, 2 vacant/i })).toBeInTheDocument();
  });

  it("falls back to the neutral fill when a party record carries no color", () => {
    const { container } = render(
      <ChamberSeatingDiagram
        chamberName="Chamber"
        total={4}
        seatsByParty={[{ partyId: "A", name: "A Party", color: null, economicPosition: 0, seats: 4 }]}
        vacancies={0}
      />,
    );
    const fills = [...container.querySelectorAll("circle[data-seat]")].map((dot) =>
      dot.getAttribute("fill"),
    );
    expect(fills.every((fill) => fill === UNKNOWN_PARTY_FILL)).toBe(true);
    expect(screen.getByRole("img", { name: /4 filled of 4, 0 vacant/i })).toBeInTheDocument();
  });

  it("renders the horseshoe chair marker and no chair for hemicycle or benches", () => {
    for (const layout of ["hemicycle", "benches"] as const) {
      const { container, unmount } = render(
        <ChamberSeatingDiagram
          chamberName="Chamber"
          total={20}
          seatsByParty={[{ partyId: "A", name: "A", color: "#111111", economicPosition: 0, seats: 20 }]}
          vacancies={0}
          layout={layout}
        />,
      );
      expect(container.querySelectorAll("circle[data-seat]").length).toBe(20);
      expect(container.querySelector("circle[data-chair]")).toBeNull();
      unmount();
    }
    const { container } = render(
      <ChamberSeatingDiagram
        chamberName="Chamber"
        total={20}
        seatsByParty={[{ partyId: "A", name: "A", color: "#111111", economicPosition: 0, seats: 20 }]}
        vacancies={0}
        layout="horseshoe"
      />,
    );
    expect(container.querySelectorAll("circle[data-seat]").length).toBe(20);
    expect(container.querySelector("circle[data-chair]")).not.toBeNull();
  });

  it("exposes a single accessible name per diagram without a duplicate title", () => {
    const { container } = renderDiagram();
    expect(container.querySelectorAll("svg title").length).toBe(0);
    expect(screen.getByRole("img", { name: /house of representatives seating/i })).toBeInTheDocument();
  });

  it("keeps the diagram inside narrow viewports with a capped height", () => {
    const { container } = renderDiagram();
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("viewBox")).toMatch(/0 0 \d+(\.\d+)? \d+(\.\d+)?/);
    expect(svg?.style.maxHeight).toBe("250px");
    expect(svg?.style.width).toBe("100%");
  });
});
