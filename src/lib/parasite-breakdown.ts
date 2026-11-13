export type ParasiteBreakdown = {
  waspCount: number | null;
  flyCount: number | null;
};

export function normalizeParasiteBreakdown(
  waspCount: number | null,
  flyCount: number | null,
): ParasiteBreakdown {
  if (waspCount === null && flyCount === null) {
    return { waspCount: null, flyCount: null };
  }

  return { waspCount: waspCount ?? 0, flyCount: flyCount ?? 0 };
}

export function computeOtherParasiteCount(
  total: number,
  waspCount: number | null,
  flyCount: number | null,
): number | null {
  if (waspCount === null && flyCount === null) return null;
  return total - (waspCount ?? 0) - (flyCount ?? 0);
}
