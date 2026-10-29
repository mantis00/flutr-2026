import { NextRequest } from "next/server";

jest.mock("@/lib/services/tenant-shipment-import", () => ({
  getTenantShipmentImportPreview: jest.fn(),
  commitTenantShipmentImport: jest.fn(),
  exportTenantShipmentWorkbook: jest.fn(),
}));

// The tenant commit route imports `ShipmentImportValidationError` from the shared service
// module (not the tenant wrapper) to map it to a 400 response — mocked here with the same
// minimal class shape as the platform route test, for the same reason (avoids pulling in the
// real module's non-test-friendly dependency chain, e.g. @/auth).
jest.mock("@/lib/services/shipment-import", () => ({
  ShipmentImportValidationError: class ShipmentImportValidationError extends Error {
    issues: {
      rowNumber: number | null;
      field: string | null;
      value: string | null;
      message: string;
    }[];
    constructor(
      issues: {
        rowNumber: number | null;
        field: string | null;
        value: string | null;
        message: string;
      }[],
    ) {
      super("VALIDATION_FAILED");
      this.name = "ShipmentImportValidationError";
      this.issues = issues;
    }
  },
}));

import {
  getTenantShipmentImportPreview,
  commitTenantShipmentImport,
  exportTenantShipmentWorkbook,
} from "@/lib/services/tenant-shipment-import";
import { ShipmentImportValidationError } from "@/lib/services/shipment-import";
import { POST as previewImport } from "@/app/api/tenant/shipments/import/preview/route";
import { POST as commitImport } from "@/app/api/tenant/shipments/import/commit/route";
import { GET as exportShipments } from "@/app/api/tenant/shipments/export/route";

const mockGetTenantShipmentImportPreview = getTenantShipmentImportPreview as jest.Mock;
const mockCommitTenantShipmentImport = commitTenantShipmentImport as jest.Mock;
const mockExportTenantShipmentWorkbook = exportTenantShipmentWorkbook as jest.Mock;

function makePreviewRequest(body: Record<string, unknown>, slug?: string) {
  return new NextRequest("http://localhost/api/tenant/shipments/import/preview", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(slug ? { "x-tenant-slug": slug } : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeCommitRequest(body: Record<string, unknown>, slug?: string) {
  return new NextRequest("http://localhost/api/tenant/shipments/import/commit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(slug ? { "x-tenant-slug": slug } : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeExportRequest(slug?: string, query = "") {
  return new NextRequest(`http://localhost/api/tenant/shipments/export${query}`, {
    method: "GET",
    headers: slug ? { "x-tenant-slug": slug } : undefined,
  });
}

function validPreviewBody() {
  return {
    raw_text:
      "Species,No. rec,Supplier,Ship date,Arrival date\nCaligo atreus,10,EBN,12/9/25,12/11/25",
    source: {
      kind: "paste",
    },
  };
}

function validCommitBody() {
  return {
    raw_text:
      "Species,Common name,No. rec,Supplier,Ship date,Arrival date,Emerg. in transit,Damag in transit,No. disea,No. parasit,No emerg,Poor emerg,Released\nCaligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
    preview_hash: `sha256:${"a".repeat(64)}`,
    year: 2025,
  };
}

describe("Tenant Shipment Import API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("POST /api/tenant/shipments/import/preview", () => {
    it("returns 400 when tenant slug header is missing", async () => {
      const response = (await previewImport(makePreviewRequest(validPreviewBody())))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 200 for valid preview", async () => {
      mockGetTenantShipmentImportPreview.mockResolvedValueOnce({
        summary: {
          total_rows: 1,
          shipments_detected: 1,
          row_errors: 0,
          warnings: 0,
          unknown_species: 0,
          unknown_suppliers: 0,
        },
        row_errors: [],
        warnings: [],
        unknown_species: [],
        unknown_suppliers: [],
        issues: [],
        existing_shipments: [],
        years: [2025],
        preview_hash: `sha256:${"b".repeat(64)}`,
      });

      const response = (await previewImport(makePreviewRequest(validPreviewBody(), "demo")))!;
      expect(response.status).toBe(200);
      expect(mockGetTenantShipmentImportPreview).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "demo" }),
      );
    });
  });

  describe("POST /api/tenant/shipments/import/commit", () => {
    it("returns 400 when tenant slug header is missing", async () => {
      const response = (await commitImport(makeCommitRequest(validCommitBody())))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 200 for valid commit", async () => {
      mockCommitTenantShipmentImport.mockResolvedValueOnce({
        year: 2025,
        created: 1,
        skipped: 0,
        warnings: [],
      });

      const response = (await commitImport(makeCommitRequest(validCommitBody(), "demo")))!;
      expect(response.status).toBe(200);
      expect(mockCommitTenantShipmentImport).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "demo", year: 2025 }),
      );
    });

    it("returns 400 with structured issue details for a blocking workbook validation error", async () => {
      mockCommitTenantShipmentImport.mockRejectedValueOnce(
        new ShipmentImportValidationError([
          {
            rowNumber: 2,
            field: "Released",
            value: "-1",
            message: "Released must be a non-negative integer or blank.",
          },
        ]),
      );

      const response = (await commitImport(makeCommitRequest(validCommitBody(), "demo")))!;
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.details).toContainEqual({
        path: "Released",
        message: "Released must be a non-negative integer or blank.",
      });
    });

    it("returns 400 when the requested year is not found in the validated workbook", async () => {
      mockCommitTenantShipmentImport.mockRejectedValueOnce(new Error("YEAR_NOT_FOUND"));

      const response = (await commitImport(makeCommitRequest(validCommitBody(), "demo")))!;
      expect(response.status).toBe(400);
    });

    it("returns 409 when another import is already running for this institution", async () => {
      mockCommitTenantShipmentImport.mockRejectedValueOnce(new Error("IMPORT_ALREADY_RUNNING"));

      const response = (await commitImport(makeCommitRequest(validCommitBody(), "demo")))!;
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("CONFLICT");
    });

    it("returns 400 for a legacy { shipments } commit body", async () => {
      const response = (await commitImport(
        makeCommitRequest(
          { preview_hash: `sha256:${"a".repeat(64)}`, shipments: [], options: {} },
          "demo",
        ),
      ))!;
      expect(response.status).toBe(400);
      expect(mockCommitTenantShipmentImport).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/tenant/shipments/export", () => {
    it("returns 400 when tenant slug header is missing", async () => {
      const response = (await exportShipments(makeExportRequest()))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns xlsx content for valid request", async () => {
      mockExportTenantShipmentWorkbook.mockResolvedValueOnce(Buffer.from("xlsx"));

      const response = (await exportShipments(makeExportRequest("demo", "?format=xlsx")))!;
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(mockExportTenantShipmentWorkbook).toHaveBeenCalledWith({ slug: "demo" });
    });

    it("returns 400 when 'from' is after 'to'", async () => {
      const response = (await exportShipments(
        makeExportRequest("demo", "?format=xlsx&from=2024-12-31&to=2020-01-01"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid calendar date in range", async () => {
      const response = (await exportShipments(
        makeExportRequest("demo", "?format=xlsx&from=2024-02-31&to=2024-12-31"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("passes date range to service when both from and to are provided", async () => {
      mockExportTenantShipmentWorkbook.mockResolvedValueOnce(Buffer.from("xlsx"));

      const response = (await exportShipments(
        makeExportRequest("demo", "?format=xlsx&from=2020-01-01&to=2024-12-31"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockExportTenantShipmentWorkbook).toHaveBeenCalledWith({
        slug: "demo",
        range: { from: "2020-01-01", to: "2024-12-31" },
      });
    });

    it("passes partial range to service when only to is provided", async () => {
      mockExportTenantShipmentWorkbook.mockResolvedValueOnce(Buffer.from("xlsx"));

      const response = (await exportShipments(
        makeExportRequest("demo", "?format=xlsx&to=2024-12-31"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockExportTenantShipmentWorkbook).toHaveBeenCalledWith(
        expect.objectContaining({ range: expect.objectContaining({ to: "2024-12-31" }) }),
      );
    });
  });
});
