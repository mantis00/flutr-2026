import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ROUTES } from "@/lib/routes";
import {
  detectSourceKind,
  filterRowsByDateRange,
  readUploadFileAsText,
  REVERSED_RANGE_ERROR,
  type CommitResponse,
  type PreviewResponse,
  type ShipmentSummaryRow,
  type SourceKind,
} from "@/lib/shipment-import-utils";
import { downloadBlob } from "@/lib/utils";

type ApiError = {
  error?: { message?: string };
};

// ---------------------------------------------------------------------------
// Pure year-by-year commit orchestration (Phase 5A)
//
// Deliberately React-free so it can be unit-tested directly, consistent with this repo's
// established convention (see `use-species-search.ts`) of testing a hook's logic as plain
// functions rather than rendering the hook itself. The hook below wires these to real
// `fetch`/`useState`/`useRef` calls; none of the control-flow decisions live only in a closure
// that a test can't reach.
// ---------------------------------------------------------------------------

export type YearImportStatus = "pending" | "importing" | "completed" | "failed" | "not_attempted";

export type YearProgress = {
  year: number;
  status: YearImportStatus;
  created: number;
  skipped: number;
  error?: string;
};

export type ShipmentImportOptions = {
  allow_species_autocreate: boolean;
  allow_duplicate_headers: boolean;
};

/** A preview is eligible to commit only when it exists, has zero blocking issues, and has at
 * least one Arrival year to commit. `row_errors` is the derived flat view of `issues` the server
 * already produces — reusing it here (rather than re-deriving from `issues`) matches the
 * review/plan's own stated design: "the existing `canCommit` mechanism is reusable as-is." */
export function canStartYearCommit(preview: PreviewResponse | null): boolean {
  return !!preview && preview.row_errors.length === 0 && preview.years.length > 0;
}

export function buildInitialYearProgress(years: number[]): YearProgress[] {
  return [...years]
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      status: "pending",
      created: 0,
      skipped: 0,
    }));
}

export function updateYearProgress(
  progress: YearProgress[],
  year: number,
  patch: Partial<YearProgress>,
): YearProgress[] {
  return progress.map((item) => (item.year === year ? { ...item, ...patch } : item));
}

export function markPendingAsNotAttempted(progress: YearProgress[]): YearProgress[] {
  return progress.map((item) =>
    item.status === "pending" ? { ...item, status: "not_attempted" } : item,
  );
}

/** Running totals across every year that has actually completed so far — only `completed` years
 * contribute; `pending`/`importing`/`failed`/`not_attempted` years contribute nothing yet. */
export function sumYearProgressTotals(progress: YearProgress[]): {
  created: number;
  skipped: number;
} {
  return progress.reduce(
    (totals, item) =>
      item.status === "completed"
        ? { created: totals.created + item.created, skipped: totals.skipped + item.skipped }
        : totals,
    { created: 0, skipped: 0 },
  );
}

/** Pure presentation-derived summary of a `YearProgress[]`, shared by the progress panel so its
 * overall-percentage/failed-year/all-completed logic is unit-testable without rendering anything. */
export function computeImportProgressSummary(progress: YearProgress[]): {
  total: number;
  completedCount: number;
  failedEntry: YearProgress | null;
  percent: number;
  allCompleted: boolean;
} {
  const total = progress.length;
  const completedCount = progress.filter((item) => item.status === "completed").length;
  const failedEntry = progress.find((item) => item.status === "failed") ?? null;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  // `total > 0` guards against vacuous truth for an empty/not-yet-started array.
  const allCompleted = total > 0 && completedCount === total && !failedEntry;
  return { total, completedCount, failedEntry, percent, allCompleted };
}

export function buildYearCommitRequestBody(
  rawText: string,
  previewHash: string,
  year: number,
  options: ShipmentImportOptions,
) {
  return { raw_text: rawText, preview_hash: previewHash, year, options };
}

export type YearCommitRequestBody = ReturnType<typeof buildYearCommitRequestBody>;

/** Runs one year's commit request. Resolving means success; throwing means failure — the
 * orchestrator below never distinguishes a network failure from a server error beyond that, per
 * the explicit instruction that a failed request must never be assumed to mean the server-side
 * transaction rolled back (it may have committed before the response was lost). */
export type YearCommitRunner = (body: YearCommitRequestBody) => Promise<CommitResponse>;

export type YearCommitRunResult = {
  progress: YearProgress[];
  completedCount: number;
  stoppedEarly: boolean;
  failedYear: number | null;
  failedMessage: string | null;
};

/**
 * Pure, React-free year-by-year commit orchestrator (Phase 5A core logic).
 *
 * Runs the given years in ascending order, one request at a time, awaiting each response before
 * starting the next. Stops at the first failure and marks every remaining `pending` year
 * `not_attempted` — earlier `completed` years are left exactly as they are, never retried or
 * rolled back client-side (the server already committed them in their own transaction). Checks
 * `shouldAbort()` before starting a year and again after every await, so a caller (the real hook)
 * can cooperatively cancel a stale run — e.g. the workbook changed — without this function
 * needing to know anything about React state or closures.
 */
export async function runYearByYearCommit({
  years,
  rawText,
  previewHash,
  options,
  runCommit,
  onProgress,
  shouldAbort,
}: {
  years: number[];
  rawText: string;
  previewHash: string;
  options: ShipmentImportOptions;
  runCommit: YearCommitRunner;
  onProgress: (progress: YearProgress[]) => void;
  shouldAbort: () => boolean;
}): Promise<YearCommitRunResult> {
  let progress = buildInitialYearProgress(years);
  onProgress(progress);

  let stoppedEarly = false;
  let completedCount = 0;
  let failedYear: number | null = null;
  let failedMessage: string | null = null;

  for (const year of progress.map((item) => item.year)) {
    if (shouldAbort()) {
      stoppedEarly = true;
      break;
    }

    progress = updateYearProgress(progress, year, { status: "importing" });
    onProgress(progress);

    let result: CommitResponse;
    try {
      result = await runCommit(buildYearCommitRequestBody(rawText, previewHash, year, options));
    } catch (error) {
      if (shouldAbort()) {
        stoppedEarly = true;
        break;
      }
      failedYear = year;
      failedMessage =
        error instanceof Error && error.message ? error.message : "Import failed for this year.";
      progress = updateYearProgress(progress, year, { status: "failed", error: failedMessage });
      onProgress(progress);
      stoppedEarly = true;
      break;
    }

    if (shouldAbort()) {
      stoppedEarly = true;
      break;
    }

    progress = updateYearProgress(progress, year, {
      status: "completed",
      created: result.created,
      skipped: result.skipped,
    });
    onProgress(progress);
    completedCount += 1;
  }

  if (stoppedEarly) {
    progress = markPendingAsNotAttempted(progress);
    onProgress(progress);
  }

  return { progress, completedCount, stoppedEarly, failedYear, failedMessage };
}

/**
 * A tiny, React-free guard against duplicate/concurrent commit runs and against a stale run
 * corrupting state after the workbook or options changed mid-run. `tryStart` returns `null` (and
 * leaves everything unchanged) if a run is already active — the duplicate-click/concurrent-call
 * guard. `invalidate` bumps the generation without starting a new run — called whenever the
 * workbook, paste text, or import options change, so any in-flight loop's `shouldAbort` check (via
 * `isCurrent`) sees a mismatch and stops cooperatively instead of applying a stale response to a
 * newly-selected workbook.
 */
export function createCommitRunGuard() {
  let generation = 0;
  let active = false;

  return {
    tryStart(): number | null {
      if (active) return null;
      active = true;
      generation += 1;
      return generation;
    },
    finish() {
      active = false;
    },
    invalidate() {
      generation += 1;
      active = false;
    },
    isCurrent(id: number): boolean {
      return id === generation;
    },
    get isActive() {
      return active;
    },
  };
}

/**
 * A tiny, React-free guard against a stale async response overwriting newer state. First added
 * for preview responses (manual QA finding: an in-flight "Parse preview" request can resolve
 * after the workbook, source, or `allow_species_autocreate` toggle has already changed — or
 * after a second "Parse preview" has already started — and would otherwise repopulate
 * `preview`/`errorMessage` with a result that no longer corresponds to the current intent), and
 * reused with its own separate instance for file-read responses (a dropped/selected file's read
 * can resolve after a newer file was selected, text was pasted, or the form was reset — the same
 * shape of problem, a different async operation). Unlike `createCommitRunGuard`, there is no
 * "active" concept to refuse a second start with: a new request is always allowed to start
 * (overlapping requests are not forbidden, only superseded), so `next()` always succeeds and
 * simply bumps the generation. `bump()` invalidates any in-flight request without starting a new
 * one — called by every action that changes what the in-flight request's result would mean — so
 * a response for an old generation is recognized as stale via `isCurrent` and discarded instead
 * of applied.
 */
export function createLatestRequestGuard() {
  let generation = 0;

  return {
    next(): number {
      generation += 1;
      return generation;
    },
    bump() {
      generation += 1;
    },
    isCurrent(id: number): boolean {
      return id === generation;
    },
  };
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

type UseShipmentImportParams = {
  previewUrl: string;
  commitUrl: string;
  isTenantMode: boolean;
  institutionId: number;
  tenantSlug: string | undefined;
  tenantHeaders: Record<string, string> | undefined;
  tenantReady: boolean;
  /** Rows from the viewer — used to derive the live export count. */
  shipmentRows: ShipmentSummaryRow[] | null;
  /** Called after a run commits at least one year, so the viewer can refresh. */
  onImportSuccess: () => void;
};

/**
 * Manages all import, file-reading, and export state for the shipment data tab.
 */
export function useShipmentImport({
  previewUrl,
  commitUrl,
  isTenantMode,
  institutionId,
  tenantSlug,
  tenantHeaders,
  tenantReady,
  shipmentRows,
  onImportSuccess,
}: UseShipmentImportParams) {
  // File / paste input state
  const [rawText, setRawText] = useState("");
  const [sourceKind, setSourceKind] = useState<SourceKind>("paste");
  const [sourceFileName, setSourceFileName] = useState<string | undefined>(undefined);
  const [isPasteMode, setIsPasteModeState] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Preview / commit state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [commitSummary, setCommitSummary] = useState<CommitResponse | null>(null);
  const [yearProgress, setYearProgress] = useState<YearProgress[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Import options
  const [allowSpeciesAutocreate, setAllowSpeciesAutocreateState] = useState(false);
  const [allowDuplicateHeaders, setAllowDuplicateHeadersState] = useState(false);

  // Export state
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Duplicate-run / stale-response guard (Phase 5A) — see `createCommitRunGuard` above.
  const runGuardRef = useRef(createCommitRunGuard());
  // Stale-preview-response guard — see `createLatestRequestGuard` above.
  const previewGuardRef = useRef(createLatestRequestGuard());
  // Stale-file-read-response guard — a separate instance of the same guard, tracking a
  // different async operation (reading a dropped/selected file) than `previewGuardRef` does.
  const fileReadGuardRef = useRef(createLatestRequestGuard());

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function processFile(file: File) {
    if (runGuardRef.current.isActive) return; // a commit run is in progress — ignore
    // Invalidates any in-flight preview; its eventual response is now stale and will be
    // discarded by `handleParsePreview`'s own `isCurrent` checks. `setIsParsing(false)` reflects
    // that fact immediately here too — otherwise, with no other preview started afterward, the
    // stale request's own (correctly skipped) `finally` would never clear it, leaving the
    // parsing indicator stuck on indefinitely.
    previewGuardRef.current.bump();
    setIsParsing(false);
    // Starting a new file read invalidates any older one the same way: `next()` makes this read
    // the current generation, so an older, still-in-flight read's eventual completion — success
    // or failure — is recognized as stale below and discarded instead of applied. This is what
    // actually closes the race (overlapping reads are allowed to proceed; only the latest one's
    // result is ever used), not a disabled drop zone.
    const requestId = fileReadGuardRef.current.next();
    const detected = detectSourceKind(file.name);
    setSourceKind(detected);
    setSourceFileName(file.name);
    setPreview(null);
    setCommitSummary(null);
    setYearProgress(null);
    setErrorMessage(null);
    // The raw setter, not the `setIsPasteMode` wrapper below — that wrapper itself bumps
    // `fileReadGuardRef`, which would immediately invalidate the `requestId` captured just above
    // for this very read.
    setIsPasteModeState(false);
    setIsReadingFile(true);
    try {
      const text = await readUploadFileAsText(file, detected);
      // Guarded: a stale successful read must never set `rawText` out from under a newer
      // selection/paste/reset — this is what would otherwise pair a newer file's displayed name
      // with an older file's content.
      if (fileReadGuardRef.current.isCurrent(requestId)) {
        setRawText(text);
      }
    } catch (error) {
      if (fileReadGuardRef.current.isCurrent(requestId)) {
        setErrorMessage(
          error instanceof Error && error.message ? error.message : "Unable to read file contents.",
        );
      }
    } finally {
      // Only the current generation may clear `isReadingFile` — if this read was superseded by a
      // newer one, that newer read owns the indicator and will clear it itself when it finishes;
      // clearing it here would show "not reading" while the real, current read is still in
      // flight.
      if (fileReadGuardRef.current.isCurrent(requestId)) {
        setIsReadingFile(false);
      }
    }
  }

  function handlePasteChange(text: string) {
    if (runGuardRef.current.isActive) return; // a commit run is in progress — ignore
    // See the comment in `processFile` above — bumping invalidates an in-flight preview, and
    // `setIsParsing(false)` must accompany it or the indicator can be left stuck on.
    previewGuardRef.current.bump();
    setIsParsing(false);
    // Switching to pasted text invalidates any in-flight file read the same way: without this,
    // a slow read that started before the user switched to typing/pasting could still resolve
    // afterward and silently overwrite what they just typed. `setIsReadingFile(false)` closes
    // the same "left stuck on" gap as above — nothing else would clear it otherwise, since the
    // invalidated read's own `finally` now correctly skips doing so.
    fileReadGuardRef.current.bump();
    setIsReadingFile(false);
    setRawText(text);
    setSourceKind("paste");
    setSourceFileName(undefined);
    setPreview(null);
    setCommitSummary(null);
    setYearProgress(null);
    setErrorMessage(null);
  }

  function handleReset() {
    if (runGuardRef.current.isActive) return; // a commit run is in progress — ignore
    // See the comments in `processFile`/`handlePasteChange` above.
    previewGuardRef.current.bump();
    setIsParsing(false);
    fileReadGuardRef.current.bump();
    setIsReadingFile(false);
    setRawText("");
    setSourceKind("paste");
    setSourceFileName(undefined);
    setPreview(null);
    setCommitSummary(null);
    setYearProgress(null);
    setErrorMessage(null);
    // The raw setter — this function already bumped `fileReadGuardRef` explicitly above.
    setIsPasteModeState(false);
  }

  /** Wraps the raw `isPasteMode` setter so switching to the paste textarea (even before typing
   * anything) also invalidates an in-flight file read — otherwise a slow read could still resolve
   * afterward and populate the now-visible paste textarea with the old file's content, since both
   * views are bound to the same `rawText` state. */
  function setIsPasteMode(value: boolean) {
    fileReadGuardRef.current.bump();
    setIsReadingFile(false);
    setIsPasteModeState(value);
  }

  function setAllowSpeciesAutocreate(value: boolean) {
    if (runGuardRef.current.isActive) return; // a commit run is in progress — ignore
    setAllowSpeciesAutocreateState(value);
    // Manual QA finding 1 fix: this toggle changes what preview itself will report (an
    // unresolved species blocks when it's off, is informational when it's on) — a preview
    // validated under the old value must not be treated as still valid for a commit that will
    // use the new one. Invalidating forces a fresh "Parse preview" against the new intent, the
    // same way changing the raw text or source already does. `bump()` additionally covers the
    // in-flight case: a preview request already sent under the old value must not be allowed to
    // resolve and silently repopulate `preview` after the toggle has since changed (the
    // in-flight-preview race found during manual QA follow-up). `setIsParsing(false)` closes a
    // further gap in that same fix: without it, an invalidated in-flight request's own `finally`
    // correctly skips clearing the indicator (it's no longer current), but nothing else ever
    // clears it either if no further preview is started — leaving it stuck on indefinitely.
    previewGuardRef.current.bump();
    setIsParsing(false);
    setPreview(null);
    setCommitSummary(null);
    setYearProgress(null);
  }

  function setAllowDuplicateHeaders(value: boolean) {
    if (runGuardRef.current.isActive) return; // a commit run is in progress — ignore
    setAllowDuplicateHeadersState(value);
  }

  async function handleParsePreview() {
    if (runGuardRef.current.isActive) return; // a commit run is in progress — ignore
    if (!tenantReady) {
      setErrorMessage("Tenant context is missing. Refresh and try again.");
      return;
    }
    if (!rawText.trim()) {
      setErrorMessage("Paste data or upload a file before parsing.");
      return;
    }
    // `next()` always succeeds (overlapping preview requests aren't forbidden, only superseded —
    // unlike the commit guard's `tryStart`, there is no "already active" refusal here) and makes
    // this the current generation, so a still-in-flight earlier request's response — and this
    // request's own response, once a newer action bumps or supersedes it — can be recognized as
    // stale below and discarded instead of applied.
    const requestId = previewGuardRef.current.next();
    setIsParsing(true);
    setPreview(null);
    setCommitSummary(null);
    setYearProgress(null);
    setErrorMessage(null);
    try {
      const response = await fetch(previewUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tenantHeaders },
        body: JSON.stringify({
          raw_text: rawText,
          source: { kind: sourceKind, file_name: sourceFileName },
          // Manual QA finding 1 fix: preview's own species-blocking decision now follows this
          // request's actual intent, not a static role-eligibility flag — so it must be sent at
          // preview time too, not only at commit (line ~450 below).
          allow_species_autocreate: allowSpeciesAutocreate,
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as ApiError | null;
        // Guarded: a stale failed response must never display an outdated error over whatever
        // state a newer action (a settings change, a new workbook, or a newer preview) has since
        // established.
        if (previewGuardRef.current.isCurrent(requestId)) {
          setErrorMessage(errorBody?.error?.message ?? "Unable to parse preview.");
        }
        return;
      }
      const data = (await response.json()) as PreviewResponse;
      // Guarded: a stale successful response must never restore a preview that was deliberately
      // cleared (or replaced by a newer, still-pending request) after this request was sent.
      if (previewGuardRef.current.isCurrent(requestId)) {
        setPreview(data);
      }
    } catch {
      if (previewGuardRef.current.isCurrent(requestId)) {
        setErrorMessage("Unable to parse preview.");
      }
    } finally {
      // Only the current generation may clear `isParsing` — if this request was superseded by a
      // newer, still-running preview, that newer call owns `isParsing` and will clear it itself
      // when it finishes; clearing it here would show "not parsing" while the real, current
      // request is still in flight.
      if (previewGuardRef.current.isCurrent(requestId)) {
        setIsParsing(false);
      }
    }
  }

  async function handleCommitImport() {
    if (!tenantReady) {
      setErrorMessage("Tenant context is missing. Refresh and try again.");
      return;
    }
    if (!canStartYearCommit(preview)) {
      setErrorMessage(
        !preview
          ? "Run parse preview before importing."
          : preview.years.length === 0
            ? "No Arrival years were found to import."
            : "Resolve every validation issue before committing.",
      );
      return;
    }

    const runId = runGuardRef.current.tryStart();
    if (runId === null) return; // duplicate click / concurrent call — ignore

    setIsImporting(true);
    setErrorMessage(null);
    setCommitSummary(null);
    setYearProgress(null);

    // Captured once, up front — every request resends this same text/hash unchanged, per the
    // approved architecture (the server re-derives and re-validates everything from these on
    // every call; nothing here is ever re-read from state mid-run, so a change to `rawText` after
    // this point cannot leak into an in-flight request even though the workbook-changing setters
    // above already block that from happening in the first place).
    const capturedRawText = rawText;
    const capturedPreviewHash = preview!.preview_hash;
    const capturedOptions: ShipmentImportOptions = {
      allow_species_autocreate: allowSpeciesAutocreate,
      allow_duplicate_headers: allowDuplicateHeaders,
    };
    const years = preview!.years;

    const runCommit: YearCommitRunner = async (body) => {
      const response = await fetch(commitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tenantHeaders },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as ApiError | null;
        throw new Error(errorBody?.error?.message ?? "Import failed for this year.");
      }
      return (await response.json()) as CommitResponse;
    };

    const result = await runYearByYearCommit({
      years,
      rawText: capturedRawText,
      previewHash: capturedPreviewHash,
      options: capturedOptions,
      runCommit,
      onProgress: setYearProgress,
      shouldAbort: () => !runGuardRef.current.isCurrent(runId),
    });

    if (!runGuardRef.current.isCurrent(runId)) {
      // Superseded by a newer run or a workbook/option change — that newer action already reset
      // every piece of state it cares about; do not touch anything further here.
      return;
    }

    const lastCompleted = result.progress.filter((item) => item.status === "completed").at(-1);
    if (lastCompleted) {
      setCommitSummary({
        year: lastCompleted.year,
        created: lastCompleted.created,
        skipped: lastCompleted.skipped,
        warnings: [],
      });
    }

    if (result.stoppedEarly) {
      setErrorMessage(
        result.failedYear != null
          ? `Import stopped: year ${result.failedYear} failed (${result.failedMessage ?? "unknown error"}). ` +
              "Already-completed years remain committed. Re-validate and retry to continue — " +
              "already-imported shipments are skipped automatically."
          : "Import was interrupted before any year could be attempted.",
      );
    }

    if (result.completedCount > 0) {
      onImportSuccess();
    }

    runGuardRef.current.finish();
    setIsImporting(false);
  }

  async function handleExportData() {
    if (!tenantReady) {
      setErrorMessage("Tenant context is missing. Refresh and try again.");
      return;
    }
    setErrorMessage(null);
    const range =
      exportFrom || exportTo
        ? { from: exportFrom || undefined, to: exportTo || undefined }
        : undefined;
    const currentExportUrl = isTenantMode
      ? ROUTES.tenant.shipmentExportApi("xlsx", range)
      : ROUTES.admin.institutionExportApi(institutionId, "xlsx", range);

    setIsExporting(true);
    try {
      const response = await fetch(currentExportUrl, { method: "GET", headers: tenantHeaders });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as ApiError | null;
        setErrorMessage(errorBody?.error?.message ?? "Unable to export data.");
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const fileNameMatch = disposition?.match(/filename="?([^";]+)"?/i);
      const fileName =
        fileNameMatch?.[1] ??
        (isTenantMode
          ? `${tenantSlug ?? "institution"}-shipments.xlsx`
          : `institution-${institutionId}-shipments.xlsx`);
      downloadBlob(blob, fileName);
      toast.success("Export downloaded.");
    } catch {
      setErrorMessage("Unable to export data.");
    } finally {
      setIsExporting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const canCommit = canStartYearCommit(preview);

  const yearRunningTotals = useMemo(
    () => (yearProgress ? sumYearProgressTotals(yearProgress) : null),
    [yearProgress],
  );

  const exportRangeError =
    exportFrom && exportTo && exportFrom > exportTo ? REVERSED_RANGE_ERROR : null;

  const rangeShipmentCount = useMemo(() => {
    if (!shipmentRows) return null;
    if (!exportFrom && !exportTo) return shipmentRows.length;
    return filterRowsByDateRange(shipmentRows, exportFrom, exportTo).length;
  }, [shipmentRows, exportFrom, exportTo]);

  const importStep: 1 | 2 | 3 = commitSummary ? 3 : rawText.trim() ? 2 : 1;

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // Drop zone
    rawText,
    sourceFileName,
    processFile,
    isReadingFile,
    isPasteMode,
    setIsPasteMode,
    handlePasteChange,
    // Results panel
    preview,
    commitSummary,
    yearProgress,
    yearRunningTotals,
    handleReset,
    // Action buttons
    handleParsePreview,
    handleCommitImport,
    isParsing,
    isImporting,
    canCommit,
    errorMessage,
    // Step indicator
    importStep,
    // Import options (sidebar)
    allowSpeciesAutocreate,
    setAllowSpeciesAutocreate,
    allowDuplicateHeaders,
    setAllowDuplicateHeaders,
    // Export (sidebar)
    exportFrom,
    setExportFrom,
    exportTo,
    setExportTo,
    exportRangeError,
    handleExportData,
    isExporting,
    rangeShipmentCount,
  };
}
