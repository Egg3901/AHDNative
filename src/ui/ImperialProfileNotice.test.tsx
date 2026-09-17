import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImperialProfileNotice } from "./ImperialProfileNotice";
import type { ImperialProfileView } from "../game/profileTypes";

const imperial: ImperialProfileView = {
  id: "IMP-1",
  sequentialId: 7,
  name: "George",
  fullName: "King George",
  title: "King",
  country: { id: "UK", name: "United Kingdom" },
  royalHouse: "Windsor",
  homeState: "London",
  bio: "Ceremonial head of state.",
  notice:
    "Imperial characters are created separately by an administrator on the live game; this offline career cannot create one.",
};

describe("ImperialProfileNotice (#54)", () => {
  it("renders the persisted imperial identity with its ceremonial title", () => {
    render(<ImperialProfileNotice imperial={imperial} />);
    expect(screen.getByRole("heading", { name: "King George" })).toBeInTheDocument();
    expect(screen.getByText("Windsor")).toBeInTheDocument();
    expect(screen.getByText("United Kingdom")).toBeInTheDocument();
  });

  it("states the admin-creation boundary honestly instead of offering an imperial form", () => {
    render(<ImperialProfileNotice imperial={imperial} />);
    expect(screen.getByText(/administrator/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create imperial/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("renders without a title claim where the reference configures none", () => {
    render(
      <ImperialProfileNotice
        imperial={{ ...imperial, title: null, fullName: "George", royalHouse: "Bernadotte", country: { id: "SE", name: "Sweden" } }}
      />,
    );
    expect(screen.getByRole("heading", { name: "George" })).toBeInTheDocument();
    expect(screen.queryByText("King George")).not.toBeInTheDocument();
  });
});
