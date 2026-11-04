const mockLimit = jest.fn();
const mockWhere = jest.fn(() => ({ limit: mockLimit }));
const mockFrom = jest.fn(() => ({ where: mockWhere }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));
const mockReturning = jest.fn();
const mockOnConflictDoNothing = jest.fn(() => ({ returning: mockReturning }));
const mockValues = jest.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = jest.fn(() => ({ values: mockValues }));

jest.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

import { ensureSupplierExistsForGlobalImport } from "@/lib/queries/suppliers";

describe("supplier queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("ensureSupplierExistsForGlobalImport", () => {
    it("auto-creates missing import suppliers using the exact trimmed code", async () => {
      mockLimit.mockResolvedValueOnce([]);
      mockReturning.mockResolvedValueOnce([{ id: 42, code: "lps historical" }]);

      const supplier = await ensureSupplierExistsForGlobalImport(" lps historical ", {
        name: "lps historical",
        country: "Unknown",
        websiteUrl: null,
      });

      expect(mockValues).toHaveBeenCalledWith({
        code: "lps historical",
        name: "lps historical",
        country: "Unknown",
        website_url: null,
        is_active: false,
      });
      expect(supplier).toEqual({
        id: 42,
        code: "lps historical",
        wasGloballyMissing: true,
      });
    });

    it("returns the existing row when a concurrent insert wins the race", async () => {
      // Initial select: no match
      mockLimit.mockResolvedValueOnce([]);
      // onConflictDoNothing insert: no-op (concurrent process inserted first)
      mockReturning.mockResolvedValueOnce([]);
      // Re-select: finds the row inserted by the other process
      mockLimit.mockResolvedValueOnce([{ id: 42, code: "lps historical" }]);

      const supplier = await ensureSupplierExistsForGlobalImport(" lps historical ", {
        name: "lps historical",
        country: "Unknown",
        websiteUrl: null,
      });

      expect(supplier).toEqual({
        id: 42,
        code: "lps historical",
        wasGloballyMissing: true,
      });
    });

    it("uses the plain db client by default", async () => {
      mockLimit.mockResolvedValueOnce([{ id: 42, code: "LPS" }]);

      await ensureSupplierExistsForGlobalImport("LPS");

      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("uses a supplied executor for every read and write instead of the plain db client", async () => {
      const txLimit = jest.fn().mockResolvedValueOnce([]);
      const txWhere = jest.fn(() => ({ limit: txLimit }));
      const txFrom = jest.fn(() => ({ where: txWhere }));
      const txSelect = jest.fn(() => ({ from: txFrom }));
      const txReturning = jest.fn().mockResolvedValueOnce([{ id: 99, code: "GC" }]);
      const txOnConflictDoNothing = jest.fn(() => ({ returning: txReturning }));
      const txValues = jest.fn(() => ({ onConflictDoNothing: txOnConflictDoNothing }));
      const txInsert = jest.fn(() => ({ values: txValues }));

      const supplier = await ensureSupplierExistsForGlobalImport("GC", undefined, {
        select: txSelect,
        insert: txInsert,
      } as unknown as Parameters<typeof ensureSupplierExistsForGlobalImport>[2]);

      expect(supplier).toEqual({ id: 99, code: "GC", wasGloballyMissing: true });
      expect(txSelect).toHaveBeenCalledTimes(1);
      expect(txInsert).toHaveBeenCalledTimes(1);
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
