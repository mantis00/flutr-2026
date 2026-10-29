"use client";

import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type CommitResponse, type PreviewResponse } from "@/lib/shipment-import-utils";
import { computeImportProgressSummary, type YearProgress } from "@/hooks/use-shipment-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportResultsPanelProps = {
  preview: PreviewResponse | null;
  commitSummary: CommitResponse | null;
  yearProgress: YearProgress[] | null;
  yearRunningTotals: { created: number; skipped: number } | null;
  isImporting: boolean;
  onReset: () => void;
};

const STATUS_LABEL: Record<YearProgress["status"], string> = {
  pending: "Pending",
  importing: "Importing",
  completed: "Completed",
  failed: "Failed",
  not_attempted: "Not attempted",
};

const STATUS_BADGE_VARIANT: Record<
  YearProgress["status"],
  "secondary" | "default" | "destructive" | "outline"
> = {
  pending: "outline",
  importing: "default",
  completed: "secondary",
  failed: "destructive",
  not_attempted: "outline",
};

function YearStatusIcon({ status }: { status: YearProgress["status"] }) {
  switch (status) {
    case "importing":
      return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
    case "completed":
      return <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden="true" />;
    case "failed":
      return <XCircle className="text-destructive size-3.5" aria-hidden="true" />;
    case "not_attempted":
      return <MinusCircle className="text-muted-foreground size-3.5" aria-hidden="true" />;
    default:
      return <Circle className="text-muted-foreground size-3.5" aria-hidden="true" />;
  }
}

/**
 * Year-by-year import progress (Phase 5B) — renders the Phase 5A hook's `yearProgress`/
 * `yearRunningTotals` state. Never implies this runs as a background job: it reflects exactly
 * what the client-side loop has observed so far, and the copy below is explicit that closing or
 * refreshing the page stops the sequence, and that re-validating and retrying (relying on
 * server-side existing-shipment skipping) is the supported recovery path — never a claim that a
 * failed request means the server-side transaction didn't commit.
 */
function ImportProgressSection({
  yearProgress,
  yearRunningTotals,
}: {
  yearProgress: YearProgress[];
  yearRunningTotals: { created: number; skipped: number } | null;
}) {
  const { total, completedCount, failedEntry, percent, allCompleted } =
    computeImportProgressSummary(yearProgress);

  return (
    <div className="space-y-3 rounded-md border p-4" aria-labelledby="import-progress-heading">
      <div className="flex items-center justify-between">
        <p id="import-progress-heading" className="text-sm font-medium">
          Import Progress
        </p>
        <span className="text-muted-foreground text-xs tabular-nums">
          {completedCount} of {total} year{total !== 1 ? "s" : ""} completed
        </span>
      </div>

      <Progress
        value={percent}
        aria-label={`Import progress: ${completedCount} of ${total} years completed`}
      />

      <ul className="space-y-1.5" aria-label="Per-year import status">
        {yearProgress.map((item) => (
          <li key={item.year} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <YearStatusIcon status={item.status} />
              {item.year}
            </span>
            <span className="flex items-center gap-2">
              {item.status === "completed" && (
                <span className="text-muted-foreground tabular-nums">
                  Created {item.created} · Skipped {item.skipped}
                </span>
              )}
              <Badge variant={STATUS_BADGE_VARIANT[item.status]}>{STATUS_LABEL[item.status]}</Badge>
            </span>
          </li>
        ))}
      </ul>

      {yearRunningTotals && completedCount > 0 && (
        <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
          Running totals: {yearRunningTotals.created} created, {yearRunningTotals.skipped} skipped
          across {completedCount} completed year{completedCount !== 1 ? "s" : ""}.
        </p>
      )}

      {failedEntry && (
        <p className="text-destructive text-sm" role="alert">
          Import stopped: year {failedEntry.year} failed
          {failedEntry.error ? ` (${failedEntry.error})` : ""}. Years completed before it remain
          imported exactly as they are; later years were not attempted. This does not run in the
          background and will not resume automatically — re-validate the file and import again.
          Already-imported shipments are detected and skipped automatically, so retrying is safe.
        </p>
      )}

      {!failedEntry && allCompleted && (
        <p className="text-sm text-emerald-700" role="status" aria-live="polite">
          {yearRunningTotals && yearRunningTotals.created === 0
            ? "Every shipment in this file already existed and was skipped — nothing new to import."
            : "Every year imported successfully."}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportResultsPanel({
  preview,
  commitSummary,
  yearProgress,
  yearRunningTotals,
  isImporting,
  onReset,
}: ImportResultsPanelProps) {
  if (!preview && !commitSummary && !yearProgress) return null;

  return (
    <>
      {/* Preview result panel */}
      {preview && (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm font-medium">Preview Details</p>

          {preview.row_errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-destructive text-sm font-medium">Row Errors</p>
              <ul className="text-destructive list-disc space-y-1 pl-5 text-xs">
                {preview.row_errors.slice(0, 20).map((rowError, index) => (
                  <li key={`row-error-${index}-${rowError}`}>{rowError}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-700">Warnings</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
                {preview.warnings.slice(0, 20).map((warning, index) => (
                  <li key={`preview-warning-${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.unknown_species.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-700">Unknown Species</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
                {preview.unknown_species.slice(0, 20).map((name, index) => (
                  <li key={`unknown-species-${index}-${name}`}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.unknown_suppliers.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-700">Unknown Suppliers</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
                {preview.unknown_suppliers.slice(0, 20).map((code, index) => (
                  <li key={`unknown-supplier-${index}-${code}`}>{code}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Preview hash: <span className="font-mono">{preview.preview_hash}</span>
          </p>
        </div>
      )}

      {/* Year-by-year progress (Phase 5B) — supersedes the old single-year commit summary;
          `commitSummary` itself is still used elsewhere (import step indicator) but no longer
          rendered directly here now that yearProgress carries the complete, per-year picture. */}
      {yearProgress && yearProgress.length > 0 && (
        <ImportProgressSection yearProgress={yearProgress} yearRunningTotals={yearRunningTotals} />
      )}

      {commitSummary && commitSummary.warnings.length > 0 && (
        <div className="space-y-1 rounded-md border p-4">
          <p className="text-sm font-medium text-amber-700">Import Warnings</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
            {commitSummary.warnings.slice(0, 20).map((warning, index) => (
              <li key={`commit-warning-${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {(commitSummary || (yearProgress && yearProgress.length > 0)) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isImporting}
          onClick={onReset}
          className="w-fit"
        >
          Import another file
        </Button>
      )}
    </>
  );
}
