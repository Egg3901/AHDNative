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
 * Issue #346 (world-simulation mode). The creation screen offers the
 * spectator mode only because the engine contract exists (mode binding,
 * empty character actions, save persistence): selecting Worldsim submits
 * the contracted mode with the world setup. Career and Head of State flow
 * stays intact; no other new selector is added.
 */
describe("NewGameScreen worldsim (#346)", () => {
  it("offers a Worldsim spectator mode defaulting to Career", () => {
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    expect((screen.getByLabelText(/career/i) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(/worldsim/i)).toBeInTheDocument();
  });

  it("submits the worldsim mode with the valid world setup", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByLabelText(/worldsim/i));
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: "worldsim" }));
  });

  it("keeps Career default and HoS selection alongside worldsim", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={onStart} onBack={vi.fn()} />);
    await user.click(screen.getByLabelText(/head of state/i));
    await user.type(screen.getByLabelText(/your name/i), "Ada");
    await user.click(screen.getByRole("button", { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ mode: "hos" }));
  });

  it("disables the worldsim radio while world creation is busy", () => {
    render(<NewGameScreen eras={ERAS} busy={true} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByLabelText(/worldsim/i)).toBeDisabled();
  });
});
