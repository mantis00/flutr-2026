import {
  CANONICAL_HEADER_LABEL_BY_KEY,
  formatShipmentImportIssue,
  groupShipmentImportRowsStrict,
  parseExcelDateToIso,
  parseNonNegativeInteger,
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

    it("still accepts a comma-grouped integer (no regression)", () => {
      expect(parseReleasedQuantity("12,345")).toEqual({ kind: "value", value: 12345 });
    });

    it("rejects malformed comma grouping (shares the grouping check with parseNonNegativeInteger)", () => {
      expect(parseReleasedQuantity("1,2")).toEqual({ kind: "invalid" });
      expect(parseReleasedQuantity("1,00")).toEqual({ kind: "invalid" });
      expect(parseReleasedQuantity(",1")).toEqual({ kind: "invalid" });
      expect(parseReleasedQuantity("1,,0")).toEqual({ kind: "invalid" });
    });

    it("accepts leading-zero values (regression: the round-trip check used to reject these)", () => {
      expect(parseReleasedQuantity("00")).toEqual({ kind: "value", value: 0 });
      expect(parseReleasedQuantity("007")).toEqual({ kind: "value", value: 7 });
      expect(parseReleasedQuantity("0010")).toEqual({ kind: "value", value: 10 });
    });

    it("still accepts a value at the edge of JS's safe-integer range", () => {
      expect(parseReleasedQuantity("9007199254740991")).toEqual({
        kind: "value",
        value: 9007199254740991,
      });
    });

    it("rejects a value one past MAX_SAFE_INTEGER even though it round-trips exactly (regression)", () => {
      expect(parseReleasedQuantity("9007199254740992")).toEqual({ kind: "invalid" });
      expect(parseReleasedQuantity("09007199254740992")).toEqual({ kind: "invalid" });
      expect(parseReleasedQuantity("9,007,199,254,740,992")).toEqual({ kind: "invalid" });
    });

    it("still rejects a precision-losing value past the safe-integer range", () => {
      expect(parseReleasedQuantity("9007199254740993")).toEqual({ kind: "invalid" });
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

      const fractionalReleased = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ released: "1.5" })].join("\n"),
      );
      expect(fractionalReleased.rowErrors[0]).toContain(
        "Released must be a non-negative integer or blank",
      );
    });

    describe("parseNonNegativeInteger (direct unit tests)", () => {
      it("rejects a digit-prefixed value instead of silently truncating it", () => {
        expect(parseNonNegativeInteger("10abc", { required: true })).toBeNull();
      });

      it("rejects a fractional value instead of silently truncating it", () => {
        expect(parseNonNegativeInteger("5.7", { required: true })).toBeNull();
      });

      it("rejects exponent notation instead of silently truncating it", () => {
        expect(parseNonNegativeInteger("1e5", { required: true })).toBeNull();
      });

      it("rejects trailing whitespace-then-garbage", () => {
        expect(parseNonNegativeInteger(" 5x ", { required: true })).toBeNull();
      });

      it("still accepts a comma-grouped integer (no regression)", () => {
        expect(parseNonNegativeInteger("1,000", { required: true })).toBe(1000);
      });

      it("still accepts a multi-group comma-grouped integer (no regression)", () => {
        expect(parseNonNegativeInteger("12,345,678", { required: true })).toBe(12345678);
      });

      it("still accepts a plain, ungrouped integer longer than three digits (no regression)", () => {
        expect(parseNonNegativeInteger("1234", { required: true })).toBe(1234);
      });

      it("rejects a comma in the wrong position (not a thousands boundary)", () => {
        expect(parseNonNegativeInteger("1,2", { required: true })).toBeNull();
      });

      it("rejects a grouped segment with fewer than three digits", () => {
        expect(parseNonNegativeInteger("1,00", { required: true })).toBeNull();
      });

      it("rejects a leading comma", () => {
        expect(parseNonNegativeInteger(",1", { required: true })).toBeNull();
      });

      it("rejects a doubled comma", () => {
        expect(parseNonNegativeInteger("1,,0", { required: true })).toBeNull();
      });

      it("accepts leading-zero values (regression: the round-trip check used to reject these)", () => {
        expect(parseNonNegativeInteger("0", { required: true })).toBe(0);
        expect(parseNonNegativeInteger("00", { required: true })).toBe(0);
        expect(parseNonNegativeInteger("007", { required: true })).toBe(7);
        expect(parseNonNegativeInteger("0010", { required: true })).toBe(10);
      });

      it("still rejects a value too large to survive JS integer precision, leading zeros or not", () => {
        expect(parseNonNegativeInteger("99999999999999999999", { required: true })).toBeNull();
        expect(parseNonNegativeInteger("09007199254740993", { required: true })).toBeNull();
      });

      it("still accepts a value at the edge of JS's safe-integer range", () => {
        expect(parseNonNegativeInteger("9007199254740991", { required: true })).toBe(
          9007199254740991,
        );
      });

      it("rejects a value one past MAX_SAFE_INTEGER even though it round-trips exactly (regression)", () => {
        // 2**53 is still exactly representable as a float, so the string round-trip check alone
        // can't catch it — only Number.isSafeInteger bounds it correctly.
        expect(parseNonNegativeInteger("9007199254740992", { required: true })).toBeNull();
        expect(parseNonNegativeInteger("09007199254740992", { required: true })).toBeNull();
        expect(parseNonNegativeInteger("9,007,199,254,740,992", { required: true })).toBeNull();
      });

      it("still rejects a negative value", () => {
        expect(parseNonNegativeInteger("-5", { required: true })).toBeNull();
      });

      it("still defaults a blank, non-required value to 0", () => {
        expect(parseNonNegativeInteger("", { required: false })).toBe(0);
      });

      it("still treats a blank, required value as missing (null)", () => {
        expect(parseNonNegativeInteger("", { required: true })).toBeNull();
      });
    });

    it("blocks a malformed No. rec value (digit-prefixed garbage) instead of silently truncating it", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ noRec: "10abc" })].join("\n"),
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("No. rec must be a non-negative integer");
    });

    it("blocks a malformed No. rec value (fractional) instead of silently truncating it", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ noRec: "5.7" })].join("\n"),
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("No. rec must be a non-negative integer");
    });

    it("blocks a malformed loss-column value (digit-prefixed garbage) instead of silently truncating it", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ emerg: "2abc" })].join("\n"),
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("Emerg. in transit must be a non-negative integer");
    });

    it("blocks a malformed loss-column value (exponent notation) instead of silently truncating it", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ poorEmerg: "1e2" })].join("\n"),
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("Poor emerg must be a non-negative integer");
    });

    it("blocks a malformed comma-grouped No. rec value instead of silently reinterpreting it", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ noRec: "1,2" })].join("\n"),
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("No. rec must be a non-negative integer");
    });

    it("blocks a malformed comma-grouped loss-column value instead of silently reinterpreting it", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ emerg: "1,00" })].join("\n"),
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("Emerg. in transit must be a non-negative integer");
    });

    it("blocks a malformed comma-grouped Released value instead of silently reinterpreting it", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ released: ",1" })].join("\n"),
      );
      expect(result.rows).toHaveLength(0);
      expect(result.rowErrors[0]).toContain("Released must be a non-negative integer or blank");
    });

    it("accepts a properly thousands-grouped No. rec value (no regression)", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ noRec: "1,234", released: "1,000" })].join("\n"),
      );
      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]?.numberReceived).toBe(1234);
      expect(result.rows[0]?.goodEmergence).toBe(1000);
    });

    it("accepts a leading-zero No. rec value instead of rejecting it as malformed (regression)", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ noRec: "007", released: "7" })].join("\n"),
      );
      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]?.numberReceived).toBe(7);
    });

    it("accepts a leading-zero loss-column value instead of rejecting it as malformed (regression)", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ emerg: "00" })].join("\n"),
      );
      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]?.emergedInTransit).toBe(0);
    });

    it("accepts a leading-zero Released value instead of rejecting it as malformed (regression)", () => {
      const result = parseShipmentImportRowsStrict(
        [VALID_HEADER_ROW, buildStrictRow({ released: "0010" })].join("\n"),
      );
      expect(result.rowErrors).toEqual([]);
      expect(result.rows[0]?.goodEmergence).toBe(10);
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

  describe("blank-row handling (row-number integrity)", () => {
    it("reports the correct worksheet row number for a row after a blank line", () => {
      const input = [
        VALID_HEADER_ROW, // row 1
        buildStrictRow(), // row 2, valid
        "", // row 3, blank
        buildStrictRow({ species: "" }), // row 4, invalid
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors[0]).toContain("Row 4:");
    });

    it("keeps every subsequent row number correct across multiple scattered blank lines", () => {
      const input = [
        VALID_HEADER_ROW, // row 1
        "", // row 2, blank
        buildStrictRow(), // row 3, valid
        "", // row 4, blank
        "", // row 5, blank
        buildStrictRow({ species: "" }), // row 6, invalid
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors[0]).toContain("Row 6:");
    });

    it("detects the header correctly and reports the correct row number when a blank line precedes the header", () => {
      const input = [
        "", // row 1, blank
        VALID_HEADER_ROW, // row 2
        buildStrictRow({ species: "" }), // row 3, invalid
      ].join("\n");
      const result = parseShipmentImportRowsStrict(input);
      expect(
        result.issues.some((issue) => issue.message.startsWith("Missing required column")),
      ).toBe(false);
      expect(result.rowErrors[0]).toContain("Row 3:");
    });

    it("handles Windows line endings with a blank line the same way", () => {
      const input = [VALID_HEADER_ROW, buildStrictRow(), "", buildStrictRow({ species: "" })].join(
        "\r\n",
      );
      const result = parseShipmentImportRowsStrict(input);
      expect(result.rowErrors[0]).toContain("Row 4:");
    });

    it("still requires a header and at least one data row when extra blank lines are present", () => {
      const result = parseShipmentImportRowsStrict(["", VALID_HEADER_ROW, "", ""].join("\n"));
      expect(result.issues[0]?.message).toBe("Provide a header row and at least one data row.");
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
