"use client";

import { Button } from "@/components/ui/button";
import { type CommitResponse, type PreviewResponse } from "@/lib/shipment-import-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportResultsPanelProps = {
  preview: PreviewResponse | null;
  commitSummary: CommitResponse | null;
  onReset: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportResultsPanel({
  preview,
  commitSummary,
  onReset,
}: ImportResultsPanelProps) {
  if (!preview && !commitSummary) return null;

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

      {/* Commit result panel — year-scoped since Phase 3C; a single commit response now
          describes exactly one Arrival year, never a whole-workbook partial-failure summary. */}
      {commitSummary && (
        <div className="space-y-2 rounded-md border p-4">
          <p className="text-sm font-medium">Import Summary — Year {commitSummary.year}</p>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p>Created: {commitSummary.created}</p>
            <p>Skipped: {commitSummary.skipped}</p>
          </div>

          {commitSummary.warnings.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-700">Import Warnings</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
                {commitSummary.warnings.slice(0, 20).map((warning, index) => (
                  <li key={`commit-warning-${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-emerald-700" role="status" aria-live="polite">
            Year {commitSummary.year} committed successfully. A failed commit returns an error
            instead of a summary here — nothing partial is ever shown.
          </p>

          <Button type="button" variant="outline" size="sm" onClick={onReset}>
            Import another file
          </Button>
        </div>
      )}
    </>
  );
}
