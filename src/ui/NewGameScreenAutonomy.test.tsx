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
        founding: { id: "US_REP", name: "Republican Party", abbreviation: "REP", logoUrl: null },
        historical: { id: "US_REP", name: "Republican Party", abbreviation: "REP", logoUrl: null },
      } },
  ] },
];

/**
 * Issue #345 (autonomy tier axis). The creation screen offers the canonical
 * autonomy tier alongside difficulty — no worldsim selector — and submits
 * the selected value with the Career/HoS flow intact.
 */
describe("NewGameScreen autonomy tier (#345)", () => {
  it("defaults to the v4 tier", () => {
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    expect((screen.getByLabelText(/autonomy: v4/i) as HTMLInputElement).checked).toBe(true);
  });

  it("submits the changed tier with the valid world setup", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByLabelText(/autonomy: off/i));
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ autonomyLevel: "off" }));
  });

  it("keeps difficulty, Career default and HoS selection alongside the tier", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    expect((screen.getByLabelText(/career/i) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByLabelText(/head of state/i));
    await user.click(screen.getByLabelText(/^hard$/i));
    await user.click(screen.getByLabelText(/autonomy: v2/i));
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "hos", difficulty: "hard", autonomyLevel: "v2" }),
    );
  });

  it("disables the autonomy radios while world creation is busy", () => {
    render(<NewGameScreen eras={ERAS} busy={true} onStart={vi.fn()} onBack={vi.fn()} />);
    for (const label of [/autonomy: off/i, /autonomy: v4/i, /autonomy: v5/i]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });
});
