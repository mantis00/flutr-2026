import { computeOtherParasiteCount, normalizeParasiteBreakdown } from "@/lib/parasite-breakdown";

describe("parasite breakdown", () => {
  it("keeps an unentered breakdown untracked instead of assuming Other", () => {
    expect(normalizeParasiteBreakdown(null, null)).toEqual({
      waspCount: null,
      flyCount: null,
    });
    expect(computeOtherParasiteCount(4, null, null)).toBeNull();
  });

  it("normalizes a partial entry and derives the unclassified remainder", () => {
    const breakdown = normalizeParasiteBreakdown(1, null);

    expect(breakdown).toEqual({ waspCount: 1, flyCount: 0 });
    expect(computeOtherParasiteCount(4, breakdown.waspCount, breakdown.flyCount)).toBe(3);
  });

  it("derives Other from the total after entered wasp and fly counts", () => {
    expect(computeOtherParasiteCount(4, 1, 1)).toBe(2);
  });

  it("treats explicit zero counts as a tracked breakdown", () => {
    expect(normalizeParasiteBreakdown(0, 0)).toEqual({ waspCount: 0, flyCount: 0 });
    expect(computeOtherParasiteCount(4, 0, 0)).toBe(4);
  });
});
