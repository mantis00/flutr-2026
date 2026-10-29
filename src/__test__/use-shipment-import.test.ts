/**
 * Phase 5A: tests for the pure, React-free year-by-year commit orchestration exported alongside
 * `useShipmentImport`. Following this repo's established convention (see `use-species-search.ts`'s
 * own tests) of testing a hook's logic as plain functions rather than rendering the hook itself —
 * `@testing-library/react` isn't installed in this project and isn't introduced for this.
 */

import {
  buildInitialYearProgress,
  buildYearCommitRequestBody,
  canStartYearCommit,
  computeImportProgressSummary,
  createCommitRunGuard,
  markPendingAsNotAttempted,
  runYearByYearCommit,
  sumYearProgressTotals,
  updateYearProgress,
  type YearProgress,
} from "@/hooks/use-shipment-import";
import type { CommitResponse, PreviewResponse } from "@/lib/shipment-import-utils";

function buildPreview(overrides: Partial<PreviewResponse> = {}): PreviewResponse {
  return {
    summary: {
      total_rows: 1,
      shipments_detected: 1,
      row_errors: 0,
      warnings: 0,
      unknown_species: 0,
      unknown_suppliers: 0,
    },
    row_errors: [],
    warnings: [],
    unknown_species: [],
    unknown_suppliers: [],
    issues: [],
    existing_shipments: [],
    years: [2024, 2025],
    preview_hash: `sha256:${"a".repeat(64)}`,
    ...overrides,
  };
}

const OPTIONS = { allow_species_autocreate: false, allow_duplicate_headers: false };

function commitOf(year: number, created: number, skipped: number): CommitResponse {
  return { year, created, skipped, warnings: [] };
}

// ---------------------------------------------------------------------------
// canStartYearCommit — "No commits when preview validation has errors"
// ---------------------------------------------------------------------------

describe("canStartYearCommit", () => {
  it("is false when there is no preview yet", () => {
    expect(canStartYearCommit(null)).toBe(false);
  });

  it("is false when the preview has blocking row_errors", () => {
    expect(canStartYearCommit(buildPreview({ row_errors: ["Row 2: Species is required."] }))).toBe(
      false,
    );
  });

  it("is false when the preview has no years", () => {
    expect(canStartYearCommit(buildPreview({ years: [] }))).toBe(false);
  });

  it("is true for a clean preview with at least one year", () => {
    expect(canStartYearCommit(buildPreview())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildYearCommitRequestBody — "Every commit request contains the original raw_text and hash"
// ---------------------------------------------------------------------------

describe("buildYearCommitRequestBody", () => {
  it("carries the exact raw_text, preview_hash, year, and options given to it", () => {
    const body = buildYearCommitRequestBody("raw workbook text", "sha256:abc", 2025, OPTIONS);
    expect(body).toEqual({
      raw_text: "raw workbook text",
      preview_hash: "sha256:abc",
      year: 2025,
      options: OPTIONS,
    });
  });
});

// ---------------------------------------------------------------------------
// Pure progress-array helpers
// ---------------------------------------------------------------------------

describe("buildInitialYearProgress / updateYearProgress / markPendingAsNotAttempted", () => {
  it("builds one pending entry per year, sorted ascending regardless of input order", () => {
    expect(buildInitialYearProgress([2025, 2002, 2013])).toEqual([
      { year: 2002, status: "pending", created: 0, skipped: 0 },
      { year: 2013, status: "pending", created: 0, skipped: 0 },
      { year: 2025, status: "pending", created: 0, skipped: 0 },
    ]);
  });

  it("updates only the targeted year, leaving every other entry untouched", () => {
    const initial = buildInitialYearProgress([2024, 2025]);
    const updated = updateYearProgress(initial, 2024, { status: "completed", created: 5 });
    expect(updated).toEqual([
      { year: 2024, status: "completed", created: 5, skipped: 0 },
      { year: 2025, status: "pending", created: 0, skipped: 0 },
    ]);
  });

  it("converts only pending entries to not_attempted, leaving completed/failed alone", () => {
    const progress: YearProgress[] = [
      { year: 2024, status: "completed", created: 1, skipped: 0 },
      { year: 2025, status: "failed", created: 0, skipped: 0, error: "boom" },
      { year: 2026, status: "pending", created: 0, skipped: 0 },
    ];
    expect(markPendingAsNotAttempted(progress)).toEqual([
      { year: 2024, status: "completed", created: 1, skipped: 0 },
      { year: 2025, status: "failed", created: 0, skipped: 0, error: "boom" },
      { year: 2026, status: "not_attempted", created: 0, skipped: 0 },
    ]);
  });
});

describe("sumYearProgressTotals", () => {
  it("sums created/skipped only across completed years", () => {
    const progress: YearProgress[] = [
      { year: 2024, status: "completed", created: 10, skipped: 2 },
      { year: 2025, status: "importing", created: 0, skipped: 0 },
      { year: 2026, status: "not_attempted", created: 0, skipped: 0 },
    ];
    expect(sumYearProgressTotals(progress)).toEqual({ created: 10, skipped: 2 });
  });
});

describe("computeImportProgressSummary", () => {
  it("computes percent, completed count, and allCompleted for a fully successful run", () => {
    const progress: YearProgress[] = [
      { year: 2024, status: "completed", created: 1, skipped: 0 },
      { year: 2025, status: "completed", created: 0, skipped: 3 }, // an all-skipped year
    ];
    expect(computeImportProgressSummary(progress)).toEqual({
      total: 2,
      completedCount: 2,
      failedEntry: null,
      percent: 100,
      allCompleted: true,
    });
  });

  it("identifies the failed entry and reports allCompleted: false when a year failed", () => {
    const progress: YearProgress[] = [
      { year: 2002, status: "completed", created: 1, skipped: 0 },
      { year: 2010, status: "failed", created: 0, skipped: 0, error: "boom" },
      { year: 2020, status: "not_attempted", created: 0, skipped: 0 },
    ];
    const summary = computeImportProgressSummary(progress);
    expect(summary.failedEntry).toEqual({
      year: 2010,
      status: "failed",
      created: 0,
      skipped: 0,
      error: "boom",
    });
    expect(summary.completedCount).toBe(1);
    expect(summary.percent).toBe(33);
    expect(summary.allCompleted).toBe(false);
  });

  it("reports 0 percent and allCompleted: false for an empty/not-yet-started progress array", () => {
    expect(computeImportProgressSummary([])).toEqual({
      total: 0,
      completedCount: 0,
      failedEntry: null,
      percent: 0,
      allCompleted: false,
    });
  });
});

// ---------------------------------------------------------------------------
// runYearByYearCommit — the core orchestration logic
// ---------------------------------------------------------------------------

describe("runYearByYearCommit", () => {
  it("processes years in ascending order, one request at a time, each resending the original raw_text and hash", async () => {
    const callOrder: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const requestBodies: unknown[] = [];

    const runCommit = jest.fn(async (body) => {
      requestBodies.push(body);
      callOrder.push(body.year);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve(); // yield, so a buggy implementation firing all requests at once would show it
      inFlight -= 1;
      return commitOf(body.year, 1, 0);
    });

    const result = await runYearByYearCommit({
      years: [2025, 2002, 2013], // deliberately out of order — the function must still sort
      rawText: "raw workbook text",
      previewHash: "sha256:abc",
      options: OPTIONS,
      runCommit,
      onProgress: () => {},
      shouldAbort: () => false,
    });

    expect(callOrder).toEqual([2002, 2013, 2025]);
    expect(maxInFlight).toBe(1); // never more than one request in flight at once
    expect(requestBodies).toEqual([
      { raw_text: "raw workbook text", preview_hash: "sha256:abc", year: 2002, options: OPTIONS },
      { raw_text: "raw workbook text", preview_hash: "sha256:abc", year: 2013, options: OPTIONS },
      { raw_text: "raw workbook text", preview_hash: "sha256:abc", year: 2025, options: OPTIONS },
    ]);
    expect(result.stoppedEarly).toBe(false);
    expect(result.completedCount).toBe(3);
  });

  it("reports progress and running totals correctly as each year completes, including an all-skipped year as a success", async () => {
    const progressSnapshots: YearProgress[][] = [];
    const runCommit = jest.fn(async (body) =>
      body.year === 2024 ? commitOf(2024, 0, 5) /* all-skipped */ : commitOf(body.year, 3, 0),
    );

    const result = await runYearByYearCommit({
      years: [2024, 2025],
      rawText: "raw",
      previewHash: "sha256:abc",
      options: OPTIONS,
      runCommit,
      onProgress: (progress) => progressSnapshots.push(progress),
      shouldAbort: () => false,
    });

    expect(result.stoppedEarly).toBe(false);
    expect(result.progress).toEqual([
      { year: 2024, status: "completed", created: 0, skipped: 5 },
      { year: 2025, status: "completed", created: 3, skipped: 0 },
    ]);
    expect(sumYearProgressTotals(result.progress)).toEqual({ created: 3, skipped: 5 });

    // The all-skipped year is reported "completed", never "failed" — a successful completion.
    const year2024Snapshots = progressSnapshots.flatMap((snap) =>
      snap.filter((item) => item.year === 2024),
    );
    expect(year2024Snapshots.at(-1)?.status).toBe("completed");
  });

  it("stops at the first failed year, preserves earlier completed years, and marks later years not_attempted", async () => {
    const runCommit = jest.fn(async (body) => {
      if (body.year === 2010) throw new Error("accounting bound violated");
      return commitOf(body.year, 1, 0);
    });

    const result = await runYearByYearCommit({
      years: [2002, 2010, 2020],
      rawText: "raw",
      previewHash: "sha256:abc",
      options: OPTIONS,
      runCommit,
      onProgress: () => {},
      shouldAbort: () => false,
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.failedYear).toBe(2010);
    expect(result.failedMessage).toBe("accounting bound violated");
    expect(result.completedCount).toBe(1);
    expect(result.progress).toEqual([
      { year: 2002, status: "completed", created: 1, skipped: 0 },
      { year: 2010, status: "failed", created: 0, skipped: 0, error: "accounting bound violated" },
      { year: 2020, status: "not_attempted", created: 0, skipped: 0 },
    ]);
    // 2020 was never attempted at all.
    expect(runCommit).toHaveBeenCalledTimes(2);
  });

  it("treats an unexpected network-style rejection the same as any other failure — never assumes it means a rollback", async () => {
    const networkError = new TypeError("Failed to fetch");
    const runCommit = jest.fn(async (body) => {
      if (body.year === 2015) throw networkError;
      return commitOf(body.year, 1, 0);
    });

    const result = await runYearByYearCommit({
      years: [2014, 2015, 2016],
      rawText: "raw",
      previewHash: "sha256:abc",
      options: OPTIONS,
      runCommit,
      onProgress: () => {},
      shouldAbort: () => false,
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.failedYear).toBe(2015);
    expect(result.failedMessage).toBe("Failed to fetch");
    // 2014 (already committed on the server before the network failure) is left exactly as
    // "completed" — the orchestrator never retries or rolls anything back client-side.
    expect(result.progress[0]).toEqual({ year: 2014, status: "completed", created: 1, skipped: 0 });
    expect(result.progress[2].status).toBe("not_attempted");
  });

  it("stops immediately when shouldAbort is already true, without calling runCommit", async () => {
    const runCommit = jest.fn(async (body) => commitOf(body.year, 1, 0));

    const result = await runYearByYearCommit({
      years: [2024, 2025],
      rawText: "raw",
      previewHash: "sha256:abc",
      options: OPTIONS,
      runCommit,
      onProgress: () => {},
      shouldAbort: () => true,
    });

    expect(runCommit).not.toHaveBeenCalled();
    expect(result.stoppedEarly).toBe(true);
    expect(result.progress.every((item) => item.status === "not_attempted")).toBe(true);
  });

  it("a revalidation-required retry simply reruns every year from scratch (no client-only resume token) — already-committed years are reported again and rely on server-side skip", async () => {
    // Simulates: year 2024 already committed on an earlier run; the caller retries the whole
    // sequence (the only supported retry path — there is no partial/resume request shape). The
    // server would skip the already-existing shipment; here the fake just proves the orchestrator
    // itself re-issues every year unconditionally, inventing no resume state of its own.
    const runCommit = jest.fn(async (body) =>
      body.year === 2024
        ? commitOf(2024, 0, 1) /* skipped, already existed */
        : commitOf(body.year, 2, 0),
    );

    const result = await runYearByYearCommit({
      years: [2024, 2025],
      rawText: "raw",
      previewHash: "sha256:abc",
      options: OPTIONS,
      runCommit,
      onProgress: () => {},
      shouldAbort: () => false,
    });

    expect(runCommit).toHaveBeenCalledWith(expect.objectContaining({ year: 2024 }));
    expect(result.progress[0]).toEqual({ year: 2024, status: "completed", created: 0, skipped: 1 });
    expect(result.stoppedEarly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createCommitRunGuard — duplicate-click protection and stale-run invalidation
// ---------------------------------------------------------------------------

describe("createCommitRunGuard", () => {
  it("refuses a second concurrent start while a run is active (duplicate-click protection)", () => {
    const guard = createCommitRunGuard();
    const first = guard.tryStart();
    expect(first).not.toBeNull();

    const second = guard.tryStart();
    expect(second).toBeNull(); // the duplicate click is ignored, not a second run
  });

  it("allows a new run to start again after finish()", () => {
    const guard = createCommitRunGuard();
    const first = guard.tryStart();
    guard.finish();

    const second = guard.tryStart();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("invalidate() changes the generation so a stale in-flight run's isCurrent check fails (workbook/option change mid-run)", () => {
    const guard = createCommitRunGuard();
    const runId = guard.tryStart()!;
    expect(guard.isCurrent(runId)).toBe(true);

    guard.invalidate(); // e.g. the user changed the pasted workbook text mid-run
    expect(guard.isCurrent(runId)).toBe(false);
  });

  it("invalidate() also clears the active flag, so a new run can start immediately", () => {
    const guard = createCommitRunGuard();
    guard.tryStart();
    guard.invalidate();
    expect(guard.isActive).toBe(false);
    expect(guard.tryStart()).not.toBeNull();
  });

  it("drives runYearByYearCommit's shouldAbort: a run invalidated mid-sequence stops cleanly without corrupting later state", async () => {
    const guard = createCommitRunGuard();
    const runId = guard.tryStart()!;

    const runCommit = jest.fn(async (body) => {
      if (body.year === 2010) guard.invalidate(); // simulate a workbook change arriving mid-request
      return commitOf(body.year, 1, 0);
    });

    const result = await runYearByYearCommit({
      years: [2002, 2010, 2020],
      rawText: "raw",
      previewHash: "sha256:abc",
      options: OPTIONS,
      runCommit,
      onProgress: () => {},
      shouldAbort: () => !guard.isCurrent(runId),
    });

    expect(result.stoppedEarly).toBe(true);
    // 2020 is never even attempted once the run is invalidated after 2010's response lands.
    expect(runCommit).toHaveBeenCalledTimes(2);
  });
});
