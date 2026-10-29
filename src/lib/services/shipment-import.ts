import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { auth } from "@/auth";
import { canCrossTenant, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  createShipment,
  listShipmentExportRows,
  shipmentHeaderExists,
} from "@/lib/queries/shipments";
import { createSpecies, listSpeciesGlobal } from "@/lib/queries/species";
import { ensureSupplierExistsForGlobalImport, listSuppliersGlobal } from "@/lib/queries/suppliers";
import {
  formatShipmentImportIssue,
  groupShipmentImportRowsStrict,
  normalizeScientificName,
  normalizeSupplierCode,
  parseShipmentImportRowsStrict,
  type ShipmentImportIssue,
  type StrictShipmentImportDraft,
} from "@/lib/shipment-import-parser";
import { CANONICAL_SHIPMENT_IMPORT_HEADERS, extractYear } from "@/lib/shipment-import-utils";
import { ensureTenantExists, TENANT_ERRORS } from "@/lib/tenant";
import {
  shipmentImportCommitResponseSchema,
  shipmentImportPreviewResponseSchema,
  type ShipmentImportCommitRequest,
  type ShipmentImportCommitResponse,
  type ShipmentImportPreviewRequest,
  type ShipmentImportPreviewResponse,
} from "@/lib/validation/shipment-import";

/**
 * Thrown by `commitShipmentImportForInstitution` when the full, fresh re-validation of the
 * entire submitted workbook finds any blocking issue (header, row, group, or unresolved-species)
 * — per Phase 3A's resolved architecture, this is re-derived from `raw_text` on every request,
 * never trusted from an earlier validate/preview call. Carries the structured issues so the
 * route can surface them the same way preview does.
 */
export class ShipmentImportValidationError extends Error {
  issues: ShipmentImportIssue[];

  constructor(issues: ShipmentImportIssue[]) {
    super("VALIDATION_FAILED");
    this.name = "ShipmentImportValidationError";
    this.issues = issues;
  }
}

/** One advisory-lock namespace shared by every acquire/check call — must stay the single
 * constant used everywhere a lock is taken, or the mechanism silently fails to serialize
 * anything (flagged explicitly in the plan's "Risks and unresolved questions"). */
const SHIPMENT_IMPORT_LOCK_NAMESPACE = "shipment_import";

type ShipmentExportRow = Awaited<ReturnType<typeof listShipmentExportRows>>[number];

/** The exporter's header row — sourced from the single canonical-header constant (also used by
 * strict header validation and the blank template) so the two can never drift apart. Hardening
 * checkpoint: `Released` (the 13th header) was previously missing here entirely — confirmed by
 * direct code reading in the pre-release review, not assumed — meaning a real export could not be
 * re-imported by the strict importer, which requires all 13 canonical headers. */
const SHIPMENT_EXPORT_HEADERS = CANONICAL_SHIPMENT_IMPORT_HEADERS;

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

function formatShipmentLabel(shipment: StrictShipmentImportDraft) {
  const shipmentDate = shipment.shipment_date.slice(0, 10);
  const arrivalDate = shipment.arrival_date.slice(0, 10);
  return `${shipment.supplier_code} (${shipmentDate} -> ${arrivalDate})`;
}

/**
 * Hash scoped to the raw workbook text itself (Phase 3A's resolved validation-integrity
 * architecture) — the single hash concept used by both validate/preview and the year-scoped
 * commit endpoint (Phase 3C). A same-input workflow-integrity check, not a security/approval
 * mechanism: the commit endpoint always re-derives and re-validates everything from `raw_text`
 * itself, independent of whether this hash matches.
 */
function buildPreviewHash(institutionId: number, rawText: string) {
  const hashSource = JSON.stringify({
    institution_id: institutionId,
    raw_text: rawText,
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
    // Never `row.goodEmergence ?? ""` — `??` would turn the one other falsy case that matters
    // here (numeric `0`) into the SAME blank cell as `null`, destroying the exact NULL-vs-zero
    // distinction this entire feature exists to preserve. Only `null` (historically unknown)
    // becomes blank; a known, tracked `0` is written out as the literal number 0.
    row.goodEmergence === null ? "" : row.goodEmergence,
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
  // Platform (SUPERUSER) requests can legally opt into species auto-create at commit time
  // (`allow_species_autocreate`), so an unresolved species stays an informational notice here,
  // unchanged from today — only a tenant request (which can never legally auto-create) promotes
  // it to a blocking issue. See `buildShipmentImportPreviewForInstitution`'s
  // `allowSpeciesAutocreateEligible` parameter.
  return buildShipmentImportPreviewForInstitution({
    institutionId,
    raw_text,
    source,
    allowSpeciesAutocreateEligible: true,
  });
}

export async function buildShipmentImportPreviewForInstitution({
  institutionId,
  raw_text,
  allowSpeciesAutocreateEligible = false,
}: ShipmentImportPreviewRequest & {
  institutionId: number;
  /** `false` (default) for a tenant request, which can never legally auto-create a species —
   * every unresolved species becomes a blocking issue. `true` for a platform/SUPERUSER request,
   * which can legally opt into auto-create at commit time — unresolved species stay an
   * informational notice only, unchanged from today's behavior. */
  allowSpeciesAutocreateEligible?: boolean;
}): Promise<ShipmentImportPreviewResponse> {
  const parsed = parseShipmentImportRowsStrict(raw_text);
  const grouped = groupShipmentImportRowsStrict(parsed.rows);

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

  // Reclassification (review section 11a): a tenant request can never legally auto-create a
  // species, so every unresolved name is promoted from an informational notice into the same
  // blocking `issues`/`row_errors` collection as every other validation problem — surfaced
  // during full-workbook validation, not discovered for the first time at commit. Platform
  // requests keep today's behavior (informational only; the existing `allowSpeciesAutocreate ||
  // unknown_species.length === 0` client gate is unaffected either way).
  const speciesIssues: ShipmentImportIssue[] = allowSpeciesAutocreateEligible
    ? []
    : unknownSpecies.map((scientificName) => ({
        rowNumber: null,
        field: "Species",
        value: scientificName,
        message: `Species "${scientificName}" is not in the catalog and cannot be auto-created for this request.`,
      }));

  const issues: ShipmentImportIssue[] = [...parsed.issues, ...grouped.issues, ...speciesIssues];
  const rowErrors = issues.map(formatShipmentImportIssue);

  // Existing-shipment-header check moved here from commit-only (version 2 design) — a
  // non-blocking notice of what would be skipped by default, visible before any commit attempt.
  // One query per shipment for now (correct, matches the existing function's signature from
  // Phase 2); batching into a single query is a noted, deferred performance optimization (review
  // section 14.3), not required for this phase's correctness.
  const existingShipmentChecks = await Promise.all(
    grouped.drafts.map(async (draft) => {
      const exists = await shipmentHeaderExists(
        institutionId,
        draft.supplier_code,
        new Date(draft.shipment_date),
        new Date(draft.arrival_date),
      );
      return exists ? formatShipmentLabel(draft) : null;
    }),
  );
  const existingShipments = existingShipmentChecks.filter(
    (label): label is string => label !== null,
  );

  const years = Array.from(
    new Set(grouped.drafts.map((draft) => extractYear(draft.arrival_date))),
  ).sort((a, b) => a - b);

  const payload = {
    summary: {
      total_rows: parsed.rows.length,
      shipments_detected: grouped.drafts.length,
      row_errors: rowErrors.length,
      warnings: 0,
      unknown_species: unknownSpecies.length,
      unknown_suppliers: unknownSuppliers.length,
    },
    row_errors: rowErrors,
    warnings: [],
    unknown_species: unknownSpecies,
    unknown_suppliers: unknownSuppliers,
    issues,
    existing_shipments: existingShipments,
    years,
    preview_hash: buildPreviewHash(institutionId, raw_text),
  };

  return shipmentImportPreviewResponseSchema.parse(payload);
}

export async function commitPlatformShipmentImport({
  institutionId,
  raw_text,
  preview_hash,
  year,
  options,
}: ShipmentImportCommitRequest & { institutionId: number }): Promise<ShipmentImportCommitResponse> {
  await assertPlatformImportAccess(institutionId);
  return commitShipmentImportForInstitution({
    institutionId,
    raw_text,
    preview_hash,
    year,
    options,
  });
}

/**
 * Year-scoped atomic commit (Phase 3C). Never trusts a client-supplied shipments structure or a
 * hash as evidence of prior validation — re-derives and re-validates the *entire* workbook from
 * `raw_text` on every call, rejects the whole request if any blocking issue exists anywhere (not
 * only in the requested year), and only then opens one transaction scoped to the requested
 * year's shipments, guarded by a per-institution advisory lock. Earlier/other years' data is
 * untouched regardless of this call's outcome; a failure anywhere inside the transaction rolls
 * back everything this call would have written — there is no partial-success result.
 */
export async function commitShipmentImportForInstitution({
  institutionId,
  raw_text,
  preview_hash,
  year,
  options,
}: ShipmentImportCommitRequest & { institutionId: number }): Promise<ShipmentImportCommitResponse> {
  const expectedPreviewHash = buildPreviewHash(institutionId, raw_text);
  if (expectedPreviewHash !== preview_hash) {
    throw new Error("PREVIEW_HASH_MISMATCH");
  }

  const allowSpeciesAutocreate = options?.allow_species_autocreate ?? false;
  const allowDuplicateHeaders = options?.allow_duplicate_headers ?? false;

  // Full, fresh re-parse/re-group/re-validate of the entire submitted workbook — nothing short
  // of this is ever trusted, regardless of what an earlier preview/validate call concluded.
  const parsed = parseShipmentImportRowsStrict(raw_text);
  const grouped = groupShipmentImportRowsStrict(parsed.rows);

  const [speciesRows, supplierRows] = await Promise.all([
    listSpeciesGlobal(),
    listSuppliersGlobal(),
  ]);

  const speciesLookup = new Map(
    speciesRows.map((species) => [normalizeScientificName(species.scientificName), species.id]),
  );
  const knownSpeciesNames = new Set(speciesLookup.keys());

  const unknownSpecies = Array.from(
    new Set(
      parsed.rows
        .map((row) => row.scientificName)
        .filter((scientificName) => !knownSpeciesNames.has(scientificName)),
    ),
  );

  // Same reclassification rule as preview (review section 11a), but driven by the actual
  // requested `options.allow_species_autocreate` rather than a permission-eligibility flag —
  // the tenant wrapper (`commitTenantShipmentImport`) force-overrides this to `false` before
  // reaching here, exactly as it already did before this phase, so a tenant request can never
  // legally bypass this check regardless of what its own request body asked for.
  const speciesIssues: ShipmentImportIssue[] = allowSpeciesAutocreate
    ? []
    : unknownSpecies.map((scientificName) => ({
        rowNumber: null,
        field: "Species",
        value: scientificName,
        message: `Species "${scientificName}" is not in the catalog and cannot be auto-created for this request.`,
      }));

  // No shipment in ANY year commits while any blocking issue exists anywhere in the workbook —
  // the governing whole-workbook invariant (review section 14.2's final paragraph).
  const issues: ShipmentImportIssue[] = [...parsed.issues, ...grouped.issues, ...speciesIssues];
  if (issues.length > 0) {
    throw new ShipmentImportValidationError(issues);
  }

  const years = Array.from(new Set(grouped.drafts.map((draft) => extractYear(draft.arrival_date))));
  if (!years.includes(year)) {
    throw new Error("YEAR_NOT_FOUND");
  }

  const yearDrafts = grouped.drafts.filter((draft) => extractYear(draft.arrival_date) === year);

  const globalSuppliersByCode = new Map<string, (typeof supplierRows)[number]>();
  for (const supplier of supplierRows) {
    const normalizedCode = normalizeSupplierCode(supplier.code);
    if (!globalSuppliersByCode.has(normalizedCode)) {
      globalSuppliersByCode.set(normalizedCode, supplier);
    }
  }

  return db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext(${SHIPMENT_IMPORT_LOCK_NAMESPACE}), ${institutionId}) AS acquired`,
    );
    const acquired = Boolean((lockResult as unknown as { acquired: boolean }[])[0]?.acquired);
    if (!acquired) {
      throw new Error("IMPORT_ALREADY_RUNNING");
    }

    const ensuredSupplierCodes = new Set<string>();
    const warnings: string[] = [];
    let created = 0;
    let skipped = 0;

    for (const draft of yearDrafts) {
      const supplierCode = normalizeSupplierCode(draft.supplier_code);
      const shipmentDate = new Date(draft.shipment_date);
      const arrivalDate = new Date(draft.arrival_date);

      if (!allowDuplicateHeaders) {
        const exists = await shipmentHeaderExists(
          institutionId,
          supplierCode,
          shipmentDate,
          arrivalDate,
          tx,
        );
        if (exists) {
          skipped += 1;
          continue;
        }
      }

      if (!ensuredSupplierCodes.has(supplierCode)) {
        const globalMatch = globalSuppliersByCode.get(supplierCode);

        const ensuredSupplier = await ensureSupplierExistsForGlobalImport(
          supplierCode,
          {
            name: globalMatch?.name ?? supplierCode,
            country: globalMatch?.country ?? "Unknown",
            websiteUrl: globalMatch?.websiteUrl ?? null,
          },
          tx,
        );

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

      const items = [];
      for (const item of draft.items) {
        const normalizedScientificName = normalizeScientificName(item.scientific_name);
        let speciesId = speciesLookup.get(normalizedScientificName);

        if (!speciesId && allowSpeciesAutocreate) {
          try {
            const createdSpecies = await createSpecies(
              buildUnknownSpeciesPayload(normalizedScientificName),
              tx,
            );
            speciesId = createdSpecies.id;
            speciesLookup.set(normalizedScientificName, speciesId);
            warnings.push(`Species ${normalizedScientificName} was auto-created in master list.`);
          } catch (error) {
            if (isUniqueViolation(error)) {
              // Race against a concurrent import for a *different* institution creating the
              // same global species — the per-institution advisory lock does not (and is not
              // meant to) prevent this; re-select and continue.
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

        // Every species referenced anywhere in the workbook already caused a blocking
        // ShipmentImportValidationError above unless `allowSpeciesAutocreate` is true, in which
        // case it is created just above — this is a can't-happen defensive guard, not an
        // expected path.
        if (!speciesId) {
          throw new Error(`Unexpected unresolved species: ${item.scientific_name}`);
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
          // Preserved exactly — numeric (including 0) or NULL — never coalesced with `??`.
          good_emergence: item.good_emergence,
        });
      }

      // No try/catch here: any failure (a thrown error from createShipment, a DB constraint
      // violation, the defensive guard above, etc.) propagates out of this transaction callback,
      // rolling back every write this call has made so far — there is no partial-success state,
      // unlike the retired per-shipment-resilient legacy loop.
      await createShipment(
        institutionId,
        {
          supplier_code: supplierCode,
          shipment_date: shipmentDate,
          arrival_date: arrivalDate,
          items,
        },
        tx,
      );
      created += 1;
    }

    return shipmentImportCommitResponseSchema.parse({ year, created, skipped, warnings });
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
