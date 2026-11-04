import { NextRequest } from "next/server";

jest.mock("@/lib/services/shipment-import", () => ({
  getPlatformShipmentImportPreview: jest.fn(),
  commitPlatformShipmentImport: jest.fn(),
  exportPlatformShipmentWorkbook: jest.fn(),
  // Mocked alongside the functions above (rather than via jest.requireActual) so this class
  // reference is identical to the one the route itself imports from this same mocked module,
  // without pulling in the real module's non-test-friendly dependency chain (e.g. @/auth).
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
  getPlatformShipmentImportPreview,
  commitPlatformShipmentImport,
  exportPlatformShipmentWorkbook,
  ShipmentImportValidationError,
} from "@/lib/services/shipment-import";
import { POST as previewImport } from "@/app/api/platform/institutions/[id]/shipments/import/preview/route";
import { POST as commitImport } from "@/app/api/platform/institutions/[id]/shipments/import/commit/route";
import { GET as exportShipments } from "@/app/api/platform/institutions/[id]/shipments/export/route";

const mockGetPlatformShipmentImportPreview = getPlatformShipmentImportPreview as jest.Mock;
const mockCommitPlatformShipmentImport = commitPlatformShipmentImport as jest.Mock;
const mockExportPlatformShipmentWorkbook = exportPlatformShipmentWorkbook as jest.Mock;

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePreviewRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/platform/institutions/1/shipments/import/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCommitRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/platform/institutions/1/shipments/import/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeExportRequest(id: string, query = "") {
  return new NextRequest(
    `http://localhost/api/platform/institutions/${id}/shipments/export${query}`,
    {
      method: "GET",
    },
  );
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

describe("Platform Shipment Import API", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("POST /api/platform/institutions/[id]/shipments/import/preview", () => {
    it("returns 400 for invalid id parameter", async () => {
      const response = (await previewImport(
        makePreviewRequest(validPreviewBody()),
        routeContext("abc"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid body", async () => {
      const response = (await previewImport(
        makePreviewRequest({ raw_text: "" }),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 401 for unauthorized requests", async () => {
      mockGetPlatformShipmentImportPreview.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
      const response = (await previewImport(
        makePreviewRequest(validPreviewBody()),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(401);
    });

    it("returns 200 for valid preview", async () => {
      mockGetPlatformShipmentImportPreview.mockResolvedValueOnce({
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

      const response = (await previewImport(
        makePreviewRequest(validPreviewBody()),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockGetPlatformShipmentImportPreview).toHaveBeenCalledWith(
        expect.objectContaining({ institutionId: 1 }),
      );
    });

    it("accepts a request omitting allow_species_autocreate (backward-compatible)", async () => {
      mockGetPlatformShipmentImportPreview.mockResolvedValueOnce({
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

      const response = (await previewImport(
        makePreviewRequest(validPreviewBody()),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      // The route passes the body through as-is (the field is simply absent, not present with an
      // explicit `undefined`); the service itself defaults the omitted field to `false` (manual
      // QA finding 1 fix) — not asserted again here since it's covered directly against the real
      // service in `shipment-import-service.test.ts`.
      const callArgs = mockGetPlatformShipmentImportPreview.mock.calls[0][0];
      expect(callArgs.institutionId).toBe(1);
      expect("allow_species_autocreate" in callArgs).toBe(false);
    });

    it("forwards an explicit allow_species_autocreate: true to the service", async () => {
      mockGetPlatformShipmentImportPreview.mockResolvedValueOnce({
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

      const response = (await previewImport(
        makePreviewRequest({ ...validPreviewBody(), allow_species_autocreate: true }),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockGetPlatformShipmentImportPreview).toHaveBeenCalledWith(
        expect.objectContaining({ institutionId: 1, allow_species_autocreate: true }),
      );
    });
  });

  describe("POST /api/platform/institutions/[id]/shipments/import/commit", () => {
    it("returns 400 for invalid body", async () => {
      const response = (await commitImport(
        makeCommitRequest({ preview_hash: "bad" }),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for preview hash mismatch", async () => {
      mockCommitPlatformShipmentImport.mockRejectedValueOnce(new Error("PREVIEW_HASH_MISMATCH"));

      const response = (await commitImport(
        makeCommitRequest(validCommitBody()),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 with structured issue details for a blocking workbook validation error", async () => {
      mockCommitPlatformShipmentImport.mockRejectedValueOnce(
        new ShipmentImportValidationError([
          {
            rowNumber: 2,
            field: "Released",
            value: "-1",
            message: "Released must be a non-negative integer or blank.",
          },
        ]),
      );

      const response = (await commitImport(
        makeCommitRequest(validCommitBody()),
        routeContext("1"),
      ))!;
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.details).toContainEqual({
        path: "Released",
        message: "Released must be a non-negative integer or blank.",
      });
    });

    it("returns 400 when the requested year is not found in the validated workbook", async () => {
      mockCommitPlatformShipmentImport.mockRejectedValueOnce(new Error("YEAR_NOT_FOUND"));

      const response = (await commitImport(
        makeCommitRequest(validCommitBody()),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 409 when another import is already running for this institution", async () => {
      mockCommitPlatformShipmentImport.mockRejectedValueOnce(new Error("IMPORT_ALREADY_RUNNING"));

      const response = (await commitImport(
        makeCommitRequest(validCommitBody()),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("CONFLICT");
    });

    it("returns 400 for a legacy { shipments } commit body", async () => {
      const response = (await commitImport(
        makeCommitRequest({
          preview_hash: `sha256:${"a".repeat(64)}`,
          shipments: [],
          options: {},
        }),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
      expect(mockCommitPlatformShipmentImport).not.toHaveBeenCalled();
    });

    it("returns 200 for valid commit", async () => {
      mockCommitPlatformShipmentImport.mockResolvedValueOnce({
        year: 2025,
        created: 1,
        skipped: 0,
        warnings: [],
      });

      const response = (await commitImport(
        makeCommitRequest(validCommitBody()),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockCommitPlatformShipmentImport).toHaveBeenCalledWith(
        expect.objectContaining({ institutionId: 1, year: 2025 }),
      );
    });
  });

  describe("GET /api/platform/institutions/[id]/shipments/export", () => {
    it("returns 400 for invalid id parameter", async () => {
      const response = (await exportShipments(makeExportRequest("abc"), routeContext("abc")))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for unsupported format", async () => {
      const response = (await exportShipments(
        makeExportRequest("1", "?format=csv"),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns xlsx content for valid request", async () => {
      mockExportPlatformShipmentWorkbook.mockResolvedValueOnce(Buffer.from("xlsx"));

      const response = (await exportShipments(
        makeExportRequest("1", "?format=xlsx"),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      expect(mockExportPlatformShipmentWorkbook).toHaveBeenCalledWith({ institutionId: 1 });
    });

    it("returns 400 when 'from' is after 'to'", async () => {
      const response = (await exportShipments(
        makeExportRequest("1", "?format=xlsx&from=2024-12-31&to=2020-01-01"),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 for invalid calendar date in range", async () => {
      const response = (await exportShipments(
        makeExportRequest("1", "?format=xlsx&from=2024-99-99&to=2024-12-31"),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_REQUEST");
    });

    it("passes date range to service when both from and to are provided", async () => {
      mockExportPlatformShipmentWorkbook.mockResolvedValueOnce(Buffer.from("xlsx"));

      const response = (await exportShipments(
        makeExportRequest("1", "?format=xlsx&from=2020-01-01&to=2024-12-31"),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockExportPlatformShipmentWorkbook).toHaveBeenCalledWith({
        institutionId: 1,
        range: { from: "2020-01-01", to: "2024-12-31" },
      });
    });

    it("passes partial range to service when only from is provided", async () => {
      mockExportPlatformShipmentWorkbook.mockResolvedValueOnce(Buffer.from("xlsx"));

      const response = (await exportShipments(
        makeExportRequest("1", "?format=xlsx&from=2020-01-01"),
        routeContext("1"),
      ))!;
      expect(response.status).toBe(200);
      expect(mockExportPlatformShipmentWorkbook).toHaveBeenCalledWith(
        expect.objectContaining({ range: expect.objectContaining({ from: "2020-01-01" }) }),
      );
    });
  });
});
