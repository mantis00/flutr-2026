import {
  dateOnlyToUtcDate,
  extractDateOnly,
  formatDateOnlyForDisplay,
  isDateOnlyString,
  utcTodayDateOnly,
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

describe("utcTodayDateOnly", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns a valid date-only string", () => {
    expect(isDateOnlyString(utcTodayDateOnly())).toBe(true);
  });

  it("returns the UTC calendar day at an instant where Australia/Brisbane (fixed UTC+10) is already a day ahead (PR #155 reproduction)", () => {
    // The reviewer's exact scenario: local 08:00 Nov 23 in a fixed UTC+10
    // zone is 22:00 UTC Nov 22 — the pre-fix client, which read the host's
    // *local* calendar day instead of UTC, would have returned "2026-11-23"
    // here and been rejected by the server's UTC-anchored bound as a future
    // date. `toISOString()` is UTC by spec regardless of host timezone, so
    // this instant alone is sufficient to prove the fix — it does not
    // require (and this Jest/V8 setup does not reliably honor) mutating
    // `process.env.TZ` mid-test; see the changelog for a real `TZ=`-at-
    // invocation cross-check performed separately as additional verification.
    jest.useFakeTimers().setSystemTime(new Date("2026-11-22T22:00:00.000Z"));
    expect(utcTodayDateOnly()).toBe("2026-11-22");
  });

  it("returns the UTC calendar day at an instant where Pacific/Honolulu (fixed UTC-10) is still a day behind", () => {
    // Mirror case: local 14:30 Nov 21 in a fixed UTC-10 zone is 00:30 UTC
    // Nov 22. This direction was already safe pre-fix (a local day that
    // lags UTC never exceeds the server's UTC bound), but is included so
    // both offset directions from the review are covered explicitly.
    jest.useFakeTimers().setSystemTime(new Date("2026-11-22T00:30:00.000Z"));
    expect(utcTodayDateOnly()).toBe("2026-11-22");
  });

  it("flips to the next UTC calendar day exactly at UTC midnight", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-21T23:59:59.999Z"));
    expect(utcTodayDateOnly()).toBe("2026-11-21");

    jest.setSystemTime(new Date("2026-11-22T00:00:00.000Z"));
    expect(utcTodayDateOnly()).toBe("2026-11-22");
  });

  it("round-trips through dateOnlyToUtcDate to exact UTC midnight", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-22T15:00:00.000Z"));
    expect(dateOnlyToUtcDate(utcTodayDateOnly()).toISOString()).toBe("2026-11-22T00:00:00.000Z");
  });

  it("agrees with itself across repeated calls at the same instant (Event date default/maxDate consistency)", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-11-22T15:00:00.000Z"));
    expect(utcTodayDateOnly()).toBe(utcTodayDateOnly());
  });
});
