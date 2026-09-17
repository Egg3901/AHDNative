import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterCreationScreen } from "./CharacterCreationScreen";
import type { CharacterCreationScreenProps } from "../game/types";

const PARTIES = [
  { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3B82F6", logoUrl: null, economicPosition: -3, socialPosition: -2 },
  { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", logoUrl: null, economicPosition: 3, socialPosition: 2 },
];

const HOME_REGIONS = [
  { id: "NY", name: "New York", population: null, electorateLean: null, seeded: false },
  { id: "CA", name: "California", population: null, electorateLean: null, seeded: false },
];

const DD_PARTIES = [
  { id: "DD_CDU", name: "Christlich-Demokratische Union (Ost)", abbreviation: "CDU", color: "#33508C", logoUrl: null, economicPosition: -3, socialPosition: 3, regimeStatus: "approved" as const },
  { id: "DD_SED", name: "Sozialistische Einheitspartei Deutschlands", abbreviation: "SED", color: "#C00000", logoUrl: null, economicPosition: -4, socialPosition: 2, regimeStatus: "ruling" as const },
];

function props(overrides: Partial<CharacterCreationScreenProps> = {}): CharacterCreationScreenProps {
  return {
    selection: { era: "1953", countryId: "US", countryName: "United States", regionNoun: "state" },
    regions: [{ id: "NY", name: "New York" }, { id: "CA", name: "California" }],
    initialName: "Eleanor Vance",
    initialHomeRegionId: "NY",
    choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state", homeRegions: HOME_REGIONS },
    loading: false,
    busy: false,
    onSubmit: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
}

async function completeBackground(user: ReturnType<typeof userEvent.setup>) {
  if (!screen.queryByRole("button", { name: "Female" })) {
    await openDirectReview(user);
  }
  await user.click(screen.getByRole("button", { name: "Female" }));
  await user.click(screen.getByRole("button", { name: "White" }));
  await user.click(screen.getByRole("button", { name: "College" }));
  await user.click(screen.getByRole("button", { name: "Middle Income" }));
}

async function openDirectReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Review all details/i }));
}

describe("CharacterCreationScreen reference flow (#242)", () => {
  it("progresses through the canonical steps and keeps completed answers directly editable (#336)", async () => {
    const user = userEvent.setup();
    render(<CharacterCreationScreen {...props()} />);

    expect(screen.getByRole("heading", { name: /^Country/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /The politician/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    expect(screen.getByRole("heading", { name: /The politician/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit Country/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue to Home state/i })).toBeDisabled();

    await completeBackground(user);
    expect(screen.getByRole("button", { name: /Continue to Home state/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Edit Country/i }));
    expect(screen.getByRole("heading", { name: /^Country/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Eleanor Vance/).length).toBeGreaterThan(0);
  });

  it("submits the unchanged creation contract through the conversational player flow (#336)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    await completeBackground(user);
    await user.click(screen.getByRole("button", { name: /Continue to Home state/i }));
    await user.click(screen.getByRole("radio", { name: /^California/ }));
    await user.click(screen.getByRole("button", { name: /Continue to Where you stand/i }));
    fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/Social position/), { target: { value: "-1" } });
    await user.click(screen.getByRole("button", { name: /Continue to Party/i }));
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Continue to Stats/i }));
    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    await user.click(screen.getByRole("button", { name: /Create character/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      name: "Eleanor Vance",
      homeRegionId: "CA",
      partyId: "US_DEM",
      policies: { economic: 1, social: -1 },
    }));
  });

  it("uses step Back after progression and preserves the outer Back action at Country (#336)", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<CharacterCreationScreen {...props({ onBack })} />);

    await user.click(screen.getByRole("button", { name: /Continue to The politician/i }));
    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(screen.getByRole("heading", { name: /^Country/ })).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the six reference steps in order with their labels", () => {
    render(<CharacterCreationScreen {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
    for (const label of ["Country", "The politician", "Home state", "Where you stand", "Party", "Stats"]) {
      expect(headings.some((h) => h.includes(label))).toBe(true);
    }
    const regionStep = screen.getByRole("heading", { name: /Home state/ });
    const compassStep = screen.getByRole("heading", { name: /Where you stand/ });
    expect(regionStep.compareDocumentPosition(compassStep)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("submits the edited creation-screen name and home region, not the world-setup values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);
    await openDirectReview(user);
    const name = screen.getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Ada Lovelace");
    await user.click(screen.getByRole("radio", { name: /^California/ }));
    await completeBackground(user);
    fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "1" } });
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    await user.click(screen.getByRole("button", { name: /Create character/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const creation = onSubmit.mock.calls[0]![0];
    expect(creation.name).toBe("Ada Lovelace");
    expect(creation.homeRegionId).toBe("CA");
  });

  it("requires a deliberate party choice and a full stat allocation before submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);
    await openDirectReview(user);
    const submit = screen.getByRole("button", { name: /Create character|Finish/i });
    await user.type(screen.getByLabelText(/^Name/), "Eleanor Vance");
    await completeBackground(user);
    // The compass is a separate deliberate answer; choosing a party never fills it.
    fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "-3" } });
    fireEvent.change(screen.getByLabelText(/Social position/), { target: { value: "-2" } });
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const creation = onSubmit.mock.calls[0]![0];
    expect(creation.policies).toEqual({ economic: -3, social: -2 });
    expect(creation.demographics).toMatchObject({ race: expect.any(String), gender: expect.any(String) });
    const total = Object.values(creation.stats as Record<string, number>).reduce((s, v) => s + v, 0);
    expect(total).toBe(28);
  });

  it("blocks submit until the compass is deliberately answered", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);
    await openDirectReview(user);
    await user.type(screen.getByLabelText(/^Name/), "Eleanor Vance");
    await completeBackground(user);
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    await user.click(screen.getByRole("button", { name: /Create character/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/complete every step/i)).toBeInTheDocument();
  });

  it("does not overwrite the independent compass answer when a party is chosen", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);
    await openDirectReview(user);
    await completeBackground(user);
    // The player answers the compass independently of any party platform.
    const econ = screen.getByLabelText(/Economic position/);
    const social = screen.getByLabelText(/Social position/);
    fireEvent.change(econ, { target: { value: "4" } });
    fireEvent.change(social, { target: { value: "-3" } });
    // Choosing a party must preserve those independent answers, not snap to it.
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    expect((econ as HTMLInputElement).value).toBe("4");
    expect((social as HTMLInputElement).value).toBe("-3");
    await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
    await user.click(screen.getByRole("button", { name: /Create character/ }));
    expect(onSubmit.mock.calls[0]![0].policies).toEqual({ economic: 4, social: -3 });
  });

  it("blocks submit until all stat points are allocated", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CharacterCreationScreen {...props({ onSubmit })} />);
    await openDirectReview(user);
    await user.type(screen.getByLabelText(/^Name/), "Eleanor Vance");
    await completeBackground(user);
    fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "1" } });
    await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
    await user.click(screen.getByRole("button", { name: /Create character|Finish/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/allocate all .*remaining stat point/i)).toBeInTheDocument();
  });

  it("names the actual ruling party in a one-party briefing, never the first sorted party", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "DD", countryName: "East Germany", regionNoun: "region" },
      choices: { parties: DD_PARTIES, rulingParty: { id: "DD_SED", name: "Sozialistische Einheitspartei Deutschlands", abbreviation: "SED", logoUrl: null }, isOnePartyState: true, imperialEligible: false, regionNoun: "region", homeRegions: [] },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    const notice = screen.getByRole("note");
    expect(notice).toHaveTextContent(/one-party state/i);
    expect(notice).toHaveTextContent("SED");
    // The alphabetically first party (CDU) is not misrepresented as the ruler.
    expect(notice).not.toHaveTextContent(/Join CDU/);
  });

  it("shows the one-party briefing for a one-party country instead of a generic party list", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "RU", countryName: "Soviet Union", regionNoun: "region" },
      choices: { parties: [{ id: "RU_CPSU", name: "Communist Party", abbreviation: "CPSU", color: "#CC0000", logoUrl: null, economicPosition: -4, socialPosition: 2, regimeStatus: "ruling" }], rulingParty: { id: "RU_CPSU", name: "Communist Party", abbreviation: "CPSU", logoUrl: null }, isOnePartyState: true, imperialEligible: false, regionNoun: "region", homeRegions: [] },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    expect(screen.getByText(/one-party state/i)).toBeInTheDocument();
  });

  it("surfaces the authored regime marker on the party step", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "DD", countryName: "East Germany", regionNoun: "region" },
      choices: { parties: DD_PARTIES, rulingParty: { id: "DD_SED", name: "Sozialistische Einheitspartei Deutschlands", abbreviation: "SED", logoUrl: null }, isOnePartyState: true, imperialEligible: false, regionNoun: "region", homeRegions: [] },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    const partyStep = screen.getByRole("heading", { name: /^Party/ }).closest("section")!;
    expect(within(partyStep).getByText(/Ruling/)).toBeInTheDocument();
    expect(within(partyStep).getByText(/Approved/)).toBeInTheDocument();
  });

  it("shows the imperial notice for an imperial-eligible country", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "UK", countryName: "United Kingdom", regionNoun: "region" },
      choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: true, regionNoun: "region", homeRegions: [] },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    expect(screen.getByText("Ceremonial imperial role")).toBeInTheDocument();
  });

  describe("imperial role panel (#242 imperial slice)", () => {
    function ukProps(): CharacterCreationScreenProps {
      return props({
        selection: { era: "1953", countryId: "UK", countryName: "United Kingdom", regionNoun: "region" },
        choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: true, regionNoun: "region", homeRegions: [] },
      });
    }

    it("previews the gender-aware ceremonial title once gender is chosen", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...ukProps()} />);
      await openDirectReview(user);
      await user.click(screen.getByRole("button", { name: "Female" }));
      expect(screen.getByText(/Title:/)).toHaveTextContent("Queen");
      expect(screen.getByText(/displayed as/i)).toHaveTextContent("Queen Eleanor Vance");
    });

    it("names the reference starter corporation and its starting capital", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...ukProps()} />);
      await openDirectReview(user);
      expect(screen.getByText(/Royal Estate/)).toBeInTheDocument();
      expect(screen.getByText(/\$50,000,000/)).toBeInTheDocument();
    });

    it("titles the JP head of state from the same reference source", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...props({
        selection: { era: "1953", countryId: "JP", countryName: "Japan", regionNoun: "region" },
        choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: true, regionNoun: "region", homeRegions: [] },
      })} />);
      await openDirectReview(user);
      await user.click(screen.getByRole("button", { name: "Male" }));
      expect(screen.getByText(/Title:/)).toHaveTextContent("Emperor");
      expect(screen.getByText(/Chrysanthemum Properties/)).toBeInTheDocument();
    });

    it("refuses imperial creation honestly instead of offering an imperial form", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...ukProps()} />);
      await openDirectReview(user);
      expect(screen.getByText(/created separately by an administrator/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Create Imperial Character/i })).not.toBeInTheDocument();
    });

    it("claims no title or corporation for an eligible country the reference leaves unconfigured", () => {
      render(<CharacterCreationScreen {...props({
        selection: { era: "1953", countryId: "ES", countryName: "Spain", regionNoun: "state" },
        choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: true, regionNoun: "state", homeRegions: [] },
      })} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      expect(screen.getByText(/imperial/i)).toBeInTheDocument();
      expect(screen.queryByText(/Title:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$50,000,000/)).not.toBeInTheDocument();
    });

    it("shows no imperial panel for a country with no imperial role", () => {
      render(<CharacterCreationScreen {...props()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      expect(screen.queryByText(/imperial/i)).not.toBeInTheDocument();
    });
  });

  describe("one-party independent warning (#242 conditional flow)", () => {
    function ddProps(): CharacterCreationScreenProps {
      return props({
        selection: { era: "1953", countryId: "DD", countryName: "East Germany", regionNoun: "region" },
        choices: { parties: DD_PARTIES, rulingParty: { id: "DD_SED", name: "Sozialistische Einheitspartei Deutschlands", abbreviation: "SED", logoUrl: null }, isOnePartyState: true, imperialEligible: false, regionNoun: "region", homeRegions: [] },
      });
    }

    it("warns when Independent is deliberately picked in a one-party state", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...ddProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      // The briefing is there, but no independent warning until the pick.
      expect(screen.queryByText(/0\.0x vote weight/)).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Independent" }));
      const warning = screen.getByText(/0\.0x vote weight/);
      expect(warning).toHaveTextContent(/cannot be fielded for the legislature/);
      expect(warning).toHaveTextContent(/Join the ruling party and reform it from inside/);
    });

    it("clears the warning when the ruling party is picked instead", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...ddProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      await user.click(screen.getByRole("button", { name: "Independent" }));
      expect(screen.getByText(/0\.0x vote weight/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /SED/ }));
      expect(screen.queryByText(/0\.0x vote weight/)).not.toBeInTheDocument();
    });

    it("never warns for a competitive country", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...props()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      await user.click(screen.getByRole("button", { name: "Independent" }));
      expect(screen.queryByText(/0\.0x vote weight/)).not.toBeInTheDocument();
    });

    it("keeps the six reference step subtitles word-identical", () => {
      render(<CharacterCreationScreen {...props()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      for (const subtitle of [
        "Sets your offices, parties, currency, and electoral rules.",
        "Voter groups weigh these when they decide whether you are one of them.",
        "Your first constituency. Its electorate decides your early races.",
        "Drag your pin. Distance to a platform is what primaries and general elections measure.",
        "A party gives you ballot access, a primary, and a machine. Independent is a real choice, not a default, so pick one deliberately.",
        "Every stat starts at 1. Spend 21 points on top of that. These shift as you play.",
      ]) {
        expect(screen.getByText(subtitle)).toBeInTheDocument();
      }
    });
  });

  describe("party picker marks (#244 slice)", () => {
    const LOGO_PARTIES = [
      { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3B82F6", logoUrl: "/party-logos/us-dem.png", economicPosition: -3, socialPosition: -2 },
      { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", logoUrl: null, economicPosition: 3, socialPosition: 2 },
    ];

    it("renders the authored logo image inside the picker when logoUrl exists", () => {
      render(<CharacterCreationScreen {...props({
        choices: { parties: LOGO_PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state", homeRegions: [] },
      })} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      const button = screen.getByRole("button", { name: "DEM Democratic Party" });
      const img = button.querySelector(".ahd-mark img");
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute("src", "/party-logos/us-dem.png");
    });

    it("falls back to honest initials with no image when logoUrl is null", () => {
      render(<CharacterCreationScreen {...props()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      const button = screen.getByRole("button", { name: "REP Republican Party" });
      expect(button.querySelector(".ahd-mark img")).toBeNull();
      expect(button.querySelector(".ahd-mark-initials")?.textContent).toBe("REP");
    });

    it("keeps the party accessible name on the picker button beside the mark", () => {
      render(<CharacterCreationScreen {...props({
        choices: { parties: LOGO_PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state", homeRegions: [] },
      })} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      expect(screen.getByRole("button", { name: "DEM Democratic Party" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "REP Republican Party" })).toBeInTheDocument();
      // The mark itself stays decorative so the button label is not doubled.
      const mark = screen.getByRole("button", { name: "DEM Democratic Party" }).querySelector(".ahd-mark");
      expect(mark).toHaveAttribute("aria-hidden", "true");
    });

    it("toggles party selection through the marked picker buttons", async () => {
      const user = userEvent.setup();
      render(<CharacterCreationScreen {...props()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      const dem = screen.getByRole("button", { name: "DEM Democratic Party" });
      const rep = screen.getByRole("button", { name: "REP Republican Party" });
      await user.click(dem);
      expect(dem).toHaveAttribute("aria-pressed", "true");
      expect(rep).toHaveAttribute("aria-pressed", "false");
      await user.click(rep);
      expect(rep).toHaveAttribute("aria-pressed", "true");
      expect(dem).toHaveAttribute("aria-pressed", "false");
    });

    it("keeps the picker mark compact so chips wrap inside a 320px column", () => {
      render(<CharacterCreationScreen {...props()} />);
      fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
      const mark = screen.getByRole("button", { name: "DEM Democratic Party" }).querySelector(".ahd-mark") as HTMLElement;
      expect(mark).toHaveStyle({ width: "20px", height: "20px" });
    });
  });
});

describe("CharacterCreationScreen portrait/header identity (#348)", () => {
  function stubDecodableImage(width = 10, height = 10) {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = width;
      naturalHeight = height;
      width = width;
      height = height;
      private srcValue = "";
      set src(value: string) {
        this.srcValue = value;
        queueMicrotask(() => this.onload?.());
      }
      get src() { return this.srcValue; }
    }
    vi.stubGlobal("Image", FakeImage);
  }

  function fileInput(label: RegExp): HTMLInputElement {
    // The sr-only file inputs are labelled by their visible pick affordance.
    const labelEl = screen.getByText(label).closest("label")!;
    const input = labelEl.parentElement!.querySelector("input[type=file]")!;
    return input as HTMLInputElement;
  }

  it("renders the header band with gradient fallback and the portrait initial", () => {
    render(<CharacterCreationScreen {...props()} />);
    expect(screen.getByTestId("candidate-identity")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-header-band")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-header-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-portrait-fallback")).toHaveTextContent("E");
    expect(screen.getByTestId("candidate-name-preview")).toHaveTextContent("Eleanor Vance");
  });

  it("falls back to ? when the name is empty", () => {
    render(<CharacterCreationScreen {...props({ initialName: "" })} />);
    expect(screen.getByTestId("candidate-portrait-fallback")).toHaveTextContent("?");
    expect(screen.getByTestId("candidate-name-preview")).toHaveTextContent("Unnamed candidate");
  });

  it("rejects a non-image file with the reference message in one alert", async () => {
    render(<CharacterCreationScreen {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    const bad = new File(["not an image"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByTestId("candidate-identity").querySelector("#creation-portrait")!, { target: { files: [bad] } });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Use a JPEG, PNG, WebP, or GIF image.");
    expect(screen.queryByTestId("candidate-portrait-photo")).not.toBeInTheDocument();
  });

  it("rejects an oversize portrait", async () => {
    render(<CharacterCreationScreen {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("candidate-identity").querySelector("#creation-portrait")!, { target: { files: [big] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Portrait must be under 2 MB.");
  });

  it("shows decorative previews on pick, removes them, and submits both data URLs", async () => {
    stubDecodableImage();
    try {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CharacterCreationScreen {...props({ onSubmit })} />);
      await openDirectReview(user);
      const portrait = new File(["portrait-bytes"], "portrait.png", { type: "image/png" });
      const header = new File(["header-bytes"], "header.png", { type: "image/png" });
      fireEvent.change(fileInput(/^Add portrait$/), { target: { files: [portrait] } });
      const portraitPhoto = await screen.findByTestId("candidate-portrait-photo");
      expect(portraitPhoto).toHaveAttribute("alt", "");
      fireEvent.change(fileInput(/^Add header$/), { target: { files: [header] } });
      expect(await screen.findByTestId("candidate-header-photo")).toHaveAttribute("alt", "");
      // Remove controls clear the previews.
      await user.click(screen.getByRole("button", { name: "Remove portrait" }));
      expect(screen.queryByTestId("candidate-portrait-photo")).not.toBeInTheDocument();
      // Re-pick the portrait so the submit contract carries both images.
      fireEvent.change(fileInput(/^Add portrait$/), { target: { files: [portrait] } });
      await screen.findByTestId("candidate-portrait-photo");

      await completeBackground(user);
      fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "-3" } });
      fireEvent.change(screen.getByLabelText(/Social position/), { target: { value: "-2" } });
      await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
      await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
      await user.click(screen.getByRole("button", { name: /Create character/ }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const creation = onSubmit.mock.calls[0]![0];
      expect(creation.avatarUrl).toMatch(/^data:image\/png/);
      expect(creation.profileHeaderUrl).toMatch(/^data:image\/png/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("flattens a GIF pick to the persisted raster envelope on submit", async () => {
    stubDecodableImage();
    // jsdom ships no canvas encoder; stand in for the browser re-encode.
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() { } } as unknown as CanvasRenderingContext2D);
    const toDataURLSpy = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,ZmFrZQ==");
    try {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CharacterCreationScreen {...props({ onSubmit })} />);
      const gif = new File(["gif-bytes"], "anim.gif", { type: "image/gif" });
      fireEvent.change(screen.getByTestId("candidate-identity").querySelector("#creation-portrait")!, { target: { files: [gif] } });
      await screen.findByTestId("candidate-portrait-photo");
      await completeBackground(user);
      fireEvent.change(screen.getByLabelText(/Economic position/), { target: { value: "-3" } });
      fireEvent.change(screen.getByLabelText(/Social position/), { target: { value: "-2" } });
      await user.click(screen.getByRole("button", { name: "DEM Democratic Party" }));
      await user.click(screen.getByRole("button", { name: /Spread evenly/i }));
      await user.click(screen.getByRole("button", { name: /Create character/ }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const creation = onSubmit.mock.calls[0]![0];
      // The save/profile envelope only persists PNG, JPEG and WebP rasters;
      // a GIF pick must never ride the submit contract as data:image/gif.
      expect(creation.avatarUrl).toMatch(/^data:image\/(png|jpeg|webp);base64,/);
    } finally {
      getContextSpy.mockRestore();
      toDataURLSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("passes a header under the 4 MB cap through without re-encoding", async () => {
    stubDecodableImage();
    try {
      render(<CharacterCreationScreen {...props()} />);
      const header = new File([new Uint8Array(3 * 1024 * 1024)], "wide.png", { type: "image/png" });
      fireEvent.change(screen.getByTestId("candidate-identity").querySelector("#creation-header")!, { target: { files: [header] } });
      expect(await screen.findByTestId("candidate-header-photo")).toHaveAttribute("src", expect.stringMatching(/^data:image\/png/));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
