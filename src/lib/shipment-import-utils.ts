/**
 * Shared types and pure utility functions for the shipment import/export flow.
 * No React dependencies — safe to use in both client components and server-side code.
 */

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
