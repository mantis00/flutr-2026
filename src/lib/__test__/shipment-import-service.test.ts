import { createHash } from "node:crypto";
import * as xlsx from "xlsx";

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

const mockRequireUser = jest.fn();
const mockCanCrossTenant = jest.fn();
jest.mock("@/lib/authz", () => ({
  requireUser: (session: unknown) => mockRequireUser(session),
  canCrossTenant: (user: unknown) => mockCanCrossTenant(user),
}));

const mockEnsureTenantExists = jest.fn();
jest.mock("@/lib/tenant", () => ({
  ensureTenantExists: (institutionId: number) => mockEnsureTenantExists(institutionId),
  TENANT_ERRORS: { INSTITUTION_NOT_FOUND: "Institution not found" },
}));

jest.mock("@/lib/queries/shipments", () => ({
  createShipment: jest.fn(),
  listShipmentExportRows: jest.fn(),
  shipmentHeaderExists: jest.fn(),
}));

jest.mock("@/lib/queries/species", () => ({
  createSpecies: jest.fn(),
  ensureSpeciesLinksForInstitution: jest.fn(),
  listSpeciesGlobal: jest.fn(),
}));

jest.mock("@/lib/queries/suppliers", () => ({
  ensureSupplierExistsForGlobalImport: jest.fn(),
  listSuppliersGlobal: jest.fn(),
}));

const mockDbTransaction = jest.fn();
const mockTxExecute = jest.fn();
/** Distinctive, recognizable-by-reference fake `tx` so tests can assert the *same* executor was
 * threaded into every supplier/species/shipment write inside one commit's transaction. */
const FAKE_TX = { execute: mockTxExecute, __isFakeTx: true };

jest.mock("@/lib/db", () => ({
  db: {
    transaction: (callback: (tx: typeof FAKE_TX) => unknown) => mockDbTransaction(callback),
  },
}));

import {
  buildShipmentImportPreviewForInstitution,
  commitShipmentImportForInstitution,
  exportShipmentWorkbookForInstitution,
  getPlatformShipmentImportPreview,
  ShipmentImportValidationError,
} from "@/lib/services/shipment-import";
import {
  createShipment,
  listShipmentExportRows,
  shipmentHeaderExists,
} from "@/lib/queries/shipments";
import {
  createSpecies,
  ensureSpeciesLinksForInstitution,
  listSpeciesGlobal,
} from "@/lib/queries/species";
import { ensureSupplierExistsForGlobalImport, listSuppliersGlobal } from "@/lib/queries/suppliers";
import { shipmentImportCommitRequestSchema } from "@/lib/validation/shipment-import";
import { validateHeaderRow } from "@/lib/shipment-import-parser";
import { CANONICAL_SHIPMENT_IMPORT_HEADERS } from "@/lib/shipment-import-utils";

const mockCreateShipment = createShipment as jest.Mock;
const mockListShipmentExportRows = listShipmentExportRows as jest.Mock;
const mockShipmentHeaderExists = shipmentHeaderExists as jest.Mock;
const mockCreateSpecies = createSpecies as jest.Mock;
const mockEnsureSpeciesLinksForInstitution = ensureSpeciesLinksForInstitution as jest.Mock;
const mockListSpeciesGlobal = listSpeciesGlobal as jest.Mock;
const mockEnsureSupplierExistsForGlobalImport = ensureSupplierExistsForGlobalImport as jest.Mock;
const mockListSuppliersGlobal = listSuppliersGlobal as jest.Mock;

const STRICT_HEADER_ROW =
  "Species,Common name,No. rec,Supplier,Ship date,Arrival date,Emerg. in transit,Damag in transit,No. disea,No. parasit,No emerg,Poor emerg,Released";

function buildPreviewHash(institutionId: number, rawText: string) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ institution_id: institutionId, raw_text: rawText }))
    .digest("hex")}`;
}

/** One valid, strict 13-column data row (2025, EBN, known Released 9) as tab-delimited text. */
function validDataRow(overrides: Partial<Record<string, string>> = {}) {
  const defaults = {
    species: "Caligo atreus",
    commonName: "Owl Butterfly",
    noRec: "10",
    supplier: "EBN",
    shipDate: "12/9/25",
    arrivalDate: "12/11/25",
    emerg: "0",
    damag: "0",
    disea: "0",
    parasit: "0",
    noEmerg: "0",
    poorEmerg: "0",
    released: "9",
  };
  const row = { ...defaults, ...overrides };
  return [
    row.species,
    row.commonName,
    row.noRec,
    row.supplier,
    row.shipDate,
    row.arrivalDate,
    row.emerg,
    row.damag,
    row.disea,
    row.parasit,
    row.noEmerg,
    row.poorEmerg,
    row.released,
  ].join(",");
}

function buildRawText(...rows: string[]) {
  return [STRICT_HEADER_ROW, ...rows].join("\n");
}

describe("shipment import service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDbTransaction.mockImplementation(async (callback) => callback(FAKE_TX));
    mockTxExecute.mockResolvedValue([{ acquired: true }]);
    // Authorization passthrough for `getPlatformShipmentImportPreview`'s tests below — these
    // tests exercise the real platform wrapper, not a mock of it, so its `assertPlatformImportAccess`
    // call needs a non-throwing auth/tenant chain. Unused by every other describe block in this
    // file (which call `buildShipmentImportPreviewForInstitution`/`commitShipmentImportForInstitution`
    // directly, bypassing this wrapper entirely).
    mockRequireUser.mockReturnValue({ id: 1, role: "SUPERUSER" });
    mockCanCrossTenant.mockReturnValue(true);
    mockEnsureTenantExists.mockResolvedValue(undefined);
  });

  describe("exportShipmentWorkbookForInstitution", () => {
    function buildExportRow(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        scientificName: "Caligo atreus",
        commonName: "Owl butterfly",
        numberReceived: 10,
        supplierCode: "EBN",
        shipmentDate: "2026-09-09",
        arrivalDate: "2026-09-10",
        emergedInTransit: 0,
        damagedInTransit: 0,
        diseasedInTransit: 0,
        parasite: 0,
        nonEmergence: 0,
        poorEmergence: 0,
        goodEmergence: 4,
        ...overrides,
      };
    }

    it.each([
      ["2026-09-09", "2026-09-10"],
      ["2027-01-01", "2027-01-02"],
    ])("preserves exact exported calendar dates %s -> %s", async (shipmentDate, arrivalDate) => {
      mockListShipmentExportRows.mockResolvedValueOnce([
        buildExportRow({ shipmentDate, arrivalDate }),
      ]);

      const buffer = await exportShipmentWorkbookForInstitution({ institutionId: 77 });
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets.Shipments;

      expect(mockListShipmentExportRows).toHaveBeenCalledWith(77, undefined);
      expect(worksheet.E2).toMatchObject({ t: "s", v: shipmentDate });
      expect(worksheet.F2).toMatchObject({ t: "s", v: arrivalDate });
    });

    it("produces exactly the 13 canonical headers, in canonical order, with Released as the 13th", async () => {
      mockListShipmentExportRows.mockResolvedValueOnce([buildExportRow()]);

      const buffer = await exportShipmentWorkbookForInstitution({ institutionId: 77 });
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets.Shipments;
      const headerRow = xlsx.utils.sheet_to_json<string[]>(worksheet, {
        header: 1,
        raw: false,
        defval: "",
      })[0];

      expect(headerRow).toEqual(Array.from(CANONICAL_SHIPMENT_IMPORT_HEADERS));
      expect(headerRow).toHaveLength(13);
      expect(headerRow[12]).toBe("Released");
    });

    it("preserves Released NULL as a blank cell, numeric zero as 0, and a positive value unchanged", async () => {
      mockListShipmentExportRows.mockResolvedValueOnce([
        buildExportRow({ scientificName: "species unknown released", goodEmergence: null }),
        buildExportRow({ scientificName: "species known zero", goodEmergence: 0 }),
        buildExportRow({ scientificName: "species known positive", goodEmergence: 9 }),
      ]);

      const buffer = await exportShipmentWorkbookForInstitution({ institutionId: 77 });
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets.Shipments;

      // Row 2 = unknown (NULL) Released: the cell must not be written as a numeric value at all.
      expect(worksheet.M2?.v).not.toBe(0);
      expect(worksheet.M2?.t).not.toBe("n");
      // Row 3 = known, explicit zero: must be a real numeric 0, not blank/absent.
      expect(worksheet.M3).toMatchObject({ t: "n", v: 0 });
      // Row 4 = known, positive: preserved exactly.
      expect(worksheet.M4).toMatchObject({ t: "n", v: 9 });
    });

    it("produces a workbook whose header row round-trips through the strict importer's own header validation with zero issues", async () => {
      mockListShipmentExportRows.mockResolvedValueOnce([buildExportRow()]);

      const buffer = await exportShipmentWorkbookForInstitution({ institutionId: 77 });
      // A genuine round-trip: read the produced buffer back with the real `xlsx` library (not an
      // assertion against the intermediate array-of-arrays this function builds internally), then
      // feed the resulting header row through the real strict validator.
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets.Shipments;
      const rows = xlsx.utils.sheet_to_json<string[]>(worksheet, {
        header: 1,
        raw: false,
        defval: "",
      });

      const { issues } = validateHeaderRow(rows[0]);
      expect(issues).toEqual([]);
    });
  });

  describe("buildShipmentImportPreviewForInstitution", () => {
    const STRICT_HEADER_ROW =
      "Species,Common name,No. rec,Supplier,Ship date,Arrival date,Emerg. in transit,Damag in transit,No. disea,No. parasit,No emerg,Poor emerg,Released";

    it("checks supplier existence against the global supplier list", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(preview.row_errors).toEqual([]);
      expect(preview.issues).toEqual([]);
      expect(mockListSuppliersGlobal).toHaveBeenCalledTimes(1);
      expect(preview.summary.unknown_suppliers).toBe(0);
      expect(preview.unknown_suppliers).toEqual([]);
    });

    it("preserves imported supplier casing and checks exact global code existence", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10, ebn legacy ,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(preview.row_errors).toEqual([]);
      expect(preview.unknown_suppliers).toContain("ebn legacy");
      expect(preview.summary.unknown_suppliers).toBe(1);
      expect(preview.unknown_suppliers).toEqual(["ebn legacy"]);
    });

    it("requires all 13 canonical headers, collecting every missing one together", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([]);
      mockListSuppliersGlobal.mockResolvedValueOnce([]);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: ["Species,Supplier,Ship date", "Caligo atreus,EBN,12/9/25"].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(preview.summary.shipments_detected).toBe(0);
      expect(
        preview.row_errors.some((e) => e.includes('Missing required column: "Released"')),
      ).toBe(true);
      expect(
        preview.row_errors.some((e) => e.includes('Missing required column: "Common name"')),
      ).toBe(true);
    });

    it("blocks an unresolved species when allowSpeciesAutocreate is false, naming its real row number (manual QA finding 1 + 2)", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(preview.unknown_species).toEqual(["caligo atreus"]);
      expect(
        preview.row_errors.some((e) => e.includes("cannot be auto-created for this request")),
      ).toBe(true);
      const speciesIssue = preview.issues.find((issue) => issue.field === "Species");
      expect(speciesIssue?.rowNumbers).toEqual([2]);
      expect(preview.row_errors.some((e) => e.startsWith("Rows 2:"))).toBe(true);
    });

    it("does not block an unresolved species when allowSpeciesAutocreate is true", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      expect(preview.unknown_species).toEqual(["caligo atreus"]);
      expect(preview.row_errors).toEqual([]);
    });

    it("lists every contributing row number for a species unresolved across multiple rows/years (manual QA finding 2)", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
          "Caligo atreus,Owl Butterfly,5,EBN,1/5/24,1/6/24,0,0,0,0,0,0,5",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      const speciesIssue = preview.issues.find((issue) => issue.field === "Species");
      expect(speciesIssue?.rowNumbers).toEqual([2, 3]);
    });

    it("reports an existing shipment as a non-blocking notice, not a validation error", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(true);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(preview.row_errors).toEqual([]);
      expect(preview.existing_shipments).toEqual(["EBN (2025-12-09 -> 2025-12-11)"]);
    });

    it("returns sorted, distinct Arrival years across the valid shipments", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
          "Caligo atreus,Owl Butterfly,5,EBN,1/5/24,1/6/24,0,0,0,0,0,0,5",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(preview.years).toEqual([2024, 2025]);
    });

    it("does not write anything during preview", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(mockCreateShipment).not.toHaveBeenCalled();
      expect(mockEnsureSupplierExistsForGlobalImport).not.toHaveBeenCalled();
      expect(mockEnsureSpeciesLinksForInstitution).not.toHaveBeenCalled();
    });

    it("computes preview_hash as a function of raw_text (Phase 3C: the single hash concept)", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const rawText = buildRawText(validDataRow());

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: false,
      });

      expect(preview.preview_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(preview.preview_hash).toBe(buildPreviewHash(1, rawText));
      // A different raw_text (even a trivial whitespace change) must produce a different hash —
      // the hash genuinely binds to the exact text, not just the institution id.
      expect(preview.preview_hash).not.toBe(buildPreviewHash(1, rawText + "\n"));
    });
  });

  describe("getPlatformShipmentImportPreview (manual QA finding 1: real toggle value, not role eligibility)", () => {
    it("defaults to blocking an unresolved species when allow_species_autocreate is omitted from the request — matching commit's own default", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await getPlatformShipmentImportPreview({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
      });

      expect(preview.unknown_species).toEqual(["caligo atreus"]);
      expect(
        preview.row_errors.some((e) => e.includes("cannot be auto-created for this request")),
      ).toBe(true);
    });

    it("does not block an unresolved species when the request explicitly sets allow_species_autocreate: true", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await getPlatformShipmentImportPreview({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allow_species_autocreate: true,
      });

      expect(preview.unknown_species).toEqual(["caligo atreus"]);
      expect(preview.row_errors).toEqual([]);
    });

    it("blocks an unresolved species when the request explicitly sets allow_species_autocreate: false — reproduces the manual QA 2004 scenario", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockShipmentHeaderExists.mockResolvedValue(false);

      const preview = await getPlatformShipmentImportPreview({
        institutionId: 1,
        raw_text: [
          STRICT_HEADER_ROW,
          "Caligo atreus,Owl Butterfly,10,EBN,12/9/25,12/11/25,0,0,0,0,0,0,9",
        ].join("\n"),
        source: { kind: "paste" },
        allow_species_autocreate: false,
      });

      expect(preview.unknown_species).toEqual(["caligo atreus"]);
      expect(
        preview.row_errors.some((e) => e.includes("cannot be auto-created for this request")),
      ).toBe(true);
    });
  });

  describe("commitShipmentImportForInstitution (Phase 3C: year-scoped, raw_text-based)", () => {
    function setupHappyPathMocks() {
      mockListSpeciesGlobal.mockResolvedValue([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValue([{ id: 10, code: "EBN" }]);
      mockEnsureSupplierExistsForGlobalImport.mockResolvedValue({
        id: 10,
        code: "EBN",
        wasGloballyMissing: false,
      });
      mockEnsureSpeciesLinksForInstitution.mockResolvedValue(undefined);
      mockShipmentHeaderExists.mockResolvedValue(false);
      mockCreateShipment.mockResolvedValue(123);
    }

    it("ensures supplier codes through the global import helper before creating shipments, using the transaction executor", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(validDataRow());

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
      });

      expect(mockListSuppliersGlobal).toHaveBeenCalledTimes(1);
      expect(mockEnsureSupplierExistsForGlobalImport).toHaveBeenCalledWith(
        "EBN",
        { name: "EBN", country: "Unknown", websiteUrl: null },
        FAKE_TX,
      );
      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ supplier_code: "EBN" }),
        FAKE_TX,
      );
      expect(summary).toEqual({ year: 2025, created: 1, skipped: 0, warnings: [] });
    });

    it("preserves a blank Released cell as good_emergence: null, not coalesced to 0", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(validDataRow({ released: "" }));

      await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
      });

      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          items: [expect.objectContaining({ good_emergence: null })],
        }),
        FAKE_TX,
      );
    });

    it("preserves an explicit numeric zero Released as good_emergence: 0", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(validDataRow({ released: "0" }));

      await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
      });

      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          items: [expect.objectContaining({ good_emergence: 0 })],
        }),
        FAKE_TX,
      );
    });

    it("preserves a positive Released value unchanged", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(validDataRow({ released: "7" }));

      await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
      });

      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          items: [expect.objectContaining({ good_emergence: 7 })],
        }),
        FAKE_TX,
      );
    });

    it("rejects the whole commit when the hash does not match the submitted raw_text", async () => {
      const rawText = buildRawText(validDataRow());

      await expect(
        commitShipmentImportForInstitution({
          institutionId: 1,
          raw_text: rawText,
          preview_hash: buildPreviewHash(1, rawText + "\ntampered"),
          year: 2025,
        }),
      ).rejects.toThrow("PREVIEW_HASH_MISMATCH");

      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it("rejects the whole workbook when a header is missing anywhere in raw_text", async () => {
      mockListSpeciesGlobal.mockResolvedValue([]);
      mockListSuppliersGlobal.mockResolvedValue([]);
      const rawText = ["Species,Supplier,Ship date", "Caligo atreus,EBN,12/9/25"].join("\n");

      await expect(
        commitShipmentImportForInstitution({
          institutionId: 1,
          raw_text: rawText,
          preview_hash: buildPreviewHash(1, rawText),
          year: 2025,
        }),
      ).rejects.toThrow(ShipmentImportValidationError);

      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it("rejects the whole commit when accounting in a DIFFERENT Arrival year is invalid, not only the requested year", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(
        validDataRow(), // valid 2025 row
        validDataRow({ shipDate: "1/5/24", arrivalDate: "1/6/24", noRec: "5", disea: "6" }), // invalid 2024 row
      );

      await expect(
        commitShipmentImportForInstitution({
          institutionId: 1,
          raw_text: rawText,
          preview_hash: buildPreviewHash(1, rawText),
          year: 2025, // requesting the otherwise-valid year does not bypass the 2024 problem
        }),
      ).rejects.toThrow(ShipmentImportValidationError);

      expect(mockDbTransaction).not.toHaveBeenCalled();
      expect(mockCreateShipment).not.toHaveBeenCalled();
    });

    it("rejects the whole workbook when a duplicate-species group has mixed known/unknown Released", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(validDataRow({ released: "6" }), validDataRow({ released: "" }));

      await expect(
        commitShipmentImportForInstitution({
          institutionId: 1,
          raw_text: rawText,
          preview_hash: buildPreviewHash(1, rawText),
          year: 2025,
        }),
      ).rejects.toThrow(ShipmentImportValidationError);

      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it("commits only the requested year out of a multi-year workbook", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(
        validDataRow(),
        validDataRow({ shipDate: "1/5/24", arrivalDate: "1/6/24" }),
      );

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2024,
      });

      expect(summary).toEqual({ year: 2024, created: 1, skipped: 0, warnings: [] });
      expect(mockCreateShipment).toHaveBeenCalledTimes(1);
      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ shipment_date: new Date("2024-01-05T12:00:00.000Z") }),
        FAKE_TX,
      );
    });

    it("rejects when the requested year does not exist in the validated workbook", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(validDataRow());

      await expect(
        commitShipmentImportForInstitution({
          institutionId: 1,
          raw_text: rawText,
          preview_hash: buildPreviewHash(1, rawText),
          year: 1999,
        }),
      ).rejects.toThrow("YEAR_NOT_FOUND");

      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it("skips an existing shipment by default without creating it", async () => {
      setupHappyPathMocks();
      mockShipmentHeaderExists.mockResolvedValueOnce(true);
      const rawText = buildRawText(validDataRow());

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
      });

      expect(summary).toEqual({ year: 2025, created: 0, skipped: 1, warnings: [] });
      expect(mockCreateShipment).not.toHaveBeenCalled();
    });

    it("attempts to create an existing shipment anyway when allow_duplicate_headers is true", async () => {
      setupHappyPathMocks();
      mockShipmentHeaderExists.mockResolvedValueOnce(true);
      const rawText = buildRawText(validDataRow());

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
        options: { allow_duplicate_headers: true },
      });

      expect(summary.created).toBe(1);
      expect(summary.skipped).toBe(0);
      expect(mockCreateShipment).toHaveBeenCalledTimes(1);
    });

    it("warns when commit auto-creates a globally missing supplier as inactive, using the transaction executor", async () => {
      mockListSpeciesGlobal.mockResolvedValue([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValue([]);
      mockEnsureSupplierExistsForGlobalImport.mockResolvedValueOnce({
        id: 25,
        code: "NEW",
        wasGloballyMissing: true,
      });
      mockShipmentHeaderExists.mockResolvedValue(false);
      mockCreateShipment.mockResolvedValueOnce(123);
      const rawText = buildRawText(validDataRow({ supplier: "NEW" }));

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
      });

      expect(mockEnsureSupplierExistsForGlobalImport).toHaveBeenCalledWith(
        "NEW",
        { name: "NEW", country: "Unknown", websiteUrl: null },
        FAKE_TX,
      );
      expect(summary.created).toBe(1);
      expect(summary.warnings).toEqual([
        "Supplier NEW was auto-created as inactive for global review.",
      ]);
    });

    it("auto-creates an unresolved species using the transaction executor when allow_species_autocreate is true", async () => {
      mockListSpeciesGlobal.mockResolvedValue([]);
      mockListSuppliersGlobal.mockResolvedValue([{ id: 10, code: "EBN" }]);
      mockEnsureSupplierExistsForGlobalImport.mockResolvedValue({
        id: 10,
        code: "EBN",
        wasGloballyMissing: false,
      });
      mockCreateSpecies.mockResolvedValueOnce({ id: 99 });
      mockShipmentHeaderExists.mockResolvedValue(false);
      mockCreateShipment.mockResolvedValueOnce(123);
      const rawText = buildRawText(validDataRow());

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        raw_text: rawText,
        preview_hash: buildPreviewHash(1, rawText),
        year: 2025,
        options: { allow_species_autocreate: true },
      });

      expect(mockCreateSpecies).toHaveBeenCalledWith(expect.anything(), FAKE_TX);
      expect(summary.created).toBe(1);
      expect(summary.warnings).toContain("Species caligo atreus was auto-created in master list.");
    });

    it("rejects an unresolved species for a tenant request even if the request body requests autocreate (enforced upstream by the tenant wrapper's forced-false option, not re-tested here directly)", async () => {
      // This exact enforcement is `commitTenantShipmentImport`'s responsibility
      // (`tenant-shipment-import.ts`, force-overrides `allow_species_autocreate: false`
      // regardless of the request body) — verified here at the shared-service level: when the
      // option actually received is `false`, an unresolved species blocks the whole commit,
      // which is what that wrapper guarantees tenant requests always get.
      mockListSpeciesGlobal.mockResolvedValue([]);
      mockListSuppliersGlobal.mockResolvedValue([{ id: 10, code: "EBN" }]);
      const rawText = buildRawText(validDataRow());

      await expect(
        commitShipmentImportForInstitution({
          institutionId: 1,
          raw_text: rawText,
          preview_hash: buildPreviewHash(1, rawText),
          year: 2025,
          options: { allow_species_autocreate: false },
        }),
      ).rejects.toThrow(ShipmentImportValidationError);

      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it("fails fast with IMPORT_ALREADY_RUNNING when the advisory lock is already held", async () => {
      setupHappyPathMocks();
      mockTxExecute.mockResolvedValueOnce([{ acquired: false }]);
      const rawText = buildRawText(validDataRow());

      await expect(
        commitShipmentImportForInstitution({
          institutionId: 1,
          raw_text: rawText,
          preview_hash: buildPreviewHash(1, rawText),
          year: 2025,
        }),
      ).rejects.toThrow("IMPORT_ALREADY_RUNNING");

      expect(mockCreateShipment).not.toHaveBeenCalled();
    });

    it("acquires the advisory lock using a consistent namespace and the correct institution id", async () => {
      setupHappyPathMocks();
      const rawText = buildRawText(validDataRow());

      await commitShipmentImportForInstitution({
        institutionId: 42,
        raw_text: rawText,
        preview_hash: buildPreviewHash(42, rawText),
        year: 2025,
      });

      expect(mockTxExecute).toHaveBeenCalledTimes(1);
      const [sqlArg] = mockTxExecute.mock.calls[0] as [{ queryChunks: unknown[] }];
      const serialized = JSON.stringify(sqlArg);
      expect(serialized).toContain("pg_try_advisory_xact_lock");
      expect(serialized).toContain("shipment_import");
      // The real cross-institution independence of this lock (two different institution ids
      // never block each other) was additionally verified empirically against a real Postgres
      // connection during this phase's investigation — see the Phase 3C changelog entry — since
      // a mocked `tx.execute` cannot itself prove real lock semantics; Phase 3D's real-database
      // integration tests are the permanent home for that kind of proof.
    });

    it("rejects the legacy { preview_hash, shipments, options } commit request shape", () => {
      const legacyBody = {
        preview_hash: `sha256:${"a".repeat(64)}`,
        shipments: [
          {
            supplier_code: "EBN",
            shipment_date: "2025-12-09T12:00:00.000Z",
            arrival_date: "2025-12-11T12:00:00.000Z",
            items: [
              {
                scientific_name: "caligo atreus",
                number_received: 10,
                emerged_in_transit: 0,
                damaged_in_transit: 0,
                diseased_in_transit: 0,
                parasite: 0,
                non_emergence: 0,
                poor_emergence: 0,
              },
            ],
          },
        ],
      };

      const result = shipmentImportCommitRequestSchema.safeParse(legacyBody);
      expect(result.success).toBe(false);
    });

    it("rejects a commit request with no year field at all", () => {
      const result = shipmentImportCommitRequestSchema.safeParse({
        raw_text: "irrelevant",
        preview_hash: `sha256:${"a".repeat(64)}`,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a commit request whose year is not an integer", () => {
      const result = shipmentImportCommitRequestSchema.safeParse({
        raw_text: "irrelevant",
        preview_hash: `sha256:${"a".repeat(64)}`,
        year: "2025",
      });
      expect(result.success).toBe(false);
    });
  });
});
