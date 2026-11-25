export function getNextActiveOptionIndex(
  activeIndex: number,
  optionCount: number,
  direction: -1 | 1,
): number {
  if (optionCount <= 0) {
    return -1;
  }

  if (activeIndex < 0 || activeIndex >= optionCount) {
    return direction === 1 ? 0 : optionCount - 1;
  }

  return (activeIndex + direction + optionCount) % optionCount;
}
