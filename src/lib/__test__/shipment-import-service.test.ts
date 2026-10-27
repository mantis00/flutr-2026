import { createHash } from "node:crypto";
import * as xlsx from "xlsx";

jest.mock("@/auth", () => ({
  auth: jest.fn(),
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

import {
  buildShipmentImportPreviewForInstitution,
  commitShipmentImportForInstitution,
  exportShipmentWorkbookForInstitution,
} from "@/lib/services/shipment-import";
import {
  createShipment,
  listShipmentExportRows,
  shipmentHeaderExists,
} from "@/lib/queries/shipments";
import { ensureSpeciesLinksForInstitution, listSpeciesGlobal } from "@/lib/queries/species";
import { ensureSupplierExistsForGlobalImport, listSuppliersGlobal } from "@/lib/queries/suppliers";
import type { ShipmentImportDraft } from "@/lib/validation/shipment-import";

const mockCreateShipment = createShipment as jest.Mock;
const mockListShipmentExportRows = listShipmentExportRows as jest.Mock;
const mockShipmentHeaderExists = shipmentHeaderExists as jest.Mock;
const mockEnsureSpeciesLinksForInstitution = ensureSpeciesLinksForInstitution as jest.Mock;
const mockListSpeciesGlobal = listSpeciesGlobal as jest.Mock;
const mockEnsureSupplierExistsForGlobalImport = ensureSupplierExistsForGlobalImport as jest.Mock;
const mockListSuppliersGlobal = listSuppliersGlobal as jest.Mock;

function buildPreviewHash(institutionId: number, shipments: ShipmentImportDraft[]) {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify({ institution_id: institutionId, shipments }))
    .digest("hex")}`;
}

function shipmentDraft(supplierCode = "EBN"): ShipmentImportDraft {
  return {
    supplier_code: supplierCode,
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
  };
}

describe("shipment import service", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("exportShipmentWorkbookForInstitution", () => {
    it.each([
      ["2026-09-09", "2026-09-10"],
      ["2027-01-01", "2027-01-02"],
    ])("preserves exact exported calendar dates %s -> %s", async (shipmentDate, arrivalDate) => {
      mockListShipmentExportRows.mockResolvedValueOnce([
        {
          scientificName: "Caligo atreus",
          commonName: "Owl butterfly",
          numberReceived: 10,
          supplierCode: "EBN",
          shipmentDate,
          arrivalDate,
          emergedInTransit: 0,
          damagedInTransit: 0,
          diseasedInTransit: 0,
          parasite: 0,
          nonEmergence: 0,
          poorEmergence: 0,
        },
      ]);

      const buffer = await exportShipmentWorkbookForInstitution({ institutionId: 77 });
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const worksheet = workbook.Sheets.Shipments;

      expect(mockListShipmentExportRows).toHaveBeenCalledWith(77, undefined);
      expect(worksheet.E2).toMatchObject({ t: "s", v: shipmentDate });
      expect(worksheet.F2).toMatchObject({ t: "s", v: arrivalDate });
    });
  });

  describe("buildShipmentImportPreviewForInstitution", () => {
    it("checks supplier existence against the global supplier list", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          "Species,No. rec,Supplier,Ship date,Arrival date",
          "Caligo atreus,10,EBN,12/9/25,12/11/25",
        ].join("\n"),
        source: { kind: "paste" },
      });

      expect(mockListSuppliersGlobal).toHaveBeenCalledTimes(1);
      expect(preview.summary.unknown_suppliers).toBe(0);
      expect(preview.unknown_suppliers).toEqual([]);
    });

    it("preserves imported supplier casing and checks exact global code existence", async () => {
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: 1,
        raw_text: [
          "Species,No. rec,Supplier,Ship date,Arrival date",
          "Caligo atreus,10, ebn legacy ,12/9/25,12/11/25",
        ].join("\n"),
        source: { kind: "paste" },
      });

      expect(preview.shipments[0]?.supplier_code).toBe("ebn legacy");
      expect(preview.summary.unknown_suppliers).toBe(1);
      expect(preview.unknown_suppliers).toEqual(["ebn legacy"]);
    });
  });

  describe("commitShipmentImportForInstitution", () => {
    it("ensures supplier codes through the global import helper before creating shipments", async () => {
      const shipments = [shipmentDraft("EBN")];
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([{ id: 10, code: "EBN" }]);
      mockEnsureSupplierExistsForGlobalImport.mockResolvedValueOnce({
        id: 10,
        code: "EBN",
        wasGloballyMissing: false,
      });
      mockEnsureSpeciesLinksForInstitution.mockResolvedValueOnce(undefined);
      mockShipmentHeaderExists.mockResolvedValueOnce(false);
      mockCreateShipment.mockResolvedValueOnce(123);

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        preview_hash: buildPreviewHash(1, shipments),
        shipments,
      });

      expect(mockListSuppliersGlobal).toHaveBeenCalledTimes(1);
      expect(mockEnsureSupplierExistsForGlobalImport).toHaveBeenCalledWith("EBN", {
        name: "EBN",
        country: "Unknown",
        websiteUrl: null,
      });
      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ supplier_code: "EBN" }),
      );
      expect(summary).toEqual({ created: 1, failed: 0, skipped: 0, failures: [], warnings: [] });
    });

    it("warns when commit auto-creates a globally missing supplier as inactive", async () => {
      const shipments = [shipmentDraft("NEW")];
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([]);
      mockEnsureSupplierExistsForGlobalImport.mockResolvedValueOnce({
        id: 25,
        code: "NEW",
        wasGloballyMissing: true,
      });
      mockEnsureSpeciesLinksForInstitution.mockResolvedValueOnce(undefined);
      mockShipmentHeaderExists.mockResolvedValueOnce(false);
      mockCreateShipment.mockResolvedValueOnce(123);

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        preview_hash: buildPreviewHash(1, shipments),
        shipments,
      });

      expect(mockEnsureSupplierExistsForGlobalImport).toHaveBeenCalledWith("NEW", {
        name: "NEW",
        country: "Unknown",
        websiteUrl: null,
      });
      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ supplier_code: "NEW" }),
      );
      expect(summary.created).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.warnings).toEqual([
        "Supplier NEW was auto-created as inactive for global review.",
      ]);
    });

    it("creates and stores missing import suppliers with the exact trimmed imported value", async () => {
      const shipments = [shipmentDraft(" lps historical ")];
      mockListSpeciesGlobal.mockResolvedValueOnce([{ id: 1, scientificName: "Caligo atreus" }]);
      mockListSuppliersGlobal.mockResolvedValueOnce([]);
      mockEnsureSupplierExistsForGlobalImport.mockResolvedValueOnce({
        id: 26,
        code: "lps historical",
        wasGloballyMissing: true,
      });
      mockEnsureSpeciesLinksForInstitution.mockResolvedValueOnce(undefined);
      mockShipmentHeaderExists.mockResolvedValueOnce(false);
      mockCreateShipment.mockResolvedValueOnce(123);

      const summary = await commitShipmentImportForInstitution({
        institutionId: 1,
        preview_hash: buildPreviewHash(1, shipments),
        shipments,
      });

      expect(mockEnsureSupplierExistsForGlobalImport).toHaveBeenCalledWith("lps historical", {
        name: "lps historical",
        country: "Unknown",
        websiteUrl: null,
      });
      expect(mockCreateShipment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ supplier_code: "lps historical" }),
      );
      expect(summary.created).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.warnings).toEqual([
        "Supplier lps historical was auto-created as inactive for global review.",
      ]);
    });
  });
});
