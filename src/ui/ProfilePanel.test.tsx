import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePanel } from "./ProfilePanel";
import type { ProfileUpdate, ProfileView } from "../game/profileTypes";

const BASE: ProfileView = {
  name: "Ada Crane",
  bio: "Organizer from the north ward.",
  avatarUrl: null,
  campaignSongUrl: "",
  campaignSongAutoplay: false,
  country: { id: "US", name: "United States" },
  homeRegion: { id: "US-NY", name: "New York" },
  party: { id: "7", name: "Labor Caucus", color: "#2563eb" },
  office: "Councilor",
  officeDestination: { route: "legislature", id: "lower" },
  policies: { economic: -1.5, social: 2 },
  stats: { energy: 7, debate: 4 },
  careerHistory: [{ id: "race-1", office: "House", result: "Elected", turn: 12 }],
  achievements: [{ slug: "turn_one", name: "In at the Ground Floor", description: "Took an action in turn one" }],
  resourceDetails: {
    actions: { base: 4, seat: 2, cabinet: 0, chair: 0, office: 2, party: 0, penalty: 0, threshold: 100, cap: 200, next: 9, refresh: 6 },
    funds: { enabled: true, base: 10000, donor: 500, office: 0, tax: 500, regularNet: 10000 },
    partyInfluence: null,
    history: [
      { turn: 11, cash: 1000, savings: 300, funds: 5000 },
      { turn: 12, cash: 1200, savings: 300, funds: 5400 },
    ],
  },
  standing: {
    actions: 5,
    actionCap: 12,
    actionGain: 4,
    politicalInfluence: 32.5,
    nationalInfluence: null,
    favorability: 61,
    infamy: 4,
    partyInfluence: null,
  },
  finances: {
    currency: "USD",
    cash: 1200,
    savings: 300,
    funds: 5400,
    donorBaseLevel: 3,
    regularIncome: 150,
    donorIncome: 90,
  },
};

function renderPanel(overrides: Partial<ProfileView> = {}, props = {}) {
  const profile = {
    ...BASE,
    ...overrides,
    standing: { ...BASE.standing, ...(overrides.standing ?? {}) },
    finances: { ...BASE.finances, ...(overrides.finances ?? {}) },
  };
  return render(
    <ProfilePanel
      profile={profile}
      busy={false}
      onNavigate={vi.fn()}
      onUpdateProfile={vi.fn(async () => true)}
      {...props}
    />
  );
}

class LoadImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  height = 0;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

class BrokenImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onerror?.());
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProfilePanel", () => {
  it("renders the header portrait, name, party, office, home region and country", () => {
    const onNavigate = vi.fn();
    renderPanel({}, { onNavigate });
    expect(screen.getByRole("heading", { name: "Ada Crane" })).toBeInTheDocument();
    expect(screen.getByText("Labor Caucus")).toBeInTheDocument();
    expect(screen.getByText("Councilor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New York" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "United States" })).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows the saved picture with the expected alt text when present", () => {
    renderPanel({ avatarUrl: "data:image/png;base64,AAA" });
    expect(screen.getByAltText("Ada Crane profile picture")).toBeInTheDocument();
  });

  it("resolves every profile destination through the Native route map", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderPanel({}, { onNavigate });
    await user.click(screen.getByRole("button", { name: "Campaign Office" }));
    expect(onNavigate).toHaveBeenCalledWith("actions");
    await user.click(screen.getByRole("button", { name: "View portfolio" }));
    expect(onNavigate).toHaveBeenCalledWith("portfolio");
    await user.click(screen.getByRole("button", { name: "New York" }));
    expect(onNavigate).toHaveBeenCalledWith("state", "US-NY");
    await user.click(screen.getByRole("button", { name: "Labor Caucus" }));
    expect(onNavigate).toHaveBeenCalledWith("partyDetails", "7");
    await user.click(screen.getByRole("button", { name: "Councilor" }));
    expect(onNavigate).toHaveBeenCalledWith("legislature", "lower");
    await user.click(screen.getByRole("button", { name: "United States" }));
    expect(onNavigate).toHaveBeenCalledWith("nations", "US");
    await user.click(screen.getByRole("button", { name: "Fundraising actions" }));
    expect(onNavigate).toHaveBeenCalledWith("actions", "fundraising");
    await user.click(screen.getByRole("button", { name: "View national policy" }));
    expect(onNavigate).toHaveBeenCalledWith("policy");
    await user.click(screen.getByRole("button", { name: "View race: House" }));
    expect(onNavigate).toHaveBeenCalledWith("electionDetails", "race-1");
  });

  it("renders the political hierarchy in reference order from real projected state", () => {
    renderPanel();
    const sections = Array.from(document.querySelectorAll(".ahd-profile > section"))
      .map((node) => node.getAttribute("aria-label"));
    expect(sections).toEqual([
      "Character", "Campaign song", "Biography", "Political standing", "Character stats",
      "Policy", "Finances", "Career history", "Achievements",
    ]);
    expect(screen.getByText("In at the Ground Floor")).toBeInTheDocument();
    expect(screen.getByText("House")).toBeInTheDocument();
  });

  it("exposes action, party-influence and income breakdowns from the shared projection", async () => {
    const user = userEvent.setup();
    renderPanel({
      resourceDetails: {
        ...BASE.resourceDetails,
        partyInfluence: { current: 10, closeness: 1.25, leadership: 2, infamyPenalty: 0.5, gain: 0.75, next: 10.25, bonusActions: 1 },
      },
    });
    await user.click(screen.getByText("Action breakdown"));
    expect(screen.getByText("Elected seat office")).toBeInTheDocument();
    expect(screen.getByText("Party influence bonus")).toBeInTheDocument();
    expect(screen.getByText("Platform closeness")).toBeInTheDocument();
    expect(screen.getByText(/Party influence gain/)).toBeInTheDocument();
    await user.click(screen.getByText("Income and cash breakdown"));
    expect(screen.getByText("Regular net generation")).toBeInTheDocument();
  });

  it("omits conditional political sections when local state is absent", () => {
    renderPanel({ stats: null, policies: null });
    expect(screen.queryByRole("region", { name: "Character stats" })).not.toBeInTheDocument();
    expect(screen.queryByText("Economic")).not.toBeInTheDocument();
  });

  it("saves an edited biography and closes the editor on success", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel({}, { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Edit biography" }));
    const box = screen.getByRole("textbox", { name: "Biography" });
    await user.clear(box);
    await user.type(box, "New bio text.");
    await user.click(screen.getByRole("button", { name: "Save biography" }));
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith({ bio: "New bio text." }));
    expect(screen.queryByRole("textbox", { name: "Biography" })).not.toBeInTheDocument();
  });

  it("keeps the draft and reports when a biography save returns false", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => false);
    renderPanel({}, { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Edit biography" }));
    await user.clear(screen.getByRole("textbox", { name: "Biography" }));
    await user.type(screen.getByRole("textbox", { name: "Biography" }), "Unsaved draft.");
    await user.click(screen.getByRole("button", { name: "Save biography" }));
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Biography" })).toHaveValue("Unsaved draft.");
  });

  it("rejects an overlong biography without saving", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel({}, { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Edit biography" }));
    const box = screen.getByRole("textbox", { name: "Biography" }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "x".repeat(501) } });
    await user.click(screen.getByRole("button", { name: "Save biography" }));
    expect(onUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("rejects a non image file without updating", async () => {
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel({}, { onUpdateProfile });
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });

  it("rejects an oversized picture without updating", async () => {
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel({}, { onUpdateProfile });
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const file = new File([big], "face.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });

  it("saves an accepted picture as a data URL after decode", async () => {
    vi.stubGlobal("Image", LoadImage);
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel({}, { onUpdateProfile });
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const file = new File([bytes], "face.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledTimes(1));
    const calls = onUpdateProfile.mock.calls as unknown as Array<[ProfileUpdate]>;
    const update = calls[0][0] as { avatarUrl: string };
    expect(typeof update.avatarUrl).toBe("string");
    expect(update.avatarUrl.startsWith("data:image/png")).toBe(true);
  });

  it("shows an error and never updates when the picture cannot be decoded", async () => {
    vi.stubGlobal("Image", BrokenImage);
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel({}, { onUpdateProfile });
    const file = new File([new Uint8Array([1, 2, 3])], "face.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });

  it("removes the picture through a null update and reports a false result", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => false);
    renderPanel({ avatarUrl: "data:image/png;base64,AAA" }, { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Remove picture" }));
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith({ avatarUrl: null }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("marks missing national and party figures unavailable instead of zero", () => {
    renderPanel();
    const values = screen.getAllByText("Not available yet");
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("hides party influence for independents and disables forms while busy", () => {
    renderPanel({ party: null }, { busy: true });
    expect(screen.queryByText("Party influence")).not.toBeInTheDocument();
    expect(screen.getByText("Independent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit biography" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Upload picture" })).toBeDisabled();
  });

  it("saves a normalized campaign song, owner autoplay and supports clearing", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    const first = renderPanel({}, { onUpdateProfile });
    await user.type(screen.getByRole("textbox", { name: "YouTube URL or video ID" }), "https://youtu.be/dQw4w9WgXcQ");
    await user.click(screen.getByRole("checkbox", { name: "Play automatically on my profile" }));
    await user.click(screen.getByRole("button", { name: "Save campaign song" }));
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith({
      campaignSongUrl: "https://youtu.be/dQw4w9WgXcQ", campaignSongAutoplay: true,
    }));
    first.unmount();
    renderPanel({ campaignSongUrl: "dQw4w9WgXcQ", campaignSongAutoplay: true }, { onUpdateProfile });
    await user.click(screen.getByRole("button", { name: "Clear campaign song" }));
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalledWith({ campaignSongUrl: "", campaignSongAutoplay: false }));
  });

  it("reports invalid campaign song input without calling the session", async () => {
    const user = userEvent.setup();
    const onUpdateProfile = vi.fn(async () => true);
    renderPanel({}, { onUpdateProfile });
    await user.type(screen.getByRole("textbox", { name: "YouTube URL or video ID" }), "not a video");
    await user.click(screen.getByRole("button", { name: "Save campaign song" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid YouTube");
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });
});
