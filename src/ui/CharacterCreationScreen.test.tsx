import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterCreationScreen } from "./CharacterCreationScreen";
import type { CharacterCreationScreenProps } from "../game/types";

const PARTIES = [
  { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3B82F6", logoUrl: null, economicPosition: -3, socialPosition: -2 },
  { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", logoUrl: null, economicPosition: 3, socialPosition: 2 },
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
    choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state" },
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
    await user.selectOptions(screen.getByRole("combobox"), "CA");
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
    await user.selectOptions(screen.getByRole("combobox"), "CA");
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
    await user.type(screen.getByLabelText(/Name/i), "Eleanor Vance");
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
    await user.type(screen.getByLabelText(/Name/i), "Eleanor Vance");
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
    await user.type(screen.getByLabelText(/Name/i), "Eleanor Vance");
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
      choices: { parties: DD_PARTIES, rulingParty: { id: "DD_SED", name: "Sozialistische Einheitspartei Deutschlands", abbreviation: "SED", logoUrl: null }, isOnePartyState: true, imperialEligible: false, regionNoun: "region" },
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
      choices: { parties: [{ id: "RU_CPSU", name: "Communist Party", abbreviation: "CPSU", color: "#CC0000", logoUrl: null, economicPosition: -4, socialPosition: 2, regimeStatus: "ruling" }], rulingParty: { id: "RU_CPSU", name: "Communist Party", abbreviation: "CPSU", logoUrl: null }, isOnePartyState: true, imperialEligible: false, regionNoun: "region" },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    expect(screen.getByText(/one-party state/i)).toBeInTheDocument();
  });

  it("surfaces the authored regime marker on the party step", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "DD", countryName: "East Germany", regionNoun: "region" },
      choices: { parties: DD_PARTIES, rulingParty: { id: "DD_SED", name: "Sozialistische Einheitspartei Deutschlands", abbreviation: "SED", logoUrl: null }, isOnePartyState: true, imperialEligible: false, regionNoun: "region" },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    const partyStep = screen.getByRole("heading", { name: /^Party/ }).closest("section")!;
    expect(within(partyStep).getByText(/Ruling/)).toBeInTheDocument();
    expect(within(partyStep).getByText(/Approved/)).toBeInTheDocument();
  });

  it("shows the imperial notice for an imperial-eligible country", () => {
    render(<CharacterCreationScreen {...props({
      selection: { era: "1953", countryId: "UK", countryName: "United Kingdom", regionNoun: "region" },
      choices: { parties: PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: true, regionNoun: "region" },
    })} />);
    fireEvent.click(screen.getByRole("button", { name: /Review all details/i }));
    expect(screen.getByText(/imperial/i)).toBeInTheDocument();
  });

  describe("party picker marks (#244 slice)", () => {
    const LOGO_PARTIES = [
      { id: "US_DEM", name: "Democratic Party", abbreviation: "DEM", color: "#3B82F6", logoUrl: "/party-logos/us-dem.png", economicPosition: -3, socialPosition: -2 },
      { id: "US_REP", name: "Republican Party", abbreviation: "REP", color: "#EF4444", logoUrl: null, economicPosition: 3, socialPosition: 2 },
    ];

    it("renders the authored logo image inside the picker when logoUrl exists", () => {
      render(<CharacterCreationScreen {...props({
        choices: { parties: LOGO_PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state" },
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
        choices: { parties: LOGO_PARTIES, rulingParty: null, isOnePartyState: false, imperialEligible: false, regionNoun: "state" },
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
