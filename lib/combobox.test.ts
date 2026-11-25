import { describe, expect, it } from "vitest";
import { getNextActiveOptionIndex } from "./combobox";

describe("getNextActiveOptionIndex", () => {
  it.each([
    [-1, 3, 1, 0],
    [-1, 3, -1, 2],
    [2, 3, 1, 0],
    [0, 3, -1, 2],
    [1, 3, 1, 2],
    [0, 0, 1, -1],
  ] as const)(
    "moves from %i across %i options with direction %i to %i",
    (activeIndex, optionCount, direction, expectedIndex) => {
      expect(
        getNextActiveOptionIndex(activeIndex, optionCount, direction),
      ).toBe(expectedIndex);
    },
  );
});
