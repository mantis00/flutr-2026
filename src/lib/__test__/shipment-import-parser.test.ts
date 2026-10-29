import {
  CANONICAL_HEADER_LABEL_BY_KEY,
  formatShipmentImportIssue,
  groupShipmentImportRowsStrict,
  parseExcelDateToIso,
  parseReleasedQuantity,
  parseShipmentImportRowsStrict,
  POSTGRES_INTEGER_MAX,
  splitDelimitedLine,
  validateHeaderRow,
} from "@/lib/shipment-import-parser";
import { CANONICAL_SHIPMENT_IMPORT_HEADERS } from "@/lib/shipment-import-utils";

const VALID_HEADER_ROW =
  "Species\tCommon name\tNo. rec\tSupplier\tShip date\tArrival date\tEmerg. in transit\tDamag in transit\tNo. disea\tNo. parasit\tNo emerg\tPoor emerg\tReleased";

type StrictRowFields = {
  species: string;
  commonName: string;
  noRec: string;
  supplier: string;
  shipDate: string;
  arrivalDate: string;
  emerg: string;
  damag: string;
  disea: string;
  parasit: string;
  noEmerg: string;
  poorEmerg: string;
  released: string;
};

const DEFAULT_STRICT_ROW: StrictRowFields = {
  species: "Caligo atreus",
  commonName: "Owl Butterfly",
  noRec: "10",
  supplier: "EBN",
  shipDate: "2025-12-09",
  arrivalDate: "2025-12-11",
  emerg: "0",
  damag: "0",
  disea: "0",
  parasit: "0",
  noEmerg: "0",
  poorEmerg: "0",
  released: "9",
};

/** Builds a full, valid 13-column tab-delimited data row with sensible defaults, overridable per field. */
function buildStrictRow(overrides: Partial<StrictRowFields> = {}) {
  const row = { ...DEFAULT_STRICT_ROW, ...overrides };
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
  ].join("\t");
}

describe("shipment-import-parser", () => {
  describe("splitDelimitedLine", () => {
    it("supports quoted delimiters", () => {
      const cells = splitDelimitedLine('"A, value",B,C', ",");
      expect(cells).toEqual(["A, value", "B", "C"]);
    });
  });

  describe("parseExcelDateToIso", () => {
    it("parses excel serial dates", () => {
      const iso = parseExcelDateToIso("46013");
      expect(iso).toBeTruthy();
      expect(iso?.slice(0, 10)).toBe("2025-12-22");
    });

    it("parses m/d/yy", () => {
      const iso = parseExcelDateToIso("12/9/25");
      expect(iso?.slice(0, 10)).toBe("2025-12-09");
    });

    it("returns null for invalid date", () => {
      expect(parseExcelDateToIso("13/99/2025")).toBeNull();
    });
  });

  describe("CANONICAL_HEADER_LABEL_BY_KEY", () => {
    it("agrees with CANONICAL_SHIPMENT_IMPORT_HEADERS (same labels, same order)", () => {
      const labelsInKeyOrder = Object.values(CANONICAL_HEADER_LABEL_BY_KEY);
      expect(labelsInKeyOrder).toEqual([...CANONICAL_SHIPMENT_IMPORT_HEADERS]);
    });
  });

  describe("validateHeaderRow", () => {
    it("accepts all 13 canonical headers in any order, case-insensitive and trimmed", () => {
      const shuffled = [
        " RELEASED ",
        "species",
        "COMMON NAME",
        "no. rec",
        "supplier",
        "ship date",
        "arrival date",
        "emerg. in transit",
        "damag in transit",
        "no. disea",
        "no. parasit",
        "no emerg",
        "poor emerg",
      ];
      const { issues, indices } = validateHeaderRow(shuffled);
      expect(issues).toHaveLength(0);
      expect(indices.released).toBe(0);
      expect(indices.species).toBe(1);
    });

    it("reports every missing required header together, not just the first", () => {
      const { issues } = validateHeaderRow(["Species", "Supplier"]);
      const messages = issues.map((issue) => issue.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          'Missing required column: "Common name".',
          'Missing required column: "No. rec".',
          'Missing required column: "Ship date".',
          'Missing required column: "Arrival date".',
          'Missing required column: "Released".',
        ]),
      );
      expect(issues.length).toBeGreaterThanOrEqual(11);
    });

    it("reports a duplicated canonical header by name and count", () => {
      const headers = [...CANONICAL_SHIPMENT_IMPORT_HEADERS, "Species"];
      const { issues } = validateHeaderRow(headers);
      expect(issues).toContainEqual(
        expect.objectContaining({ message: 'Duplicate column: "Species" appears 2 times.' }),
      );
    });

    it("reports an unrecognized extra column by its literal text and position", () => {
      const headers = [...CANONICAL_SHIPMENT_IMPORT_HEADERS, "Notes"];
      const { issues } = validateHeaderRow(headers);
      expect(issues).toContainEqual(
        expect.objectContaining({
          message: 'Unrecognized column header "Notes" at position 14.',
        }),
      );
    });

    it("reports missing, duplicate, and unrecognized problems together in one pass", () => {
      const headers = ["Species", "Species", "Notes"];
      const { issues } = validateHeaderRow(headers);
      const messages = issues.map((issue) => issue.message);
      expect(messages).toContain('Duplicate column: "Species" appears 2 times.');
      expect(messages).toContain('Unrecognized column header "Notes" at position 3.');
      expect(messages).toContain('Missing required column: "Supplier".');
    });

    it("does not fuzzy-match a header lacking the canonical punctuation", () => {
      // "No disea" (no period) was a supported alias for the OLD fuzzy detector; the strict
      // validator must not accept it in place of the canonical "No. disea".
      const headers = CANONICAL_SHIPMENT_IMPORT_HEADERS.map((h) =>
        h === "No. disea" ? "No disea" : h,
      );
      const { issues } = validateHeaderRow(headers);
      const messages = issues.map((issue) => issue.message);
      expect(messages).toContain('Missing required column: "No. disea".');
      expect(messages).toContain('Unrecognized column header "No disea" at position 9.');
    });
  });

  describe("parseReleasedQuantity", () => {
    it("treats a blank cell as unknown, not zero", () => {
      expect(parseReleasedQuantity("")).toEqual({ kind: "unknown" });
      expect(parseReleasedQuantity("   ")).toEqual({ kind: "unknown" });
    });

    it("treats an explicit zero as a known value, distinct from unknown", () => {
      expect(parseReleasedQuantity("0")).toEqual({ kind: "value", value: 0 });
    });

    it("parses a positive integer", () => {
      expect(parseReleasedQuantity("42")).toEqual({ kind: "value", value: 42 });
    });

    it("rejects a negative value", () => {
      expect(parseReleasedQuantity("-1")).toEqual({ kind: "invalid" });
    });

    it("rejects a fractional value", () => {
      expect(parseReleasedQuantity("1.5")).toEqual({ kind: "invalid" });
    });

    it("rejects non-numeric text", () => {
      expect(parseReleasedQuantity("unknown")).toEqual({ kind: "invalid" });
    });
  });

  describe("parseShipmentImportRowsStrict", () => {
    it("returns every missing-header issue together and parses no rows", () => {
      const result = parseShipmentImportRowsStrict(["Species\tSupplier", "x\ty"].join("\n"));
      expect(result.rows).toHaveLength(0);
      expect(result.issues.length).toBeGreaterThan(1);
    });

    it("parses a fully valid row with a known positive Released value", () => {
      const input = [VALID_HEADER_ROW, buildStrictRow()].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.goodEmergence).toBe(9);
    });

    it("parses an explicit numeric zero Released as known zero, not unknown", () => {
      const input = [VALID_HEADER_ROW, buildStrictRow({ released: "0" })].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors).toHaveLength(0);
      expect(result.rows[0]?.goodEmergence).toBe(0);
    });

    it("parses a blank Released cell as unknown (null), with no warning", () => {
      const input = [VALID_HEADER_ROW, buildStrictRow({ released: "" })].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors).toHaveLength(0);
      expect(result.rows[0]?.goodEmergence).toBeNull();
    });

    it("rejects an invalid Released value as a blocking issue", () => {
      const input = [VALID_HEADER_ROW, buildStrictRow({ released: "-5" })].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("Released must be a non-negative integer or blank");
    });

    it("blocks a blank No. rec cell instead of defaulting it to 0", () => {
      const input = [VALID_HEADER_ROW, buildStrictRow({ noRec: "" })].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("No. rec is required");
    });

    it("blocks Arrival date before Ship date instead of normalizing it", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ shipDate: "2025-12-11", arrivalDate: "2025-12-09" }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("Arrival date must be on or after Ship date");
    });

    it("blocks when total losses exceed Received", () => {
      const input = [VALID_HEADER_ROW, buildStrictRow({ noRec: "5", disea: "6" })].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("Total losses (6) cannot exceed No. rec (5)");
    });

    it("blocks when numeric Released plus total losses exceed Received", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: "10", disea: "5", released: "6" }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain(
        "Released (6) plus total losses (5) cannot exceed No. rec (10)",
      );
    });

    it("accepts Released plus total losses exactly equal to Received", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: "10", disea: "4", released: "6" }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors).toHaveLength(0);
      expect(result.rows[0]?.goodEmergence).toBe(6);
    });

    it("supports a tracked row with Remaining greater than zero (synthetic — no real fixture has one)", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: "100", disea: "10", released: "70" }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors).toHaveLength(0);
      const row = result.rows[0]!;
      const remaining = row.numberReceived - row.diseasedInTransit - (row.goodEmergence ?? 0);
      expect(remaining).toBe(20);
    });

    it("collects issues across multiple invalid rows instead of stopping at the first", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ released: "-1" }),
        buildStrictRow({ noRec: "" }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]?.rowNumber).toBe(2);
      expect(result.issues[1]?.rowNumber).toBe(3);
    });

    // -------------------------------------------------------------------------------------------
    // Integer upper-bound validation (hardening checkpoint, review section 15.2)
    // -------------------------------------------------------------------------------------------

    it("accepts No. rec at exactly the PostgreSQL integer maximum", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: String(POSTGRES_INTEGER_MAX), disea: "0", released: "" }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors).toHaveLength(0);
      expect(result.rows[0]?.numberReceived).toBe(POSTGRES_INTEGER_MAX);
    });

    it("blocks No. rec at the PostgreSQL integer maximum plus one, naming the exact offending row", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: String(POSTGRES_INTEGER_MAX + 1), disea: "0", released: "" }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.issues[0]?.rowNumber).toBe(2);
      expect(result.issues[0]?.field).toBe("No. rec");
      expect(result.rowErrors[0]).toContain(
        `exceeds the maximum allowed value (${POSTGRES_INTEGER_MAX})`,
      );
    });

    it("blocks a single oversized loss column even when No. rec itself is in bounds", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({
          noRec: String(POSTGRES_INTEGER_MAX),
          disea: String(POSTGRES_INTEGER_MAX + 1),
          released: "",
        }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.issues[0]?.field).toBe("No. disea");
      expect(result.rowErrors[0]).toContain(
        `No. disea (${POSTGRES_INTEGER_MAX + 1}) exceeds the maximum allowed value`,
      );
    });

    it("accepts Released at exactly the PostgreSQL integer maximum when No. rec matches", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({
          noRec: String(POSTGRES_INTEGER_MAX),
          disea: "0",
          released: String(POSTGRES_INTEGER_MAX),
        }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors).toHaveLength(0);
      expect(result.rows[0]?.goodEmergence).toBe(POSTGRES_INTEGER_MAX);
    });

    it("blocks Released at the PostgreSQL integer maximum plus one", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({
          noRec: String(POSTGRES_INTEGER_MAX),
          disea: "0",
          released: String(POSTGRES_INTEGER_MAX + 1),
        }),
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rows).toHaveLength(0);
      expect(result.issues[0]?.field).toBe("Released");
      expect(result.rowErrors[0]).toContain(
        `exceeds the maximum allowed value (${POSTGRES_INTEGER_MAX})`,
      );
    });

    it("still rejects negative and non-numeric values for No. rec and Released after adding the upper bound (no regression)", () => {
      const negativeNoRec = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ noRec: "-1", released: "" })].join("\n"),
      );
      expect(negativeNoRec.rowErrors[0]).toContain("No. rec must be a non-negative integer");

      const nonNumericNoRec = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ noRec: "abc", released: "" })].join("\n"),
      );
      expect(nonNumericNoRec.rowErrors[0]).toContain("No. rec must be a non-negative integer");

      const negativeReleased = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ released: "-1" })].join("\n"),
      );
      expect(negativeReleased.rowErrors[0]).toContain(
        "Released must be a non-negative integer or blank",
      );

      // parseReleasedQuantity (unlike No. rec's parseNonNegativeInteger) explicitly rejects a
      // fractional value rather than silently truncating it — confirmed pre-existing, unrelated
      // to this hardening checkpoint; exercised here only to confirm it still holds.
      const fractionalReleased = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ released: "1.5" })].join("\n"),
      );
      expect(fractionalReleased.rowErrors[0]).toContain(
        "Released must be a non-negative integer or blank",
      );
    });

    it("still parses blank Released as unknown and explicit zero as known zero after adding the upper bound (no regression)", () => {
      const blank = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ released: "" })].join("\n"),
      );
      expect(blank.rows[0]?.goodEmergence).toBeNull();

      const zero = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ released: "0" })].join("\n"),
      );
      expect(zero.rows[0]?.goodEmergence).toBe(0);
    });
  });

  describe("groupShipmentImportRowsStrict", () => {
    it("sums Released across duplicate-species rows when every value is known", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: "10", released: "6" }),
        buildStrictRow({ noRec: "5", released: "3" }),
      ].join("\n");
      const parsed = parseShipmentImportRowsStrict(input);
      expect(parsed.rowErrors).toHaveLength(0);

      const grouped = groupShipmentImportRowsStrict(parsed.rows);
      expect(grouped.issues).toHaveLength(0);
      expect(grouped.drafts).toHaveLength(1);
      expect(grouped.drafts[0]?.items).toHaveLength(1);
      expect(grouped.drafts[0]?.items[0]?.good_emergence).toBe(9);
      expect(grouped.drafts[0]?.items[0]?.number_received).toBe(15);
    });

    it("aggregates Released to null when every duplicate-species row is blank", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ released: "" }),
        buildStrictRow({ released: "" }),
      ].join("\n");
      const parsed = parseShipmentImportRowsStrict(input);
      const grouped = groupShipmentImportRowsStrict(parsed.rows);
      expect(grouped.issues).toHaveLength(0);
      expect(grouped.drafts[0]?.items[0]?.good_emergence).toBeNull();
    });

    it("blocks a shipment whose duplicate-species rows have mixed known/unknown Released, naming every contributing row", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ released: "6" }),
        buildStrictRow({ released: "" }),
      ].join("\n");
      const parsed = parseShipmentImportRowsStrict(input);
      expect(parsed.rowErrors).toHaveLength(0);

      const grouped = groupShipmentImportRowsStrict(parsed.rows);
      expect(grouped.drafts).toHaveLength(0);
      expect(grouped.issues).toHaveLength(1);
      expect(grouped.issues[0]?.rowNumbers).toEqual([2, 3]);
      expect(grouped.issues[0]?.message).toContain("mixed known and unknown Released values");
      expect(grouped.rowErrors[0]).toContain("Rows 2, 3:");
    });

    it("does not let a mixed-group conflict in one shipment block an unrelated shipment", () => {
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ released: "6" }),
        buildStrictRow({ released: "" }),
        buildStrictRow({ supplier: "LPS", species: "Heliconius erato", released: "4" }),
      ].join("\n");
      const parsed = parseShipmentImportRowsStrict(input);
      const grouped = groupShipmentImportRowsStrict(parsed.rows);
      expect(grouped.drafts).toHaveLength(1);
      expect(grouped.drafts[0]?.supplier_code).toBe("LPS");
      expect(grouped.issues).toHaveLength(1);
    });

    // -------------------------------------------------------------------------------------------
    // Post-grouping aggregate bound check (hardening checkpoint, review section 15.2): two
    // individually in-bounds rows can still overflow once summed for the same shipment+species key.
    // -------------------------------------------------------------------------------------------

    it("blocks two individually-valid rows whose grouped No. rec sum exceeds the PostgreSQL integer maximum, naming both rows", () => {
      const half = Math.floor(POSTGRES_INTEGER_MAX / 2) + 1; // two of these overflow; neither alone does
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: String(half), disea: "0", released: "" }),
        buildStrictRow({ noRec: String(half), disea: "0", released: "" }),
      ].join("\n");
      const parsed = parseShipmentImportRowsStrict(input);
      expect(parsed.rowErrors).toHaveLength(0); // neither individual row is out of bounds

      const grouped = groupShipmentImportRowsStrict(parsed.rows);
      expect(grouped.drafts).toHaveLength(0); // the whole shipment is excluded
      expect(grouped.issues).toHaveLength(1);
      expect(grouped.issues[0]?.field).toBe("No. rec");
      expect(grouped.issues[0]?.rowNumbers).toEqual([2, 3]); // both contributing rows named
      expect(grouped.issues[0]?.message).toContain("exceeds the maximum allowed value");
    });

    it("blocks two individually-valid rows whose grouped Released sum exceeds the PostgreSQL integer maximum", () => {
      const half = Math.floor(POSTGRES_INTEGER_MAX / 2) + 1;
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: String(half), disea: "0", released: String(half) }),
        buildStrictRow({ noRec: String(half), disea: "0", released: String(half) }),
      ].join("\n");
      const parsed = parseShipmentImportRowsStrict(input);
      expect(parsed.rowErrors).toHaveLength(0);

      const grouped = groupShipmentImportRowsStrict(parsed.rows);
      expect(grouped.drafts).toHaveLength(0);
      // Both No. rec and Released overflow for this group — both are reported.
      const fields = grouped.issues.map((issue) => issue.field);
      expect(fields).toContain("Released");
      for (const issue of grouped.issues) {
        expect(issue.rowNumbers).toEqual([2, 3]);
      }
    });

    it("does not block a grouped sum that stays within the PostgreSQL integer maximum", () => {
      const quarter = Math.floor(POSTGRES_INTEGER_MAX / 4);
      const input = [
        VALID_HEADER_ROW,
        buildStrictRow({ noRec: String(quarter), disea: "0", released: "" }),
        buildStrictRow({ noRec: String(quarter), disea: "0", released: "" }),
      ].join("\n");
      const parsed = parseShipmentImportRowsStrict(input);
      const grouped = groupShipmentImportRowsStrict(parsed.rows);
      expect(grouped.issues).toHaveLength(0);
      expect(grouped.drafts).toHaveLength(1);
      expect(grouped.drafts[0]?.items[0]?.number_received).toBe(quarter * 2);
    });
  });

  describe("formatShipmentImportIssue", () => {
    it("formats a single-row issue", () => {
      expect(
        formatShipmentImportIssue({ rowNumber: 5, field: "Released", value: "-1", message: "bad" }),
      ).toBe("Row 5: bad");
    });

    it("formats a multi-row issue", () => {
      expect(
        formatShipmentImportIssue({
          rowNumber: null,
          rowNumbers: [2, 3],
          field: null,
          value: null,
          message: "bad",
        }),
      ).toBe("Rows 2, 3: bad");
    });

    it("formats a header-level issue with no row reference", () => {
      expect(
        formatShipmentImportIssue({ rowNumber: null, field: null, value: null, message: "bad" }),
      ).toBe("bad");
    });
  });
});
