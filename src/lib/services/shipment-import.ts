import { createHash } from "node:crypto";

import { auth } from "@/auth";
import { canCrossTenant, requireUser } from "@/lib/authz";
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
import {
  groupShipmentImportRows,
  normalizeScientificName,
  normalizeSupplierCode,
  parseShipmentImportRows,
} from "@/lib/shipment-import-parser";
import { ensureTenantExists, TENANT_ERRORS } from "@/lib/tenant";
import {
  shipmentImportCommitResponseSchema,
  shipmentImportPreviewResponseSchema,
  type ShipmentImportCommitRequest,
  type ShipmentImportCommitResponse,
  type ShipmentImportDraft,
  type ShipmentImportPreviewRequest,
  type ShipmentImportPreviewResponse,
} from "@/lib/validation/shipment-import";

type ShipmentExportRow = Awaited<ReturnType<typeof listShipmentExportRows>>[number];

const SHIPMENT_EXPORT_HEADERS = [
  "Species",
  "Common name",
  "No. rec",
  "Supplier",
  "Ship date",
  "Arrival date",
  "Emerg. in transit",
  "Damag in transit",
  "No. disea",
  "No. parasit",
  "No emerg",
  "Poor emerg",
] as const;

function buildUnknownSpeciesPayload(scientificName: string) {
  return {
    scientific_name: scientificName,
    common_name: scientificName,
    family: "Unknown",
    sub_family: "Unknown",
    lifespan_days: 1,
    range: ["Unknown"],
  };
}

function formatShipmentLabel(shipment: ShipmentImportDraft) {
  const shipmentDate = shipment.shipment_date.slice(0, 10);
  const arrivalDate = shipment.arrival_date.slice(0, 10);
  return `${shipment.supplier_code} (${shipmentDate} -> ${arrivalDate})`;
}

function buildPreviewHash(institutionId: number, shipments: ShipmentImportDraft[]) {
  const hashSource = JSON.stringify({
    institution_id: institutionId,
    shipments,
  });

  return `sha256:${createHash("sha256").update(hashSource).digest("hex")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

function mapRowToExportRecord(row: ShipmentExportRow) {
  return [
    row.scientificName,
    row.commonName,
    row.numberReceived,
    row.supplierCode,
    row.shipmentDate,
    row.arrivalDate,
    row.emergedInTransit,
    row.damagedInTransit,
    row.diseasedInTransit,
    row.parasite,
    row.nonEmergence,
    row.poorEmergence,
  ];
}

async function assertPlatformImportAccess(institutionId: number) {
  const user = requireUser(await auth());
  if (!canCrossTenant(user)) throw new Error("FORBIDDEN");

  try {
    await ensureTenantExists(institutionId);
  } catch (error) {
    if (error instanceof Error && error.message === TENANT_ERRORS.INSTITUTION_NOT_FOUND) {
      throw new Error("NOT_FOUND");
    }

    throw error;
  }
}

export async function getPlatformShipmentImportPreview({
  institutionId,
  raw_text,
  source,
}: ShipmentImportPreviewRequest & {
  institutionId: number;
}): Promise<ShipmentImportPreviewResponse> {
  await assertPlatformImportAccess(institutionId);
  return buildShipmentImportPreviewForInstitution({ institutionId, raw_text, source });
}

export async function buildShipmentImportPreviewForInstitution({
  institutionId,
  raw_text,
}: ShipmentImportPreviewRequest & {
  institutionId: number;
}): Promise<ShipmentImportPreviewResponse> {
  const parsed = parseShipmentImportRows(raw_text);
  const shipments = groupShipmentImportRows(parsed.rows);

  const [speciesRows, supplierRows] = await Promise.all([
    listSpeciesGlobal(),
    listSuppliersGlobal(),
  ]);

  const knownSpecies = new Set(
    speciesRows.map((row) => normalizeScientificName(row.scientificName)),
  );
  const knownSuppliers = new Set(supplierRows.map((row) => normalizeSupplierCode(row.code)));

  const unknownSpecies = Array.from(
    new Set(
      parsed.rows
        .map((row) => row.scientificName)
        .filter((scientificName) => !knownSpecies.has(scientificName)),
    ),
  ).sort();

  const unknownSuppliers = Array.from(
    new Set(
      parsed.rows
        .map((row) => row.supplierCode)
        .filter((supplierCode) => !knownSuppliers.has(supplierCode)),
    ),
  ).sort();

  const payload = {
    summary: {
      total_rows: parsed.rows.length,
      shipments_detected: shipments.length,
      row_errors: parsed.rowErrors.length,
      warnings: parsed.warnings.length,
      unknown_species: unknownSpecies.length,
      unknown_suppliers: unknownSuppliers.length,
    },
    row_errors: parsed.rowErrors,
    warnings: parsed.warnings,
    unknown_species: unknownSpecies,
    unknown_suppliers: unknownSuppliers,
    shipments,
    preview_hash: buildPreviewHash(institutionId, shipments),
  };

  return shipmentImportPreviewResponseSchema.parse(payload);
}

export async function commitPlatformShipmentImport({
  institutionId,
  preview_hash,
  shipments,
  options,
}: ShipmentImportCommitRequest & { institutionId: number }): Promise<ShipmentImportCommitResponse> {
  await assertPlatformImportAccess(institutionId);
  return commitShipmentImportForInstitution({ institutionId, preview_hash, shipments, options });
}

export async function commitShipmentImportForInstitution({
  institutionId,
  preview_hash,
  shipments,
  options,
}: ShipmentImportCommitRequest & { institutionId: number }): Promise<ShipmentImportCommitResponse> {
  const expectedPreviewHash = buildPreviewHash(institutionId, shipments);
  if (expectedPreviewHash !== preview_hash) {
    throw new Error("PREVIEW_HASH_MISMATCH");
  }

  const allowSpeciesAutocreate = options?.allow_species_autocreate ?? false;
  const allowDuplicateHeaders = options?.allow_duplicate_headers ?? false;

  const [speciesRows, globalSupplierRows] = await Promise.all([
    listSpeciesGlobal(),
    listSuppliersGlobal(),
  ]);

  const speciesLookup = new Map(
    speciesRows.map((species) => [normalizeScientificName(species.scientificName), species.id]),
  );

  const globalSuppliersByCode = new Map<string, (typeof globalSupplierRows)[number]>();
  for (const supplier of globalSupplierRows) {
    const normalizedCode = normalizeSupplierCode(supplier.code);
    if (!globalSuppliersByCode.has(normalizedCode)) {
      globalSuppliersByCode.set(normalizedCode, supplier);
    }
  }
  const ensuredSupplierCodes = new Set<string>();

  let created = 0;
  let failed = 0;
  let skipped = 0;
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const shipment of shipments) {
    const label = formatShipmentLabel(shipment);

    try {
      const supplierCode = normalizeSupplierCode(shipment.supplier_code);
      const shipmentDate = new Date(shipment.shipment_date);
      const arrivalDate = new Date(shipment.arrival_date);

      if (!ensuredSupplierCodes.has(supplierCode)) {
        const globalMatch = globalSuppliersByCode.get(supplierCode);

        const ensuredSupplier = await ensureSupplierExistsForGlobalImport(supplierCode, {
          name: globalMatch?.name ?? supplierCode,
          country: globalMatch?.country ?? "Unknown",
          websiteUrl: globalMatch?.websiteUrl ?? null,
        });

        ensuredSupplierCodes.add(supplierCode);
        if (ensuredSupplier.wasGloballyMissing) {
          globalSuppliersByCode.set(supplierCode, {
            id: ensuredSupplier.id,
            code: ensuredSupplier.code,
            name: globalMatch?.name ?? supplierCode,
            country: globalMatch?.country ?? "Unknown",
            websiteUrl: globalMatch?.websiteUrl ?? null,
            isActive: false,
            createdAt: new Date(),
          });
          warnings.push(`Supplier ${supplierCode} was auto-created as inactive for global review.`);
        }
      }

      const unresolvedSpecies: string[] = [];
      const items = [];

      for (const item of shipment.items) {
        const normalizedScientificName = normalizeScientificName(item.scientific_name);
        let speciesId = speciesLookup.get(normalizedScientificName);

        if (!speciesId && allowSpeciesAutocreate) {
          try {
            const createdSpecies = await createSpecies(
              buildUnknownSpeciesPayload(normalizedScientificName),
            );
            speciesId = createdSpecies.id;
            speciesLookup.set(normalizedScientificName, speciesId);
            warnings.push(`Species ${normalizedScientificName} was auto-created in master list.`);
          } catch (error) {
            if (isUniqueViolation(error)) {
              const refreshedSpeciesRows = await listSpeciesGlobal();
              for (const species of refreshedSpeciesRows) {
                speciesLookup.set(normalizeScientificName(species.scientificName), species.id);
              }
              speciesId = speciesLookup.get(normalizedScientificName);
            } else {
              throw error;
            }
          }
        }

        if (!speciesId) {
          unresolvedSpecies.push(item.scientific_name);
          continue;
        }

        items.push({
          butterfly_species_id: speciesId,
          number_received: item.number_received,
          emerged_in_transit: item.emerged_in_transit,
          damaged_in_transit: item.damaged_in_transit,
          diseased_in_transit: item.diseased_in_transit,
          parasite: item.parasite,
          non_emergence: item.non_emergence,
          poor_emergence: item.poor_emergence,
        });
      }

      if (unresolvedSpecies.length > 0) {
        failed += 1;
        failures.push(
          `${label}: Unknown species ${Array.from(new Set(unresolvedSpecies)).sort().join(", ")}`,
        );
        continue;
      }

      if (items.length === 0) {
        failed += 1;
        failures.push(`${label}: Shipment has no importable items.`);
        continue;
      }

      await ensureSpeciesLinksForInstitution(
        institutionId,
        items.map((item) => item.butterfly_species_id),
      );

      if (!allowDuplicateHeaders) {
        const exists = await shipmentHeaderExists(
          institutionId,
          supplierCode,
          shipmentDate,
          arrivalDate,
        );
        if (exists) {
          skipped += 1;
          warnings.push(`${label}: Shipment header already exists and was skipped.`);
          continue;
        }
      }

      await createShipment(institutionId, {
        supplier_code: supplierCode,
        shipment_date: shipmentDate,
        arrival_date: arrivalDate,
        items,
      });

      created += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error && error.message ? error.message : "Unable to import shipment";
      failures.push(`${label}: ${message}`);
    }
  }

  return shipmentImportCommitResponseSchema.parse({
    created,
    failed,
    skipped,
    failures,
    warnings,
  });
}

type ExportRange = { from?: string; to?: string };

export async function exportPlatformShipmentWorkbook({
  institutionId,
  range,
}: {
  institutionId: number;
  range?: ExportRange;
}) {
  await assertPlatformImportAccess(institutionId);
  return exportShipmentWorkbookForInstitution({ institutionId, range });
}

export async function exportShipmentWorkbookForInstitution({
  institutionId,
  range,
}: {
  institutionId: number;
  range?: ExportRange;
}) {
  const xlsx = await import("xlsx");
  const rows = await listShipmentExportRows(institutionId, range);
  const worksheetRows = [Array.from(SHIPMENT_EXPORT_HEADERS), ...rows.map(mapRowToExportRecord)];

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet(worksheetRows);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Shipments");

  return xlsx.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  }) as Buffer;
}
