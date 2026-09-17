import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGameScreen } from "./NewGameScreen";
import type { EraChoice } from "../game/types";

type SetupCountry = EraChoice["countries"][number] & { regions: { id: string; name: string }[] };
type SetupEra = Omit<EraChoice, "countries"> & { countries: SetupCountry[] };

const REP = { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", logoUrl: null as string | null };
const LAB = { id: "UK_LAB", name: "Labour Party", abbreviation: "LAB", color: "#DC241F", logoUrl: null as string | null };
const SED = { id: "DD_SED", name: "Socialist Unity Party", abbreviation: "SED", color: "#C00000", logoUrl: null as string | null };

// Country ids are real registry keys covering all three systems (US
// presidential, UK parliamentary monarchy, DD one-party state) so the notice
// names the authored executive office each system seats.
const ERAS: SetupEra[] = [
  { id: "1953", label: "1953", countries: [
    { id: "US", name: "United States", regions: [{ id: "US-CA", name: "California" }], headOfStateOffice: "president", rulingPartyByInitialization: { founding: REP, historical: REP } },
    { id: "UK", name: "United Kingdom", regions: [{ id: "UK-LON", name: "London" }], headOfStateOffice: "primeMinister", rulingPartyByInitialization: { founding: null, historical: LAB } },
    { id: "DD", name: "East Germany", regions: [{ id: "DD-BE", name: "Berlin" }], headOfStateOffice: "generalSecretary", rulingPartyByInitialization: { founding: SED, historical: SED } },
  ] },
];

async function selectHos(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("Head of State"));
}

describe("NewGameScreen HoS seating-path notice", () => {
  it("names the presidential seating path for a US HoS start", async () => {
    const user = userEvent.setup();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    await selectHos(user);
    expect(screen.getByText("Govern as Republican Party (REP) in United States")).toBeInTheDocument();
    expect(screen.getByText(/seated as president/i)).toBeInTheDocument();
    expect(screen.getByText(/permanent for this world/i)).toBeInTheDocument();
  });

  it("names the authored executive office for a UK HoS start", async () => {
    const user = userEvent.setup();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/country/i), "UK");
    await user.click(screen.getByLabelText("Historical"));
    await selectHos(user);
    expect(screen.getByText("Govern as Labour Party (LAB) in United Kingdom")).toBeInTheDocument();
    expect(screen.getByText(/seated as prime minister/i)).toBeInTheDocument();
    expect(screen.getByText(/permanent for this world/i)).toBeInTheDocument();
  });

  it("names the authored executive office for a one-party DD HoS start", async () => {
    const user = userEvent.setup();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/country/i), "DD");
    await selectHos(user);
    expect(screen.getByText("Govern as Socialist Unity Party (SED) in East Germany")).toBeInTheDocument();
    expect(screen.getByText(/seated as general secretary/i)).toBeInTheDocument();
    expect(screen.getByText(/permanent for this world/i)).toBeInTheDocument();
  });

  it("shows no seating notice in Career mode", () => {
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByText(/seated as/i)).not.toBeInTheDocument();
  });
});
