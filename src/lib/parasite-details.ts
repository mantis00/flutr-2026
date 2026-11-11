export const PARASITE_TYPES = ["wasp", "fly", "other"] as const;

export type ParasiteType = (typeof PARASITE_TYPES)[number];

export type ParasiteDetail = {
  type: ParasiteType;
  count: number;
  description?: string | null;
};

export function sumParasiteDetails(details: readonly ParasiteDetail[]): number {
  return details.reduce((sum, detail) => sum + detail.count, 0);
}
