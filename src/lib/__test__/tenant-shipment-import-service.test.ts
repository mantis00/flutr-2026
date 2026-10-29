/**
 * Phase 4: dedicated coverage for `tenant-shipment-import.ts` — previously exercised only
 * indirectly (via route tests mocking this whole module, and a comment in
 * `shipment-import-service.test.ts` describing the intended behavior without asserting it). This
 * file closes that gap directly: authorization enforcement, tenant resolution, and — most
 * importantly — that a tenant request can never enable species auto-create, regardless of what
 * its own request body asks for.
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/tenant", () => ({
  resolveTenantBySlug: jest.fn(),
}));

jest.mock("@/lib/services/shipment-import", () => ({
  buildShipmentImportPreviewForInstitution: jest.fn(),
  commitShipmentImportForInstitution: jest.fn(),
  exportShipmentWorkbookForInstitution: jest.fn(),
}));

import { auth } from "@/auth";
import { resolveTenantBySlug } from "@/lib/tenant";
import {
  buildShipmentImportPreviewForInstitution,
  commitShipmentImportForInstitution,
  exportShipmentWorkbookForInstitution,
} from "@/lib/services/shipment-import";
import {
  getTenantShipmentImportPreview,
  commitTenantShipmentImport,
  exportTenantShipmentWorkbook,
} from "@/lib/services/tenant-shipment-import";

const mockAuth = auth as jest.Mock;
const mockResolveTenantBySlug = resolveTenantBySlug as jest.Mock;
const mockBuildPreview = buildShipmentImportPreviewForInstitution as jest.Mock;
const mockCommit = commitShipmentImportForInstitution as jest.Mock;
const mockExport = exportShipmentWorkbookForInstitution as jest.Mock;

function mockSession(role: string) {
  mockAuth.mockResolvedValueOnce({
    user: { id: "1", role, institutionId: 7 },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

describe("tenant shipment import service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("getTenantShipmentImportPreview", () => {
    it("throws FORBIDDEN for a role below ADMIN", async () => {
      mockSession("EMPLOYEE");

      await expect(
        getTenantShipmentImportPreview({
          slug: "demo",
          raw_text: "irrelevant",
          source: { kind: "paste" },
        }),
      ).rejects.toThrow("FORBIDDEN");

      expect(mockResolveTenantBySlug).not.toHaveBeenCalled();
      expect(mockBuildPreview).not.toHaveBeenCalled();
    });

    it("resolves the tenant and forwards allowSpeciesAutocreateEligible: false, never true", async () => {
      mockSession("ADMIN");
      mockResolveTenantBySlug.mockResolvedValueOnce(7);
      mockBuildPreview.mockResolvedValueOnce({ issues: [] });

      await getTenantShipmentImportPreview({
        slug: "demo",
        raw_text: "raw workbook text",
        source: { kind: "paste" },
      });

      expect(mockResolveTenantBySlug).toHaveBeenCalledWith(
        expect.objectContaining({ role: "ADMIN" }),
        "demo",
      );
      expect(mockBuildPreview).toHaveBeenCalledWith({
        institutionId: 7,
        raw_text: "raw workbook text",
        source: { kind: "paste" },
        allowSpeciesAutocreateEligible: false,
      });
    });
  });

  describe("commitTenantShipmentImport", () => {
    it("throws FORBIDDEN for a role below ADMIN", async () => {
      mockSession("EMPLOYEE");

      await expect(
        commitTenantShipmentImport({
          slug: "demo",
          raw_text: "irrelevant",
          preview_hash: `sha256:${"a".repeat(64)}`,
          year: 2025,
        }),
      ).rejects.toThrow("FORBIDDEN");

      expect(mockResolveTenantBySlug).not.toHaveBeenCalled();
      expect(mockCommit).not.toHaveBeenCalled();
    });

    it("force-overrides allow_species_autocreate to false even when the request explicitly asks for true", async () => {
      mockSession("ADMIN");
      mockResolveTenantBySlug.mockResolvedValueOnce(7);
      mockCommit.mockResolvedValueOnce({ year: 2025, created: 1, skipped: 0, warnings: [] });

      await commitTenantShipmentImport({
        slug: "demo",
        raw_text: "raw workbook text",
        preview_hash: `sha256:${"a".repeat(64)}`,
        year: 2025,
        options: { allow_species_autocreate: true, allow_duplicate_headers: true },
      });

      expect(mockCommit).toHaveBeenCalledWith({
        institutionId: 7,
        raw_text: "raw workbook text",
        preview_hash: `sha256:${"a".repeat(64)}`,
        year: 2025,
        options: {
          allow_species_autocreate: false, // overridden — never trusts the request body here
          allow_duplicate_headers: true, // every other option still passes through unchanged
        },
      });
    });

    it("still force-disables allow_species_autocreate when options are omitted entirely", async () => {
      mockSession("ADMIN");
      mockResolveTenantBySlug.mockResolvedValueOnce(7);
      mockCommit.mockResolvedValueOnce({ year: 2025, created: 0, skipped: 1, warnings: [] });

      await commitTenantShipmentImport({
        slug: "demo",
        raw_text: "raw workbook text",
        preview_hash: `sha256:${"a".repeat(64)}`,
        year: 2025,
      });

      expect(mockCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ allow_species_autocreate: false }),
        }),
      );
    });
  });

  describe("exportTenantShipmentWorkbook", () => {
    it("throws FORBIDDEN for a role below ADMIN", async () => {
      mockSession("EMPLOYEE");

      await expect(exportTenantShipmentWorkbook({ slug: "demo" })).rejects.toThrow("FORBIDDEN");
      expect(mockExport).not.toHaveBeenCalled();
    });

    it("resolves the tenant and forwards the range to the shared exporter", async () => {
      mockSession("ADMIN");
      mockResolveTenantBySlug.mockResolvedValueOnce(7);
      mockExport.mockResolvedValueOnce(Buffer.from("xlsx"));

      await exportTenantShipmentWorkbook({
        slug: "demo",
        range: { from: "2020-01-01", to: "2024-12-31" },
      });

      expect(mockExport).toHaveBeenCalledWith({
        institutionId: 7,
        range: { from: "2020-01-01", to: "2024-12-31" },
      });
    });
  });
});
