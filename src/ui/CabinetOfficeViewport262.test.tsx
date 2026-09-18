import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CabinetOfficePanel } from "./CabinetOfficePanel";
import { GameSession } from "../game/session";

/**
 * Rendered cabinet-destination contracts at 320/390px widths (#262).
 *
 * Browser-geometry contract only: jsdom performs no layout, so these cases
 * assert the issue flow controls stay mounted and visible at both mobile
 * widths. The office comes from the real GameSession/engine projection, not
 * a hand-built fixture. Nothing here is physical-device evidence.
 */

const OPTIONS = {
  era: "1953",
  countryId: "US",
  seed: "native-cabinet-viewport-262",
  playerName: "Alex",
};
const POSITION = "secretary_of_treasury";

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: height,
    configurable: true,
  });
  window.dispatchEvent(new Event("resize"));
}

function liveOffice() {
  const session = new GameSession();
  session.create(OPTIONS);
  const saved = JSON.parse(session.serialize("2026-09-10T00:00:00.000Z")) as {
    world: { cabinetMembers: unknown[] };
  };
  saved.world.cabinetMembers.push({
    countryId: "US",
    positionId: POSITION,
    characterId: "player",
    characterName: "Alex",
    partyId: "US_DEM",
    appointedBy: null,
    appointedAtTurn: 0,
    confirmedAtTurn: 0,
    ministerialActions: 4,
    lastMinisterialActionRefillTurn: 0,
  });
  session.load(JSON.stringify(saved));
  return session.cabinetOffice();
}

afterEach(() => {
  cleanup();
  setViewport(1024, 768);
});

describe.each([
  { width: 320, height: 568 },
  { width: 390, height: 844 },
])(
  "CabinetOfficePanel rendered destination at $width px (#262)",
  ({ width, height }) => {
    it("keeps the live issue flow mounted and visible", async () => {
      const user = userEvent.setup();
      setViewport(width, height);
      const office = liveOffice();
      expect(
        office.positions.find((entry) => entry.id === POSITION)?.canIssue,
      ).toBe(true);

      render(
        <CabinetOfficePanel
          office={office}
          busy={false}
          notice={null}
          onIssue={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Cabinet office" }),
      ).toBeVisible();
      expect(
        screen.getByRole("combobox", { name: "Cabinet office" }),
      ).toBeVisible();
      // The panel opens on the first rostered office; select the live held
      // portfolio exactly as a player would before issuing.
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Cabinet office" }),
        POSITION,
      );
      expect(
        screen.getByRole("combobox", { name: "Ministerial order" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Issue ministerial order" }),
      ).toBeVisible();
      expect(screen.getByText(/4 ministerial actions remaining/)).toBeVisible();
      expect(
        screen.getByRole("heading", { name: "Active orders" }),
      ).toBeVisible();
    });
  },
);
