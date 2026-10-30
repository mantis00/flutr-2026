/**
 * Shared types and pure utility functions for the shipment import/export flow.
 * No React dependencies — safe to use in both client components and server-side code.
 */

import type { ShipmentImportIssue } from "@/lib/shipment-import-parser";
import type {
  ShipmentImportCommitResponse,
  ShipmentImportPreviewResponse,
} from "@/lib/validation/shipment-import";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type SourceKind = "xlsx" | "xls" | "csv" | "tsv" | "txt" | "paste";

/**
 * The 13 canonical historical shipment import/export column headers, in the documented order.
 * Single source of truth shared by strict header validation, XLSX export, and the blank
 * template download — keeps all three from drifting apart.
 */
export const CANONICAL_SHIPMENT_IMPORT_HEADERS = [
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
  "Released",
] as const;

export type ShipmentSummaryRow = {
  id: number;
  supplierCode: string;
  shipmentDate: string;
  arrivalDate: string;
  itemCount: number;
  totalReceived: number;
};

export type PreviewResponse = ShipmentImportPreviewResponse;

export type CommitResponse = ShipmentImportCommitResponse;

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const REVERSED_RANGE_ERROR = "'From' date must not be after 'To' date";

/** Infer the source kind from a file extension. */
export function detectSourceKind(fileName: string): SourceKind {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".tsv")) return "tsv";
  if (lower.endsWith(".txt")) return "txt";
  return "txt";
}

/** Serialise a 2-D cell array (from an XLSX sheet) to tab-delimited text. */
export function rowsToTabDelimitedText(
  rows: Array<Array<string | number | boolean | null>>,
): string {
  return rows.map((row) => row.map((cell) => String(cell ?? "").trim()).join("\t")).join("\n");
}

/** Read an uploaded file to a plain text string, handling XLSX/XLS via the `xlsx` library. */
export async function readUploadFileAsText(file: File, kind: SourceKind): Promise<string> {
  if (kind === "xlsx" || kind === "xls") {
    const xlsx = await import("xlsx");
    const workbook = xlsx.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Workbook does not contain any sheets.");
    }

    const firstSheet = workbook.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json<Array<string | number | boolean | null>>(firstSheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    return rowsToTabDelimitedText(rows);
  }

  return file.text();
}

/**
 * Format a date string (ISO or YYYY-MM-DD) for display.
 * Uses UTC to prevent date-shifting from timezone offsets.
 */
export function formatShipmentDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Extract the 4-digit year from a date string. */
export function extractYear(dateStr: string): number {
  return new Date(dateStr).getUTCFullYear();
}

/**
 * Filter rows to those whose `shipmentDate` falls within [from, to].
 * Either bound may be omitted (empty string = no bound on that side).
 */
export function filterRowsByDateRange<T extends { shipmentDate: string }>(
  rows: T[],
  from: string,
  to: string,
): T[] {
  return rows.filter((row) => {
    const date = row.shipmentDate.slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Downloadable validation report (Phase 5B)
// ---------------------------------------------------------------------------

/**
 * Short, deterministic, field/message-pattern-based correction hint for one validation issue.
 * Best-effort guidance, not an exhaustive per-row fix — the `message` column already carries the
 * full, specific explanation the parser produced; this is a plain-language "what to do about it"
 * companion for institution staff who aren't reading the detailed message closely.
 */
export function suggestCorrectionForIssue(issue: ShipmentImportIssue): string {
  const { field, message } = issue;

  if (message.startsWith("Missing required column")) {
    return `Add a "${field}" column to the header row.`;
  }
  if (message.startsWith("Duplicate column")) {
    return `Remove the duplicate "${field}" column so it appears only once.`;
  }
  if (message.startsWith("Unrecognized column")) {
    return "Rename or remove this column so every header matches the canonical list exactly.";
  }
  if (message.includes("has mixed known and unknown Released values")) {
    return "Make every row for this species either all blank or all numeric Released.";
  }
  if (field === "Species" && message.includes("not in the catalog")) {
    return "Correct the species name, or request species auto-create (platform import only).";
  }

  switch (field) {
    case "Species":
      return "Enter the species' scientific name.";
    case "Supplier":
      return "Enter a supplier code.";
    case "Ship date":
      return "Enter a valid calendar date.";
    case "Arrival date":
      return message.includes("on or after")
        ? "Set Arrival date on or after Ship date."
        : "Enter a valid calendar date.";
    case "No. rec":
      return "Enter a non-negative whole number.";
    case "Emerg. in transit":
    case "Damag in transit":
    case "No. disea":
    case "No. parasit":
    case "No emerg":
    case "Poor emerg":
      return "Enter a non-negative whole number, or leave blank for 0.";
    case "Released":
      return message.includes("exceed")
        ? "Reduce Released (or the loss columns) so Released plus total losses does not exceed No. rec."
        : "Enter a non-negative whole number, or leave Released blank if unknown.";
    default:
      if (message.includes("Total losses") && message.includes("cannot exceed No. rec")) {
        return "Reduce the loss columns so their total does not exceed No. rec.";
      }
      return "Review and correct this row.";
  }
}

function formatIssueRowNumbers(issue: ShipmentImportIssue): string {
  if (issue.rowNumbers?.length) return issue.rowNumbers.join("; ");
  if (issue.rowNumber != null) return String(issue.rowNumber);
  return "Header";
}

/** Leading characters that, if a CSV cell starts with one, a spreadsheet app may interpret as the
 * start of a formula — mitigated by prefixing the cell with a leading apostrophe, which forces
 * plain-text interpretation without altering the visible, meaningful content. */
const FORMULA_INJECTION_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function guardAgainstFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;
}

function escapeCsvField(value: string): string {
  const guarded = guardAgainstFormulaInjection(value);
  if (!/[",\n\r]/.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Builds a downloadable CSV report directly from the structured `issues` array — never by
 * re-parsing the human-readable `row_errors` strings, per this phase's explicit requirement.
 * Every cell is escaped for CSV syntax (commas, quotes, line breaks) and guarded against
 * spreadsheet formula injection from untrusted original cell values. Works identically whether
 * the workbook has 1 issue or blocks every shipment — there is nothing here that requires a
 * successful/importable preview.
 */
export function buildValidationReportCsv(issues: ShipmentImportIssue[]): string {
  const header = ["Row(s)", "Field", "Original Value", "Reason", "Suggested Correction"];
  const rows = issues.map((issue) => [
    formatIssueRowNumbers(issue),
    issue.field ?? "(header)",
    issue.value ?? "",
    issue.message,
    suggestCorrectionForIssue(issue),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

// ---------------------------------------------------------------------------
// Blank import template (Phase 5B)
// ---------------------------------------------------------------------------

/** The blank template's only content: one header row, the 13 canonical columns, no data rows —
 * exported separately from the Blob-producing function below so the exact cell values are
 * trivially unit-testable without needing the `xlsx` library or a `Blob` at all. */
export function buildCanonicalXlsxTemplateRows(): string[][] {
  return [Array.from(CANONICAL_SHIPMENT_IMPORT_HEADERS)];
}

/** Builds a real, valid, blank .xlsx workbook containing only the canonical 13-column header row
 * — no example/sample data rows. Uses the same `xlsx` library the application already depends on
 * (dynamically imported, matching `readUploadFileAsText`'s existing client-side usage above). */
export async function buildCanonicalXlsxTemplateBlob(): Promise<Blob> {
  const xlsx = await import("xlsx");
  const worksheet = xlsx.utils.aoa_to_sheet(buildCanonicalXlsxTemplateRows());
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Shipments");
  const arrayBuffer = xlsx.write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  }) as ArrayBuffer;
  return new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
