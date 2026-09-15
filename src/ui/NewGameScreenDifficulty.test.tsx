import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGameScreen } from "./NewGameScreen";
import type { EraChoice } from "../game/types";

const ERAS: EraChoice[] = [
  { id: "1953", label: "1953", countries: [
    { id: "US", name: "United States", regions: [{ id: "US-CA", name: "California" }],
      headOfStateOffice: "president",
      rulingPartyByInitialization: {
        founding: { id: "US_REP", name: "Republican Party", abbreviation: "REP" },
        historical: { id: "US_REP", name: "Republican Party", abbreviation: "REP" },
      } },
  ] },
];

/**
 * Issue #334 (partial: difficulty axis). The creation screen offers the
 * canonical difficulty axis only — no inert autonomy/worldsim selectors —
 * and submits the selected value with the Career/HoS flow intact.
 */
describe("NewGameScreen difficulty (#334)", () => {
  it("defaults to Normal difficulty", () => {
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    expect((screen.getByLabelText(/^normal$/i) as HTMLInputElement).checked).toBe(true);
  });

  it("submits the changed difficulty with the valid world setup", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByLabelText(/^hard$/i));
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ difficulty: "hard" }));
  });

  it("keeps Career default and HoS selection alongside difficulty", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    expect((screen.getByLabelText(/career/i) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByLabelText(/head of state/i));
    await user.click(screen.getByLabelText(/^easy$/i));
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: "hos", difficulty: "easy" }));
  });

  it("disables the difficulty radios while world creation is busy", () => {
    render(<NewGameScreen eras={ERAS} busy={true} onStart={vi.fn()} onBack={vi.fn()} />);
    for (const label of [/^easy$/i, /^normal$/i, /^hard$/i]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });
});
