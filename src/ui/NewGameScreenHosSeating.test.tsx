import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewGameScreen } from "./NewGameScreen";
import type { EraChoice } from "../game/types";

type SetupCountry = EraChoice["countries"][number] & { regions: { id: string; name: string }[] };
type SetupEra = Omit<EraChoice, "countries"> & { countries: SetupCountry[] };

const REP = { id: "US_REP", name: "Republican Party", abbreviation: "REP", logoUrl: null as string | null };
const LAB = { id: "UK_LAB", name: "Labour Party", abbreviation: "LAB", logoUrl: null as string | null };
const SED = { id: "DD_SED", name: "Socialist Unity Party", abbreviation: "SED", logoUrl: null as string | null };

// Country ids are real COUNTRY_CONFIGS keys (US presidential, UK
// parliamentary monarchy, DD one-party state) so the seating-path notice
// resolves through the same governmentType map the engine uses.
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
  });

  it("names the parliamentary-appointment path for a UK HoS start", async () => {
    const user = userEvent.setup();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/country/i), "UK");
    await user.click(screen.getByLabelText("Historical"));
    await selectHos(user);
    expect(screen.getByText("Govern as Labour Party (LAB) in United Kingdom")).toBeInTheDocument();
    expect(screen.getByText(/parliamentary appointment.*prime minister/i)).toBeInTheDocument();
  });

  it("names the legislature-appointment path for a one-party DD HoS start", async () => {
    const user = userEvent.setup();
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText(/country/i), "DD");
    await selectHos(user);
    expect(screen.getByText("Govern as Socialist Unity Party (SED) in East Germany")).toBeInTheDocument();
    expect(screen.getByText(/legislature appointment.*general secretary/i)).toBeInTheDocument();
  });

  it("shows no seating notice in Career mode", () => {
    render(<NewGameScreen eras={ERAS} busy={false} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.queryByText(/seated (as|by)/i)).not.toBeInTheDocument();
  });
});
