import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TrendChart, type TrendSeries } from "./TrendChart";

const PRICE: TrendSeries = {
  id: "price",
  label: "Share price",
  color: "#4c9aff",
  points: [
    { turn: 1, value: 700 },
    { turn: 2, value: 774 },
  ],
  format: (v) => `$${v.toFixed(2)}`,
};

const EARNINGS: TrendSeries = {
  id: "earnings",
  label: "Earnings",
  color: "#98c379",
  points: [
    { turn: 1, value: 900 },
    { turn: 2, value: 1000 },
  ],
  format: (v) => `$${v.toFixed(2)}`,
};

describe("TrendChart plotted series", () => {
  it("plots one polyline per recorded series with one vertex per point", () => {
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[PRICE]}
        emptyMessage="No recorded share-price history."
      />,
    );
    const img = screen.getByRole("img", { name: /price trend/i });
    expect(img).toHaveAttribute("viewBox", expect.stringContaining("0 0"));
    const line = img.querySelector('polyline[data-series="price"]');
    expect(line).not.toBeNull();
    // Two recorded points produce two vertices and nothing invented.
    expect(line!.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(2);
  });

  it("summarizes the latest recorded value and direction in the accessible label", () => {
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[PRICE]}
        emptyMessage="No recorded share-price history."
      />,
    );
    expect(screen.getByRole("img", { name: /price trend/i })).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/\$774\.00.*turn 2.*up/i),
    );
  });

  it("draws labelled reference lines without treating them as data", () => {
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[PRICE]}
        refLines={[{ value: 737, label: "Average" }]}
        emptyMessage="No recorded share-price history."
      />,
    );
    const img = screen.getByRole("img", { name: /price trend/i });
    const ref = img.querySelector('line[data-ref="Average"]');
    expect(ref).not.toBeNull();
    // Reference lines never gain series vertices.
    expect(img.querySelectorAll("polyline")).toHaveLength(1);
    expect(screen.getByText("Average")).toBeInTheDocument();
  });

  it("renders a single recorded point as a marker, never an invented line", () => {
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[{ ...PRICE, points: [{ turn: 1, value: 700 }] }]}
        emptyMessage="No recorded share-price history."
      />,
    );
    const img = screen.getByRole("img", { name: /price trend/i });
    expect(img.querySelector("polyline")).toBeNull();
    expect(img.querySelector('circle[data-point="price-1"]')).not.toBeNull();
    expect(screen.getByText(/one recorded point/i)).toBeInTheDocument();
  });
});

describe("TrendChart empty history", () => {
  it("renders the explicit unavailable state and no chart when nothing is recorded", () => {
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[{ ...PRICE, points: [] }]}
        emptyMessage="No recorded share-price history."
      />,
    );
    expect(screen.getByText("No recorded share-price history.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("TrendChart table equivalent", () => {
  it("lists every recorded turn and formatted value", () => {
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[PRICE]}
        emptyMessage="No recorded share-price history."
      />,
    );
    const table = screen.getByRole("table", { name: /price trend data/i });
    expect(table).toHaveTextContent("Turn 1");
    expect(table).toHaveTextContent("$700.00");
    expect(table).toHaveTextContent("Turn 2");
    expect(table).toHaveTextContent("$774.00");
  });

  it("caps a long recorded series in the table with an explicit truncation note", () => {
    const long: TrendSeries = {
      ...PRICE,
      points: Array.from({ length: 40 }, (_, i) => ({ turn: i + 1, value: 700 + i })),
    };
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[long]}
        emptyMessage="No recorded share-price history."
      />,
    );
    expect(screen.getByText(/chart plots all 40 recorded points; table shows the last 30 records/i)).toBeInTheDocument();
    // The chart itself still plots every recorded point.
    const line = screen
      .getByRole("img", { name: /price trend/i })
      .querySelector('polyline[data-series="price"]')!;
    expect(line.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(40);
  });
});

describe("TrendChart series switching", () => {
  it("offers touch-safe series buttons that switch the plotted series", () => {
    render(
      <TrendChart
        id="company-trend"
        title="Company trend"
        series={[PRICE, EARNINGS]}
        emptyMessage="No recorded history."
      />,
    );
    const allButton = screen.getByRole("button", { name: /all series/i });
    const priceButton = screen.getByRole("button", { name: /share price/i });
    const earningsButton = screen.getByRole("button", { name: /^earnings/i });
    for (const button of [allButton, priceButton, earningsButton]) {
      expect(button).toHaveAttribute("aria-pressed");
      // 44x44 touch target holds at 320px and 390px widths.
      expect(button.style.minHeight).toBe("44px");
      expect(button.style.minWidth).toBe("44px");
    }
    expect(allButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(earningsButton);
    expect(earningsButton).toHaveAttribute("aria-pressed", "true");
    expect(priceButton).toHaveAttribute("aria-pressed", "false");
    expect(allButton).toHaveAttribute("aria-pressed", "false");
    const img = screen.getByRole("img", { name: /company trend/i });
    expect(img.querySelector('polyline[data-series="earnings"]')).not.toBeNull();
    expect(img.querySelector('polyline[data-series="price"]')).toBeNull();
    expect(screen.getByRole("table", { name: /company trend data/i })).toHaveTextContent("$1000.00");
  });
});

describe("TrendChart unavailable series recovery", () => {
  const EMPTY: TrendSeries = { ...PRICE, id: "empty", label: "Empty", points: [] };

  it("offers only recorded series, never an empty choice that strands the chart", () => {
    render(
      <TrendChart
        id="company-trend"
        title="Company trend"
        series={[PRICE, EARNINGS, EMPTY]}
        emptyMessage="No recorded history."
      />,
    );
    expect(screen.getByRole("button", { name: /share price/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^earnings/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^empty/i })).toBeNull();
    expect(screen.getByRole("img", { name: /company trend/i })).toBeInTheDocument();
  });

  it("hides the switcher when only one series has records", () => {
    render(
      <TrendChart
        id="company-trend"
        title="Company trend"
        series={[PRICE, EMPTY]}
        emptyMessage="No recorded history."
      />,
    );
    expect(screen.queryByRole("group", { name: /company trend series/i })).toBeNull();
    expect(screen.getByRole("img", { name: /company trend/i })).toBeInTheDocument();
  });

  it("falls back to all series when the default id has no records", () => {
    render(
      <TrendChart
        id="company-trend"
        title="Company trend"
        series={[PRICE, EARNINGS]}
        defaultSeriesId="missing"
        emptyMessage="No recorded history."
      />,
    );
    expect(screen.getByRole("button", { name: /all series/i })).toHaveAttribute("aria-pressed", "true");
    const img = screen.getByRole("img", { name: /company trend/i });
    expect(img.querySelector('polyline[data-series="price"]')).not.toBeNull();
    expect(img.querySelector('polyline[data-series="earnings"]')).not.toBeNull();
  });

  it("falls back to the first recorded series for single-series charts with an invalid default", () => {
    render(
      <TrendChart
        id="economy-trend"
        title="Economic trend"
        series={[{ ...PRICE, points: [] }, EARNINGS]}
        singleSeriesOnly
        defaultSeriesId="missing"
        emptyMessage="No recorded history."
      />,
    );
    const img = screen.getByRole("img", { name: /economic trend/i });
    expect(img.querySelector('polyline[data-series="earnings"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^empty/i })).toBeNull();
  });

  it("keeps the data disclosure at least 44px high", () => {
    render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[PRICE]}
        emptyMessage="No recorded share-price history."
      />,
    );
    const disclosure = screen.getByText("Chart data table");
    expect(disclosure.tagName.toLowerCase()).toBe("summary");
    expect((disclosure as HTMLElement).style.minHeight).toBe("44px");
  });
});

describe("TrendChart dense data table", () => {
  // Wallet "All series" renders seven columns (#507): at 320px the table
  // used to crush cells until currency values wrapped mid-number
  // ("$10,1 00.00", confirmed in headless Chromium), while the
  // overflow-x wrapper never engaged because the table stayed width 100%.
  const sixSeries: TrendSeries[] = [
    "Net worth",
    "Cash",
    "Savings",
    "Shares value",
    "Bonds value",
    "Funds",
  ].map((label, i) => ({
    id: label.toLowerCase().replace(/ /g, "-"),
    label,
    points: [
      { turn: 1, value: 10100 + i },
      { turn: 2, value: 11394 + i },
      { turn: 3, value: 2233445566.77 },
    ],
    format: (v: number) => `$${v.toFixed(2)}`,
  }));

  it("sizes the table to its content with values on one line instead of crushing cells", () => {
    render(
      <TrendChart
        id="portfolio-trend"
        title="Portfolio trend"
        defaultSeriesId="all"
        series={sixSeries}
        emptyMessage="No portfolio history recorded yet."
      />,
    );
    const table = screen.getByRole("table", { name: /portfolio trend data/i });
    expect(table.style.minWidth).toBe("max-content");
    for (const cell of Array.from(table.querySelectorAll("td"))) {
      expect((cell as HTMLElement).style.whiteSpace).toBe("nowrap");
    }
    expect(table).toHaveTextContent("$2233445566.77");
  });

  it("exposes the scroll container as a labelled tab stop so clipped columns stay keyboard-reachable", () => {
    render(
      <TrendChart
        id="portfolio-trend"
        title="Portfolio trend"
        defaultSeriesId="all"
        series={sixSeries}
        emptyMessage="No portfolio history recorded yet."
      />,
    );
    const table = screen.getByRole("table", { name: /portfolio trend data/i });
    const region = table.parentElement as HTMLElement;
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toMatch(/portfolio trend data table/i);
    expect(region.tabIndex).toBe(0);
    expect(region.style.overflowX).toBe("auto");
  });
});

describe("TrendChart responsive behavior", () => {
  it("scales the SVG fluidly inside a width-constrained wrapper", () => {
    const { container } = render(
      <TrendChart
        id="price-trend"
        title="Price trend"
        series={[PRICE]}
        emptyMessage="No recorded share-price history."
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    // No fixed pixel width anywhere, so 320px phones cannot overflow horizontally.
    expect(wrapper.style.maxWidth).toBe("100%");
    expect(wrapper.innerHTML).not.toMatch(/width:\s*\d+px/);
    expect(wrapper.innerHTML).not.toMatch(/min-width:\s*\d+(px|rem)/);
    const svg = screen.getByRole("img", { name: /price trend/i });
    expect(svg).toHaveAttribute("width", "100%");
  });
});
