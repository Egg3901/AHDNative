import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewsPanel } from "./NewsPanel";
import type { NewsView } from "../game/types";

const clock = { turn: 4, date: "1953-02-01" };

const linked: NewsView = {
  id: "turn-4-election",
  title: "General election called",
  body: "Voters will choose a new House.",
  date: "1953-02-01",
  category: "Election",
  country: { id: "US", name: "United States" },
  party: { id: "p1", name: "Labor" },
  election: { id: "e1", name: "General Election" },
  event: { id: "event-election-call", name: "Election call" },
};

const unlinked: NewsView = {
  id: "turn-3-economy",
  title: "Markets rally",
  body: "Stocks moved higher after the budget.",
  date: "1953-01-31",
  category: "Economy",
  country: { id: "US", name: "United States" },
};

const followup: NewsView = {
  id: "turn-5-election-aftermath",
  title: "Election aftermath",
  body: "Coalition talks begin after the result.",
  date: "1953-02-02",
  category: "Politics",
  country: { id: "US", name: "United States" },
  election: { id: "e1", name: "General Election" },
  event: { id: "event-election-call", name: "Election call" },
};

function renderPanel(news: NewsView[] = [linked, unlinked], storageKey = "slot", handlers: Partial<{ onCountry: (id: string) => void; onParty: (id: string) => void; onElection: (id: string) => void }> = {}) {
  const onCountry = handlers.onCountry ?? vi.fn();
  const onParty = handlers.onParty ?? vi.fn();
  const onElection = handlers.onElection ?? vi.fn();
  const view = render(<NewsPanel news={news} clock={clock} storageKey={storageKey} onCountry={onCountry} onParty={onParty} onElection={onElection} />);
  return { onCountry, onParty, onElection, unmount: view.unmount };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("NewsPanel article detail", () => {
  it("filters the local wire by country, date, and category", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(screen.getByRole("combobox", { name: "News category" }), "Election");
    expect(screen.getByText("General election called")).toBeInTheDocument();
    expect(screen.queryByText("Markets rally")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "News category" }), "all");
    await user.selectOptions(screen.getByRole("combobox", { name: "News country" }), "US");
    await user.selectOptions(screen.getByRole("combobox", { name: "News date" }), "1953-01-31");
    expect(screen.queryByText("General election called")).not.toBeInTheDocument();
    expect(screen.getByText("Markets rally")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 items")).toBeInTheDocument();
  });

  it("reports an empty state when filters match nothing", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(screen.getByRole("combobox", { name: "News date" }), "1953-01-31");
    await user.selectOptions(screen.getByRole("combobox", { name: "News category" }), "Election");
    expect(screen.getByText("No news matches these filters.")).toBeInTheDocument();
  });

  it("opens the full article with related links backed by the record ids", async () => {
    const user = userEvent.setup();
    const { onCountry, onParty, onElection } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    const article = screen.getByRole("article", { name: "General election called" });
    expect(article).toHaveTextContent("Voters will choose a new House.");
    await user.click(within(article).getByRole("button", { name: "View United States" }));
    expect(onCountry).toHaveBeenCalledWith("US");
    await user.click(within(article).getByRole("button", { name: "View Labor" }));
    expect(onParty).toHaveBeenCalledWith("p1");
    await user.click(within(article).getByRole("button", { name: "View General Election" }));
    expect(onElection).toHaveBeenCalledWith("e1");
  });

  it("renders only the relations present in the record", async () => {
    const user = userEvent.setup();
    const { onCountry, onParty, onElection } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Read Markets rally" }));
    const article = screen.getByRole("article", { name: "Markets rally" });
    expect(article).toHaveTextContent("Stocks moved higher after the budget.");
    await user.click(within(article).getByRole("button", { name: "View United States" }));
    expect(onCountry).toHaveBeenCalledWith("US");
    expect(within(article).queryByRole("button", { name: "View Labor" })).not.toBeInTheDocument();
    expect(within(article).queryByRole("button", { name: "View General Election" })).not.toBeInTheDocument();
    expect(onParty).not.toHaveBeenCalled();
    expect(onElection).not.toHaveBeenCalled();
    expect(within(article).queryByRole("region", { name: "Event context" })).not.toBeInTheDocument();
  });

  it("links article event context to an event detail backed by local records", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPanel([linked, followup, unlinked], "event-slot");
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    const article = screen.getByRole("article", { name: "General election called" });
    await user.click(within(article).getByRole("button", { name: "View Election call" }));
    const event = screen.getByRole("article", { name: "Election call" });
    expect(event).toHaveTextContent("2 articles");
    // Only records carrying this event id are listed; the unrelated wire item is not.
    expect(within(event).getByRole("button", { name: "Read General election called" })).toBeInTheDocument();
    expect(within(event).getByRole("button", { name: "Read Election aftermath" })).toBeInTheDocument();
    expect(within(event).queryByRole("button", { name: "Read Markets rally" })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("opens event coverage articles and links related real destinations", async () => {
    const user = userEvent.setup();
    const { onCountry, onParty, onElection } = renderPanel([linked, followup, unlinked], "event-links-slot");
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View Election call" }));
    const event = screen.getByRole("article", { name: "Election call" });
    await user.click(within(event).getByRole("button", { name: "View United States" }));
    expect(onCountry).toHaveBeenCalledWith("US");
    await user.click(within(event).getByRole("button", { name: "View Labor" }));
    expect(onParty).toHaveBeenCalledWith("p1");
    await user.click(within(event).getByRole("button", { name: "View General Election" }));
    expect(onElection).toHaveBeenCalledWith("e1");
    // Opening coverage returns to the article view for that record.
    await user.click(within(event).getByRole("button", { name: "Read Election aftermath" }));
    expect(screen.getByRole("article", { name: "Election aftermath" })).toHaveTextContent("Coalition talks begin after the result.");
  });

  it("returns from the event detail to its article with focus and read state intact", async () => {
    const user = userEvent.setup();
    renderPanel([linked, followup, unlinked], "event-back-slot");
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View Election call" }));
    expect(screen.getByRole("heading", { name: "Election call" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Back to article" }));
    expect(screen.getByRole("article", { name: "General election called" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View Election call" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Back to news" }));
    expect(screen.getByRole("button", { name: "Read General election called" })).toHaveFocus();
    expect(screen.getByRole("article", { name: "General election called, read" })).toBeInTheDocument();
  });

  it("persists the open event detail per save slot across reload", async () => {
    const user = userEvent.setup();
    const first = renderPanel([linked, followup], "event-persist-a");
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    await user.click(screen.getByRole("button", { name: "View Election call" }));
    expect(screen.getByRole("article", { name: "Election call" })).toBeInTheDocument();
    first.unmount();

    const second = renderPanel([linked, followup], "event-persist-a");
    expect(screen.getByRole("article", { name: "Election call" })).toBeInTheDocument();
    second.unmount();

    renderPanel([linked, followup], "event-persist-b");
    expect(screen.queryByRole("article", { name: "Election call" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read General election called" })).toBeInTheDocument();
  });

  it("marks the article read and preserves selection across navigation and reload per save slot", async () => {
    const user = userEvent.setup();
    const first = renderPanel([linked, unlinked], "slot-a");
    expect(first.onCountry).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    expect(screen.getByRole("article", { name: "General election called" })).toBeInTheDocument();
    first.unmount();

    // Same save slot restores the selected read article after navigation.
    const second = renderPanel([linked, unlinked], "slot-a");
    expect(screen.getByRole("article", { name: "General election called" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to news" }));
    expect(screen.getByRole("article", { name: "General election called, read" })).toBeInTheDocument();
    second.unmount();

    // A different save slot starts unread with no selection.
    renderPanel([linked, unlinked], "slot-b");
    expect(screen.queryByRole("article", { name: "General election called" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read General election called" })).toBeInTheDocument();
  });

  it("moves focus into the article on open and back to its Read button on close", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Read General election called" }));
    expect(screen.getByRole("heading", { name: "General election called" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Back to news" }));
    expect(screen.getByRole("button", { name: "Read General election called" })).toHaveFocus();
  });

  it("opens the article from the keyboard and stays network-free", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPanel();
    screen.getByRole("button", { name: "Read General election called" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("article", { name: "General election called" })).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
