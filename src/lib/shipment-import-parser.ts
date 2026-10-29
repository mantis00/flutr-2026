export type ShipmentImportHeaderKey =
  | "species"
  | "supplier"
  | "shipDate"
  | "arrivalDate"
  | "numberReceived"
  | "emergedInTransit"
  | "damagedInTransit"
  | "diseasedInTransit"
  | "parasite"
  | "nonEmergence"
  | "poorEmergence";

export interface ParsedShipmentImportRow {
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
}

export interface ParsedShipmentImportResult {
  rows: ParsedShipmentImportRow[];
  rowErrors: string[];
  warnings: string[];
}

export interface ShipmentImportDraftItem {
  scientific_name: string;
  number_received: number;
  emerged_in_transit: number;
  damaged_in_transit: number;
  diseased_in_transit: number;
  parasite: number;
  non_emergence: number;
  poor_emergence: number;
}

export interface ShipmentImportDraft {
  supplier_code: string;
  shipment_date: string;
  arrival_date: string;
  items: ShipmentImportDraftItem[];
}

const METRIC_COLUMNS = [
  "emergedInTransit",
  "damagedInTransit",
  "diseasedInTransit",
  "parasite",
  "nonEmergence",
  "poorEmergence",
] as const satisfies readonly ShipmentImportHeaderKey[];

const METRIC_COLUMN_LABELS: Record<(typeof METRIC_COLUMNS)[number], string> = {
  emergedInTransit: "Emerg. in tr",
  damagedInTransit: "Damag in tr",
  diseasedInTransit: "No. disea",
  parasite: "No. parasit",
  nonEmergence: "No emerg",
  poorEmergence: "Poor emerg",
};

export function normalizeScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeSupplierCode(value: string) {
  // Preserve historical supplier values exactly except for accidental outer whitespace.
  return value.trim();
}

export function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

export function detectShipmentImportHeaderKey(header: string): ShipmentImportHeaderKey | null {
  const normalized = normalizeHeader(header);

  if (normalized === "species") return "species";
  if (normalized === "supplier") return "supplier";
  if (normalized === "ship date" || normalized === "shipment date") return "shipDate";
  if (normalized === "arrival date") return "arrivalDate";
  if (
    normalized === "no rec" ||
    normalized === "number rec" ||
    normalized === "number received" ||
    normalized === "no received"
  ) {
    return "numberReceived";
  }

  if (normalized.startsWith("emerg")) return "emergedInTransit";
  if (normalized.startsWith("damag")) return "damagedInTransit";
  if (normalized.startsWith("no disea") || normalized.startsWith("disea")) {
    return "diseasedInTransit";
  }

  if (normalized.startsWith("no parasit") || normalized.startsWith("parasit")) {
    return "parasite";
  }

  if (normalized === "no emerg" || normalized === "non emergence" || normalized === "non emerg") {
    return "nonEmergence";
  }

  if (normalized.startsWith("poor emerg")) return "poorEmergence";

  return null;
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

export function parseShipmentImportRows(rawText: string): ParsedShipmentImportResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return {
      rows: [],
      rowErrors: ["Provide a header row and at least one data row."],
      warnings: [],
    };
  }

  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const delimiter = headerLine.split("\t").length >= headerLine.split(",").length ? "\t" : ",";
  const headerCells = splitDelimitedLine(headerLine, delimiter);

  const indices: Partial<Record<ShipmentImportHeaderKey, number>> = {};
  headerCells.forEach((headerCell, index) => {
    const key = detectShipmentImportHeaderKey(headerCell);
    if (key && indices[key] == null) {
      indices[key] = index;
    }
  });

  const requiredColumns: ShipmentImportHeaderKey[] = [
    "species",
    "supplier",
    "shipDate",
    "arrivalDate",
    "numberReceived",
  ];

  const missingColumns = requiredColumns.filter((column) => indices[column] == null);
  if (missingColumns.length > 0) {
    return {
      rows: [],
      rowErrors: [
        `Missing required columns: ${missingColumns.join(", ")}.`,
        "Expected headers similar to: Species, No. rec, Supplier, Ship date, Arrival date.",
      ],
      warnings: [],
    };
  }

  const warnings: string[] = [];

  const missingMetricColumns = METRIC_COLUMNS.filter((column) => indices[column] == null);
  if (missingMetricColumns.length > 0) {
    const labels = missingMetricColumns.map((column) => METRIC_COLUMN_LABELS[column]).join(", ");
    warnings.push(
      `Missing metric columns (${labels}). Values in these columns will default to 0 for each imported row.`,
    );
  }

  const getCellValue = (cells: string[], key: ShipmentImportHeaderKey) => {
    const index = indices[key];
    if (index == null) return "";
    return cells[index] ?? "";
  };

  const rows: ParsedShipmentImportRow[] = [];
  const rowErrors: string[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitDelimitedLine(lines[lineIndex], delimiter);
    const rowNumber = lineIndex + 1;

    const scientificName = normalizeScientificName(getCellValue(cells, "species"));
    const supplierCode = normalizeSupplierCode(getCellValue(cells, "supplier"));
    const shipmentDate = parseExcelDateToIso(getCellValue(cells, "shipDate"));
    const arrivalDate = parseExcelDateToIso(getCellValue(cells, "arrivalDate"));

    const numberReceivedRaw = getCellValue(cells, "numberReceived");
    const numberReceived = parseNonNegativeInteger(numberReceivedRaw, {
      required: false,
    });
    const emergedInTransit = parseNonNegativeInteger(getCellValue(cells, "emergedInTransit"), {
      required: false,
    });
    const damagedInTransit = parseNonNegativeInteger(getCellValue(cells, "damagedInTransit"), {
      required: false,
    });
    const diseasedInTransit = parseNonNegativeInteger(getCellValue(cells, "diseasedInTransit"), {
      required: false,
    });
    const parasite = parseNonNegativeInteger(getCellValue(cells, "parasite"), { required: false });
    const nonEmergence = parseNonNegativeInteger(getCellValue(cells, "nonEmergence"), {
      required: false,
    });
    const poorEmergence = parseNonNegativeInteger(getCellValue(cells, "poorEmergence"), {
      required: false,
    });

    if (!scientificName) {
      rowErrors.push(`Row ${rowNumber}: Species is required.`);
      continue;
    }

    if (!supplierCode) {
      rowErrors.push(`Row ${rowNumber}: Supplier is required.`);
      continue;
    }

    if (!shipmentDate) {
      rowErrors.push(`Row ${rowNumber}: Ship date is invalid.`);
      continue;
    }

    if (!arrivalDate) {
      rowErrors.push(`Row ${rowNumber}: Arrival date is invalid.`);
      continue;
    }

    if (numberReceived == null) {
      rowErrors.push(`Row ${rowNumber}: No. rec must be a non-negative integer.`);
      continue;
    }

    if (numberReceivedRaw.trim().length === 0) {
      warnings.push(`Row ${rowNumber}: No. rec was blank and defaulted to 0.`);
    }

    if (
      emergedInTransit == null ||
      damagedInTransit == null ||
      diseasedInTransit == null ||
      parasite == null ||
      nonEmergence == null ||
      poorEmergence == null
    ) {
      rowErrors.push(`Row ${rowNumber}: Transit and quality counts must be non-negative integers.`);
      continue;
    }

    const shipmentDateValue = new Date(shipmentDate).valueOf();
    const arrivalDateValue = new Date(arrivalDate).valueOf();
    const normalizedArrivalDate = arrivalDateValue < shipmentDateValue ? shipmentDate : arrivalDate;

    if (normalizedArrivalDate !== arrivalDate) {
      warnings.push(
        `Row ${rowNumber}: Arrival date was before shipment date and was normalized to shipment date.`,
      );
    }

    rows.push({
      rowNumber,
      scientificName,
      supplierCode,
      shipmentDate,
      arrivalDate: normalizedArrivalDate,
      numberReceived,
      emergedInTransit,
      damagedInTransit,
      diseasedInTransit,
      parasite,
      nonEmergence,
      poorEmergence,
    });
  }

  return { rows, rowErrors, warnings };
}

export function groupShipmentImportRows(rows: ParsedShipmentImportRow[]): ShipmentImportDraft[] {
  const groupedShipments = new Map<
    string,
    {
      supplier_code: string;
      shipment_date: string;
      arrival_date: string;
      items: Map<string, ShipmentImportDraftItem>;
    }
  >();

  for (const row of rows) {
    const key = `${row.supplierCode}|${row.shipmentDate}|${row.arrivalDate}`;
    const bucket = groupedShipments.get(key) ?? {
      supplier_code: row.supplierCode,
      shipment_date: row.shipmentDate,
      arrival_date: row.arrivalDate,
      items: new Map<string, ShipmentImportDraftItem>(),
    };

    const currentItem = bucket.items.get(row.scientificName) ?? {
      scientific_name: row.scientificName,
      number_received: 0,
      emerged_in_transit: 0,
      damaged_in_transit: 0,
      diseased_in_transit: 0,
      parasite: 0,
      non_emergence: 0,
      poor_emergence: 0,
    };

    currentItem.number_received += row.numberReceived;
    currentItem.emerged_in_transit += row.emergedInTransit;
    currentItem.damaged_in_transit += row.damagedInTransit;
    currentItem.diseased_in_transit += row.diseasedInTransit;
    currentItem.parasite += row.parasite;
    currentItem.non_emergence += row.nonEmergence;
    currentItem.poor_emergence += row.poorEmergence;

    bucket.items.set(row.scientificName, currentItem);
    groupedShipments.set(key, bucket);
  }

  return Array.from(groupedShipments.values()).map((shipment) => ({
    supplier_code: shipment.supplier_code,
    shipment_date: shipment.shipment_date,
    arrival_date: shipment.arrival_date,
    items: Array.from(shipment.items.values()),
  }));
}

// =============================================================================================
// Strict 13-column contract (Released / good_emergence aware)
//
// Entirely new, parallel to everything above. Nothing above is modified: the existing
// `parseShipmentImportRows`/`groupShipmentImportRows`/`detectShipmentImportHeaderKey` functions
// remain exactly as they were and are still what the (not-yet-updated) service layer calls.
// These new functions implement the finalized strict 13-column contract — exact header
// matching, required `No. rec`, blocking (not normalized) arrival-before-ship-date, tri-state
// Released parsing, accounting-bound validation, and mixed-duplicate-species-Released rejection.
// Wiring the service layer onto these functions is explicitly a later phase's work.
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
