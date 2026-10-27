import {
  dateOnlyToUtcDate,
  extractDateOnly,
  formatDateOnlyForDisplay,
  isDateOnlyString,
} from "@/lib/date-only";

describe("date-only helpers", () => {
  it.each(["2026-09-09", "2026-10-01", "2027-01-01"])(
    "converts %s to the same UTC calendar date",
    (value) => {
      expect(dateOnlyToUtcDate(value).toISOString()).toBe(`${value}T00:00:00.000Z`);
    },
  );

  it("rejects invalid calendar dates", () => {
    expect(isDateOnlyString("2026-02-30")).toBe(false);
    expect(isDateOnlyString("2026-13-01")).toBe(false);
    expect(isDateOnlyString("not-a-date")).toBe(false);
  });

  it.each(["2026-09-09", "2027-01-01", "2028-02-29"])(
    "accepts the valid date-only input %s",
    (value) => {
      expect(extractDateOnly(value)).toBe(value);
    },
  );

  it.each([
    ["2026-09-09T00:00:00.000Z", "2026-09-09"],
    ["2026-09-09T23:59:59Z", "2026-09-09"],
    ["2026-09-09T12:30:15.123456+05:30", "2026-09-09"],
    ["2027-01-01T00:00:00+14:00", "2027-01-01"],
    ["2026-09-09T23:59:59-12:00", "2026-09-09"],
  ])("extracts the written calendar date from ISO timestamp %s", (value, expected) => {
    expect(extractDateOnly(value)).toBe(expected);
  });

  it.each([
    "2026-09-09-garbage",
    "abc2026-09-09",
    "2026-9-9",
    "2026-09-09whatever",
    "2026-09-09\n",
    "2026-02-30",
    "2026-02-30T00:00:00.000Z",
    "2026-09-09T00:00:00.000Z-garbage",
    "2026-09-09T00:00:00.000Z\n",
    "2026-09-09T24:00:00Z",
    "2026-09-09T00:60:00Z",
    "2026-09-09T00:00:60Z",
    "2026-09-09T00:00:00+24:00",
    "2026-09-09T00:00:00+00:60",
    "2026-09-09T00:00:00",
  ])("rejects unsupported or malformed input %j", (value) => {
    expect(extractDateOnly(value)).toBeNull();
  });

  it.each([
    ["2026-09-09", "Sep 09, 2026"],
    ["2026-10-01", "Oct 01, 2026"],
    ["2027-01-01", "Jan 01, 2027"],
  ])("formats %s without local timezone drift", (value, expected) => {
    expect(formatDateOnlyForDisplay(value)).toBe(expected);
    expect(formatDateOnlyForDisplay(`${value}T00:00:00.000Z`)).toBe(expected);
  });
});
