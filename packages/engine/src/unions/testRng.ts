import type { WorldRng } from "../rng.js";

/** Deterministic first-choice fixture that implements the complete RNG contract. */
export const FIRST_CHOICE_RNG: WorldRng = {
  next: () => 0,
  int: (min, max) => {
    if (max < min) throw new Error(`int(): max ${max} < min ${min}`);
    return min;
  },
  pick: <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("pick(): empty array");
    return items[0]!;
  },
  state: () => [0, 0, 0, 0],
};
