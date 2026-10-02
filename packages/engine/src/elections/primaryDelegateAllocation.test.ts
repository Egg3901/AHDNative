import { describe, expect, it } from "vitest";
import { allocateDelegates } from "./primaryDelegateAllocation.js";

describe("source presidential delegate allocation", () => {
  it("uses the Democratic 15 percent floor before Hamilton apportionment", () => {
    const result = allocateDelegates("PR", { a: 45, b: 40, c: 15 }, 20);

    expect(result).toEqual({ byCandidate: { a: 9, b: 8, c: 3 }, totalAwarded: 20, nonViable: [] });
  });

  it("redistributes below-floor votes proportionally among viable candidates", () => {
    const result = allocateDelegates("PR", { a: 70, b: 20, c: 10 }, 20);

    expect(result).toEqual({ byCandidate: { a: 16, b: 4 }, totalAwarded: 20, nonViable: ["c"] });
  });

  it("uses cumulative vote priority to break a source WTA tie", () => {
    const result = allocateDelegates("WTA", { a: 100, b: 100 }, 28, { a: 500, b: 600 });

    expect(result).toEqual({ byCandidate: { b: 28 }, totalAwarded: 28, nonViable: [] });
  });
});
