/**
 * Phase 5B: tests for the downloadable validation-report CSV and blank XLSX template utilities.
 */

import {
  buildCanonicalXlsxTemplateBlob,
  buildCanonicalXlsxTemplateRows,
  buildValidationReportCsv,
  CANONICAL_SHIPMENT_IMPORT_HEADERS,
  suggestCorrectionForIssue,
} from "@/lib/shipment-import-utils";
import { validateHeaderRow, type ShipmentImportIssue } from "@/lib/shipment-import-parser";

// ---------------------------------------------------------------------------
// suggestCorrectionForIssue
// ---------------------------------------------------------------------------

describe("suggestCorrectionForIssue", () => {
  it("suggests adding the missing column for a missing-header issue", () => {
    const issue: ShipmentImportIssue = {
      rowNumber: null,
      field: "Released",
      value: null,
      message: 'Missing required column: "Released".',
    };
    expect(suggestCorrectionForIssue(issue)).toBe('Add a "Released" column to the header row.');
  });

  it("suggests removing the duplicate for a duplicate-header issue", () => {
    const issue: ShipmentImportIssue = {
      rowNumber: null,
      field: "Species",
      value: null,
      message: 'Duplicate column: "Species" appears 2 times.',
    };
    expect(suggestCorrectionForIssue(issue)).toBe(
      'Remove the duplicate "Species" column so it appears only once.',
    );
  });

  it("suggests renaming/removing for an unrecognized header", () => {
    const issue: ShipmentImportIssue = {
      rowNumber: null,
      field: null,
      value: "Extra Column",
      message: 'Unrecognized column "Extra Column" at position 14.',
    };
    expect(suggestCorrectionForIssue(issue)).toBe(
      "Rename or remove this column so every header matches the canonical list exactly.",
    );
  });

  it("suggests making a duplicate-species Released group consistent", () => {
    const issue: ShipmentImportIssue = {
      rowNumber: null,
      rowNumbers: [5, 9],
      field: "Released",
      value: null,
      message:
        'Species "danaus plexippus" in shipment EBN (2025-01-01 -> 2025-01-05) has mixed known and unknown Released values. Make every row\'s Released value either known or blank before importing this shipment.',
    };
    expect(suggestCorrectionForIssue(issue)).toBe(
      "Make every row for this species either all blank or all numeric Released.",
    );
  });

  it("suggests fixing an Arrival-before-Ship-date row", () => {
    const issue: ShipmentImportIssue = {
      rowNumber: 4,
      field: "Arrival date",
      value: "2024-01-01",
      message: "Arrival date must be on or after Ship date.",
    };
    expect(suggestCorrectionForIssue(issue)).toBe("Set Arrival date on or after Ship date.");
  });

  it("suggests resolving a Released-exceeds-bound row differently from a plain invalid Released row", () => {
    const boundIssue: ShipmentImportIssue = {
      rowNumber: 7,
      field: "Released",
      value: "9",
      message: "Released (9) plus total losses (2) cannot exceed No. rec (10).",
    };
    const invalidIssue: ShipmentImportIssue = {
      rowNumber: 8,
      field: "Released",
      value: "abc",
      message: "Released must be a non-negative integer or blank.",
    };
    expect(suggestCorrectionForIssue(boundIssue)).toMatch(/does not exceed No\. rec/);
    expect(suggestCorrectionForIssue(invalidIssue)).toMatch(/leave Released blank/);
  });

  it("suggests correcting an unresolved-species issue", () => {
    const issue: ShipmentImportIssue = {
      rowNumber: null,
      field: "Species",
      value: "unknown species",
      message:
        'Species "unknown species" is not in the catalog and cannot be auto-created for this request.',
    };
    expect(suggestCorrectionForIssue(issue)).toMatch(/auto-create/);
  });

  it("falls back to a generic suggestion for an unmapped field", () => {
    const issue: ShipmentImportIssue = {
      rowNumber: 3,
      field: null,
      value: null,
      message: "Total losses (12) cannot exceed No. rec (10).",
    };
    expect(suggestCorrectionForIssue(issue)).toMatch(/loss columns/);
  });
});

// ---------------------------------------------------------------------------
// buildValidationReportCsv
// ---------------------------------------------------------------------------

describe("buildValidationReportCsv", () => {
  it("builds the header row plus one data row per issue", () => {
    const csv = buildValidationReportCsv([
      { rowNumber: 2, field: "Species", value: "", message: "Species is required." },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Row(s),Field,Original Value,Reason,Suggested Correction");
    expect(lines[1]).toBe("2,Species,,Species is required.,Enter the species' scientific name.");
  });

  it("formats a header-level issue's row as 'Header', not a row number", () => {
    const csv = buildValidationReportCsv([
      {
        rowNumber: null,
        field: "Released",
        value: null,
        message: 'Missing required column: "Released".',
      },
    ]);
    const [, dataRow] = csv.split("\r\n");
    expect(dataRow.startsWith("Header,")).toBe(true);
  });

  it("joins multiple row numbers for a mixed-duplicate-species group issue", () => {
    const csv = buildValidationReportCsv([
      {
        rowNumber: null,
        rowNumbers: [5, 9, 12],
        field: "Released",
        value: null,
        message: "has mixed known and unknown Released values.",
      },
    ]);
    const [, dataRow] = csv.split("\r\n");
    // "5; 9; 12" contains no comma/quote/newline, so it is correctly left unquoted.
    expect(dataRow.startsWith("5; 9; 12,Released,,")).toBe(true);
  });

  it("escapes a field containing a comma, a quote, and a newline", () => {
    const csv = buildValidationReportCsv([
      {
        rowNumber: 3,
        field: "Species",
        value: 'danaus, "plexippus"\nmore text',
        message: "Species is required.",
      },
    ]);
    const [, dataRow] = csv.split("\r\n");
    // The raw value contains a comma, double quotes, and a newline — the whole field must be
    // wrapped in quotes with internal quotes doubled, and the embedded newline preserved inside
    // the quoted field (not treated as a new CSV row).
    expect(dataRow).toContain('"danaus, ""plexippus""\nmore text"');
    expect(csv.split("\r\n")).toHaveLength(2); // still exactly one header + one data row
  });

  it("guards a formula-like original value against spreadsheet formula injection", () => {
    const csv = buildValidationReportCsv([
      {
        rowNumber: 4,
        field: "Species",
        value: "=1+1",
        message: "Species is required.",
      },
    ]);
    const [, dataRow] = csv.split("\r\n");
    // A leading apostrophe forces plain-text interpretation in Excel/Sheets/LibreOffice.
    expect(dataRow).toContain("'=1+1");
    expect(dataRow).not.toContain(",=1+1,");
  });

  it("guards every documented formula-prefix character (=, +, -, @)", () => {
    for (const prefix of ["=", "+", "-", "@"]) {
      const csv = buildValidationReportCsv([
        { rowNumber: 1, field: "Species", value: `${prefix}cmd`, message: "x" },
      ]);
      expect(csv).toContain(`'${prefix}cmd`);
    }
  });

  it("remains generatable even when every row is a blocking issue (never requires an importable workbook)", () => {
    const csv = buildValidationReportCsv([
      { rowNumber: 1, field: "Species", value: "", message: "Species is required." },
      { rowNumber: 2, field: "Supplier", value: "", message: "Supplier is required." },
      {
        rowNumber: 3,
        field: "No. rec",
        value: "-1",
        message: "No. rec must be a non-negative integer.",
      },
    ]);
    expect(csv.split("\r\n")).toHaveLength(4); // header + 3 rows
  });

  it("produces only the header row for zero issues", () => {
    expect(buildValidationReportCsv([])).toBe(
      "Row(s),Field,Original Value,Reason,Suggested Correction",
    );
  });
});

// ---------------------------------------------------------------------------
// Blank XLSX template
// ---------------------------------------------------------------------------

describe("buildCanonicalXlsxTemplateRows", () => {
  it("contains exactly one row: the 13 canonical headers, in order, with no data rows", () => {
    const rows = buildCanonicalXlsxTemplateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(Array.from(CANONICAL_SHIPMENT_IMPORT_HEADERS));
  });
});

describe("buildCanonicalXlsxTemplateBlob", () => {
  it("produces a real, valid .xlsx file whose header row passes the strict validator", async () => {
    const blob = await buildCanonicalXlsxTemplateBlob();
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    const arrayBuffer = await blob.arrayBuffer();
    const xlsx = await import("xlsx");
    const workbook = xlsx.read(arrayBuffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<string[]>(firstSheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    expect(rows).toHaveLength(1); // header only — no example/sample data rows
    expect(rows[0]).toEqual(Array.from(CANONICAL_SHIPMENT_IMPORT_HEADERS));

    const { issues } = validateHeaderRow(rows[0]);
    expect(issues).toEqual([]);
  });
});
