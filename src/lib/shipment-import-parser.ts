export function normalizeScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeSupplierCode(value: string) {
  // Preserve historical supplier values exactly except for accidental outer whitespace.
  return value.trim();
}

export function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function parseNonNegativeInteger(value: string, { required }: { required: boolean }) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return required ? null : 0;
  }

  const parsed = Number.parseInt(trimmed.replace(/,/g, ""), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return null;

  return parsed;
}

function toUtcNoonIso(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

export function parseExcelDateToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = Number.parseFloat(trimmed);
    if (!Number.isFinite(serial) || serial <= 0) return null;

    const millis = Math.round((serial - 25569) * 24 * 60 * 60 * 1000);
    const date = new Date(millis);
    if (Number.isNaN(date.valueOf())) return null;

    return toUtcNoonIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const month = Number.parseInt(match[1], 10);
    const day = Number.parseInt(match[2], 10);
    const rawYear = Number.parseInt(match[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    const validated = new Date(Date.UTC(year, month - 1, day));
    if (
      validated.getUTCFullYear() !== year ||
      validated.getUTCMonth() + 1 !== month ||
      validated.getUTCDate() !== day
    ) {
      return null;
    }

    return toUtcNoonIso(year, month, day);
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.valueOf())) return null;

  return toUtcNoonIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// =============================================================================================
// Strict 13-column contract (Released / good_emergence aware)
//
// This is the only shipment-import parsing contract this module implements — exact header
// matching, required `No. rec`, blocking (not normalized) arrival-before-ship-date, tri-state
// Released parsing, accounting-bound validation (including the PostgreSQL integer upper bound,
// hardening checkpoint, review section 15.2), and mixed-duplicate-species-Released rejection. The
// earlier fuzzy-matching legacy parser (`parseShipmentImportRows`/`groupShipmentImportRows`/
// `detectShipmentImportHeaderKey`) that once lived here has been removed — confirmed, by a
// repo-wide search, to have had zero callers anywhere outside its own definition and its own
// dedicated tests since the service layer was wired onto this strict contract in Phase 3B.
// =============================================================================================

export type StrictShipmentImportHeaderKey =
  | "species"
  | "commonName"
  | "numberReceived"
  | "supplier"
  | "shipDate"
  | "arrivalDate"
  | "emergedInTransit"
  | "damagedInTransit"
  | "diseasedInTransit"
  | "parasite"
  | "nonEmergence"
  | "poorEmergence"
  | "released";

const STRICT_HEADER_KEY_ORDER: readonly StrictShipmentImportHeaderKey[] = [
  "species",
  "commonName",
  "numberReceived",
  "supplier",
  "shipDate",
  "arrivalDate",
  "emergedInTransit",
  "damagedInTransit",
  "diseasedInTransit",
  "parasite",
  "nonEmergence",
  "poorEmergence",
  "released",
];

const STRICT_METRIC_KEYS = [
  "emergedInTransit",
  "damagedInTransit",
  "diseasedInTransit",
  "parasite",
  "nonEmergence",
  "poorEmergence",
] as const satisfies readonly StrictShipmentImportHeaderKey[];

/** PostgreSQL `integer` (`int4`) column maximum — every quantity column this parser produces
 * (`No. rec`, the six loss columns, and `Released`) is stored in an `integer` column
 * (`shipment_items`, confirmed against `flutr_import_test`'s actual schema), so no value — nor any
 * post-grouping sum of several otherwise-valid rows for the same shipment+species key — may exceed
 * this. Enforced in two places: per-row here in `parseShipmentImportRowsStrict`, and again on the
 * aggregated/summed value in `groupShipmentImportRowsStrict`, since summing several individually
 * in-bounds rows can still overflow (hardening checkpoint, review section 15.2). */
export const POSTGRES_INTEGER_MAX = 2_147_483_647;

// Keep explicit (not positionally derived from CANONICAL_SHIPMENT_IMPORT_HEADERS) so a reorder
// of either list is a visible diff in both places; the parser test suite asserts they agree.
export const CANONICAL_HEADER_LABEL_BY_KEY: Record<StrictShipmentImportHeaderKey, string> = {
  species: "Species",
  commonName: "Common name",
  numberReceived: "No. rec",
  supplier: "Supplier",
  shipDate: "Ship date",
  arrivalDate: "Arrival date",
  emergedInTransit: "Emerg. in transit",
  damagedInTransit: "Damag in transit",
  diseasedInTransit: "No. disea",
  parasite: "No. parasit",
  nonEmergence: "No emerg",
  poorEmergence: "Poor emerg",
  released: "Released",
};

export interface ShipmentImportIssue {
  /** 1-indexed worksheet row (header row is row 1). `null` for header-level or multi-row issues. */
  rowNumber: number | null;
  /** Present instead of `rowNumber` for an issue spanning multiple original rows. */
  rowNumbers?: number[];
  /** Canonical column name this issue concerns, when it maps to exactly one column. */
  field: string | null;
  /** Original raw cell text, when applicable. */
  value: string | null;
  message: string;
}

export function formatShipmentImportIssue(issue: ShipmentImportIssue): string {
  if (issue.rowNumber != null) return `Row ${issue.rowNumber}: ${issue.message}`;
  if (issue.rowNumbers?.length) return `Rows ${issue.rowNumbers.join(", ")}: ${issue.message}`;
  return issue.message;
}

export interface StrictParsedShipmentImportRow {
  rowNumber: number;
  scientificName: string;
  supplierCode: string;
  shipmentDate: string;
  arrivalDate: string;
  numberReceived: number;
  emergedInTransit: number;
  damagedInTransit: number;
  diseasedInTransit: number;
  parasite: number;
  nonEmergence: number;
  poorEmergence: number;
  /** `null` = historically unknown (blank cell); a number (including `0`) = known. */
  goodEmergence: number | null;
}

export interface StrictParsedShipmentImportResult {
  rows: StrictParsedShipmentImportRow[];
  issues: ShipmentImportIssue[];
  rowErrors: string[];
}

export interface StrictShipmentImportDraftItem {
  scientific_name: string;
  number_received: number;
  emerged_in_transit: number;
  damaged_in_transit: number;
  diseased_in_transit: number;
  parasite: number;
  non_emergence: number;
  poor_emergence: number;
  good_emergence: number | null;
}

export interface StrictShipmentImportDraft {
  supplier_code: string;
  shipment_date: string;
  arrival_date: string;
  items: StrictShipmentImportDraftItem[];
}

export interface StrictGroupedShipmentImportResult {
  drafts: StrictShipmentImportDraft[];
  issues: ShipmentImportIssue[];
  rowErrors: string[];
}

function normalizeHeaderStrict(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Exact (case/whitespace-insensitive only) match against the 13 canonical headers. No fuzzy or
 * prefix matching. Missing, duplicate, and unrecognized headers are all collected as blocking
 * issues together, not stopped at the first one found.
 */
export function validateHeaderRow(headerCells: string[]): {
  issues: ShipmentImportIssue[];
  indices: Partial<Record<StrictShipmentImportHeaderKey, number>>;
} {
  const canonicalByNormalized = new Map<string, StrictShipmentImportHeaderKey>(
    STRICT_HEADER_KEY_ORDER.map((key) => [
      normalizeHeaderStrict(CANONICAL_HEADER_LABEL_BY_KEY[key]),
      key,
    ]),
  );

  const counts = new Map<StrictShipmentImportHeaderKey, number>();
  const indices: Partial<Record<StrictShipmentImportHeaderKey, number>> = {};
  const issues: ShipmentImportIssue[] = [];

  headerCells.forEach((cell, index) => {
    const key = canonicalByNormalized.get(normalizeHeaderStrict(cell));
    if (!key) {
      issues.push({
        rowNumber: null,
        field: null,
        value: cell,
        message: `Unrecognized column header "${cell}" at position ${index + 1}.`,
      });
      return;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!(key in indices)) indices[key] = index;
  });

  for (const key of STRICT_HEADER_KEY_ORDER) {
    const label = CANONICAL_HEADER_LABEL_BY_KEY[key];
    const count = counts.get(key) ?? 0;
    if (count === 0) {
      issues.push({
        rowNumber: null,
        field: label,
        value: null,
        message: `Missing required column: "${label}".`,
      });
    }
    if (count > 1) {
      issues.push({
        rowNumber: null,
        field: label,
        value: null,
        message: `Duplicate column: "${label}" appears ${count} times.`,
      });
    }
  }

  return { issues, indices };
}

export type ParsedReleasedQuantity =
  | { kind: "unknown" }
  | { kind: "value"; value: number }
  | { kind: "invalid" };

/**
 * Tri-state Released parser: blank is a distinct, valid "unknown" state — never defaulted to 0
 * like the six loss columns — so it must not reuse `parseNonNegativeInteger`.
 */
export function parseReleasedQuantity(value: string): ParsedReleasedQuantity {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { kind: "unknown" };

  const withoutCommas = trimmed.replace(/,/g, "");
  const parsed = Number.parseInt(withoutCommas, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== withoutCommas) {
    return { kind: "invalid" };
  }

  return { kind: "value", value: parsed };
}

export function parseShipmentImportRowsStrict(rawText: string): StrictParsedShipmentImportResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    const issues: ShipmentImportIssue[] = [
      {
        rowNumber: null,
        field: null,
        value: null,
        message: "Provide a header row and at least one data row.",
      },
    ];
    return { rows: [], issues, rowErrors: issues.map(formatShipmentImportIssue) };
  }

  const headerLine = lines[0].replace(/^﻿/, "");
  const delimiter = headerLine.split("\t").length >= headerLine.split(",").length ? "\t" : ",";
  const headerCells = splitDelimitedLine(headerLine, delimiter);

  const { issues: headerIssues, indices } = validateHeaderRow(headerCells);
  if (headerIssues.length > 0) {
    return {
      rows: [],
      issues: headerIssues,
      rowErrors: headerIssues.map(formatShipmentImportIssue),
    };
  }

  const getCellValue = (cells: string[], key: StrictShipmentImportHeaderKey) => {
    const index = indices[key];
    if (index == null) return "";
    return cells[index] ?? "";
  };

  const rows: StrictParsedShipmentImportRow[] = [];
  const issues: ShipmentImportIssue[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitDelimitedLine(lines[lineIndex], delimiter);
    const rowNumber = lineIndex + 1;

    const scientificName = normalizeScientificName(getCellValue(cells, "species"));
    const supplierCode = normalizeSupplierCode(getCellValue(cells, "supplier"));
    const shipmentDateRaw = getCellValue(cells, "shipDate");
    const arrivalDateRaw = getCellValue(cells, "arrivalDate");
    const shipmentDate = parseExcelDateToIso(shipmentDateRaw);
    const arrivalDate = parseExcelDateToIso(arrivalDateRaw);

    if (!scientificName) {
      issues.push({
        rowNumber,
        field: "Species",
        value: getCellValue(cells, "species"),
        message: "Species is required.",
      });
      continue;
    }

    if (!supplierCode) {
      issues.push({
        rowNumber,
        field: "Supplier",
        value: getCellValue(cells, "supplier"),
        message: "Supplier is required.",
      });
      continue;
    }

    if (!shipmentDate) {
      issues.push({
        rowNumber,
        field: "Ship date",
        value: shipmentDateRaw,
        message: "Ship date is invalid.",
      });
      continue;
    }

    if (!arrivalDate) {
      issues.push({
        rowNumber,
        field: "Arrival date",
        value: arrivalDateRaw,
        message: "Arrival date is invalid.",
      });
      continue;
    }

    if (new Date(arrivalDate).valueOf() < new Date(shipmentDate).valueOf()) {
      issues.push({
        rowNumber,
        field: "Arrival date",
        value: arrivalDateRaw,
        message: "Arrival date must be on or after Ship date.",
      });
      continue;
    }

    const numberReceivedRaw = getCellValue(cells, "numberReceived");
    const numberReceived = parseNonNegativeInteger(numberReceivedRaw, { required: true });
    if (numberReceived == null) {
      issues.push({
        rowNumber,
        field: "No. rec",
        value: numberReceivedRaw,
        message:
          numberReceivedRaw.trim().length === 0
            ? "No. rec is required."
            : "No. rec must be a non-negative integer.",
      });
      continue;
    }

    if (numberReceived > POSTGRES_INTEGER_MAX) {
      issues.push({
        rowNumber,
        field: "No. rec",
        value: numberReceivedRaw,
        message: `No. rec (${numberReceived}) exceeds the maximum allowed value (${POSTGRES_INTEGER_MAX}).`,
      });
      continue;
    }

    const metricRaws: Record<(typeof STRICT_METRIC_KEYS)[number], string> = {
      emergedInTransit: getCellValue(cells, "emergedInTransit"),
      damagedInTransit: getCellValue(cells, "damagedInTransit"),
      diseasedInTransit: getCellValue(cells, "diseasedInTransit"),
      parasite: getCellValue(cells, "parasite"),
      nonEmergence: getCellValue(cells, "nonEmergence"),
      poorEmergence: getCellValue(cells, "poorEmergence"),
    };

    const metricValues: Partial<Record<(typeof STRICT_METRIC_KEYS)[number], number>> = {};
    let metricsAllValid = true;
    for (const key of STRICT_METRIC_KEYS) {
      const parsedMetric = parseNonNegativeInteger(metricRaws[key], { required: false });
      if (parsedMetric == null) {
        metricsAllValid = false;
        issues.push({
          rowNumber,
          field: CANONICAL_HEADER_LABEL_BY_KEY[key],
          value: metricRaws[key],
          message: `${CANONICAL_HEADER_LABEL_BY_KEY[key]} must be a non-negative integer.`,
        });
        continue;
      }
      if (parsedMetric > POSTGRES_INTEGER_MAX) {
        metricsAllValid = false;
        issues.push({
          rowNumber,
          field: CANONICAL_HEADER_LABEL_BY_KEY[key],
          value: metricRaws[key],
          message: `${CANONICAL_HEADER_LABEL_BY_KEY[key]} (${parsedMetric}) exceeds the maximum allowed value (${POSTGRES_INTEGER_MAX}).`,
        });
        continue;
      }
      metricValues[key] = parsedMetric;
    }

    if (!metricsAllValid) continue;

    const emergedInTransit = metricValues.emergedInTransit!;
    const damagedInTransit = metricValues.damagedInTransit!;
    const diseasedInTransit = metricValues.diseasedInTransit!;
    const parasite = metricValues.parasite!;
    const nonEmergence = metricValues.nonEmergence!;
    const poorEmergence = metricValues.poorEmergence!;

    const totalLosses =
      emergedInTransit +
      damagedInTransit +
      diseasedInTransit +
      parasite +
      nonEmergence +
      poorEmergence;

    if (totalLosses > numberReceived) {
      issues.push({
        rowNumber,
        field: null,
        value: null,
        message: `Total losses (${totalLosses}) cannot exceed No. rec (${numberReceived}).`,
      });
      continue;
    }

    const releasedRaw = getCellValue(cells, "released");
    const released = parseReleasedQuantity(releasedRaw);

    if (released.kind === "invalid") {
      issues.push({
        rowNumber,
        field: "Released",
        value: releasedRaw,
        message: "Released must be a non-negative integer or blank.",
      });
      continue;
    }

    if (released.kind === "value" && released.value > POSTGRES_INTEGER_MAX) {
      issues.push({
        rowNumber,
        field: "Released",
        value: releasedRaw,
        message: `Released (${released.value}) exceeds the maximum allowed value (${POSTGRES_INTEGER_MAX}).`,
      });
      continue;
    }

    if (released.kind === "value" && released.value + totalLosses > numberReceived) {
      issues.push({
        rowNumber,
        field: "Released",
        value: releasedRaw,
        message: `Released (${released.value}) plus total losses (${totalLosses}) cannot exceed No. rec (${numberReceived}).`,
      });
      continue;
    }

    rows.push({
      rowNumber,
      scientificName,
      supplierCode,
      shipmentDate,
      arrivalDate,
      numberReceived,
      emergedInTransit,
      damagedInTransit,
      diseasedInTransit,
      parasite,
      nonEmergence,
      poorEmergence,
      goodEmergence: released.kind === "value" ? released.value : null,
    });
  }

  return { rows, issues, rowErrors: issues.map(formatShipmentImportIssue) };
}

export function groupShipmentImportRowsStrict(
  rows: StrictParsedShipmentImportRow[],
): StrictGroupedShipmentImportResult {
  type SpeciesBucket = {
    scientificName: string;
    rows: StrictParsedShipmentImportRow[];
  };

  const shipmentBuckets = new Map<
    string,
    {
      supplier_code: string;
      shipment_date: string;
      arrival_date: string;
      bySpecies: Map<string, SpeciesBucket>;
    }
  >();

  for (const row of rows) {
    const shipmentKey = `${row.supplierCode}|${row.shipmentDate}|${row.arrivalDate}`;
    const shipmentBucket = shipmentBuckets.get(shipmentKey) ?? {
      supplier_code: row.supplierCode,
      shipment_date: row.shipmentDate,
      arrival_date: row.arrivalDate,
      bySpecies: new Map<string, SpeciesBucket>(),
    };

    const speciesBucket = shipmentBucket.bySpecies.get(row.scientificName) ?? {
      scientificName: row.scientificName,
      rows: [],
    };
    speciesBucket.rows.push(row);
    shipmentBucket.bySpecies.set(row.scientificName, speciesBucket);
    shipmentBuckets.set(shipmentKey, shipmentBucket);
  }

  const issues: ShipmentImportIssue[] = [];
  const excludedShipmentKeys = new Set<string>();
  const draftsByKey = new Map<string, StrictShipmentImportDraft>();

  for (const [shipmentKey, shipmentBucket] of shipmentBuckets) {
    const items: StrictShipmentImportDraftItem[] = [];

    for (const speciesBucket of shipmentBucket.bySpecies.values()) {
      const contributingRows = speciesBucket.rows;

      const numberReceived = contributingRows.reduce((sum, r) => sum + r.numberReceived, 0);
      const emergedInTransit = contributingRows.reduce((sum, r) => sum + r.emergedInTransit, 0);
      const damagedInTransit = contributingRows.reduce((sum, r) => sum + r.damagedInTransit, 0);
      const diseasedInTransit = contributingRows.reduce((sum, r) => sum + r.diseasedInTransit, 0);
      const parasite = contributingRows.reduce((sum, r) => sum + r.parasite, 0);
      const nonEmergence = contributingRows.reduce((sum, r) => sum + r.nonEmergence, 0);
      const poorEmergence = contributingRows.reduce((sum, r) => sum + r.poorEmergence, 0);

      const hasKnownReleased = contributingRows.some((r) => r.goodEmergence !== null);
      const hasUnknownReleased = contributingRows.some((r) => r.goodEmergence === null);

      let goodEmergence: number | null;
      if (hasKnownReleased && hasUnknownReleased) {
        issues.push({
          rowNumber: null,
          rowNumbers: contributingRows.map((r) => r.rowNumber),
          field: "Released",
          value: null,
          message:
            `Species "${speciesBucket.scientificName}" in shipment ${shipmentBucket.supplier_code} ` +
            `(${shipmentBucket.shipment_date.slice(0, 10)} -> ${shipmentBucket.arrival_date.slice(0, 10)}) ` +
            `has mixed known and unknown Released values. Make every row's Released value either ` +
            `known or blank before importing this shipment.`,
        });
        excludedShipmentKeys.add(shipmentKey);
        goodEmergence = null; // unused — shipment is excluded below
      } else if (hasKnownReleased) {
        goodEmergence = contributingRows.reduce((sum, r) => sum + (r.goodEmergence ?? 0), 0);
      } else {
        goodEmergence = null;
      }

      items.push({
        scientific_name: speciesBucket.scientificName,
        number_received: numberReceived,
        emerged_in_transit: emergedInTransit,
        damaged_in_transit: damagedInTransit,
        diseased_in_transit: diseasedInTransit,
        parasite,
        non_emergence: nonEmergence,
        poor_emergence: poorEmergence,
        good_emergence: goodEmergence,
      });

      // Post-grouping aggregate bound check (hardening checkpoint, review section 15.2): summing
      // several individually in-bounds rows for the same shipment+species key can still overflow
      // PostgreSQL's `integer` column even though no single contributing row does — a per-row-only
      // check (above, in `parseShipmentImportRowsStrict`) cannot catch this. Checked for every
      // aggregated field; `good_emergence` is included only when known (never when `null`).
      const aggregateFields: { value: number; field: string }[] = [
        { value: numberReceived, field: "No. rec" },
        { value: emergedInTransit, field: "Emerg. in transit" },
        { value: damagedInTransit, field: "Damag in transit" },
        { value: diseasedInTransit, field: "No. disea" },
        { value: parasite, field: "No. parasit" },
        { value: nonEmergence, field: "No emerg" },
        { value: poorEmergence, field: "Poor emerg" },
      ];
      if (goodEmergence !== null) {
        aggregateFields.push({ value: goodEmergence, field: "Released" });
      }

      for (const { value, field } of aggregateFields) {
        if (value > POSTGRES_INTEGER_MAX) {
          issues.push({
            rowNumber: null,
            rowNumbers: contributingRows.map((r) => r.rowNumber),
            field,
            value: null,
            message:
              `${field} total (${value}) across these rows exceeds the maximum allowed value ` +
              `(${POSTGRES_INTEGER_MAX}) once combined for this species within this shipment.`,
          });
          excludedShipmentKeys.add(shipmentKey);
        }
      }
    }

    draftsByKey.set(shipmentKey, {
      supplier_code: shipmentBucket.supplier_code,
      shipment_date: shipmentBucket.shipment_date,
      arrival_date: shipmentBucket.arrival_date,
      items,
    });
  }

  const drafts = Array.from(draftsByKey.entries())
    .filter(([key]) => !excludedShipmentKeys.has(key))
    .map(([, draft]) => draft);

  return { drafts, issues, rowErrors: issues.map(formatShipmentImportIssue) };
}
