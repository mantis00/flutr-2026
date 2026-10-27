"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/shared/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useShipmentImport } from "@/hooks/use-shipment-import";
import { useShipmentViewer } from "@/hooks/use-shipment-viewer";
import DangerZone from "./danger-zone";
import FileDropZone from "./file-drop-zone";
import ImportResultsPanel from "./import-results-panel";
import ShipmentViewer from "./shipment-viewer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InstitutionDataTabProps = {
  institutionId: number;
  mode?: "platform" | "tenant";
  tenantSlug?: string;
};

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

const IMPORT_STEPS = [
  { num: 1, label: "Upload" },
  { num: 2, label: "Validate" },
  { num: 3, label: "Complete" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InstitutionDataTab({
  institutionId,
  mode = "platform",
  tenantSlug,
}: InstitutionDataTabProps) {
  const isTenantMode = mode === "tenant";
  const tenantReady = !isTenantMode || !!tenantSlug;
  const tenantHeaders = useMemo(
    () => (isTenantMode && tenantSlug ? { "x-tenant-slug": tenantSlug } : undefined),
    [isTenantMode, tenantSlug],
  );

  // API URLs
  const summaryUrl = isTenantMode
    ? ROUTES.tenant.shipmentSummaryApi
    : ROUTES.admin.institutionShipmentsApi(institutionId);
  const previewUrl = isTenantMode
    ? ROUTES.tenant.shipmentImportPreviewApi
    : ROUTES.admin.institutionImportPreview(institutionId);
  const commitUrl = isTenantMode
    ? ROUTES.tenant.shipmentImportCommitApi
    : ROUTES.admin.institutionImportCommit(institutionId);

  const {
    shipmentRows,
    isLoading: isLoadingViewer,
    error: viewerError,
    refresh: loadShipments,
  } = useShipmentViewer({ summaryUrl, tenantHeaders, tenantReady });

  const {
    rawText,
    sourceFileName,
    processFile,
    isReadingFile,
    isPasteMode,
    setIsPasteMode,
    handlePasteChange,
    preview,
    commitSummary,
    handleReset,
    handleParsePreview,
    handleCommitImport,
    isParsing,
    isImporting,
    canCommit,
    errorMessage,
    importStep,
    allowSpeciesAutocreate,
    setAllowSpeciesAutocreate,
    allowDuplicateHeaders,
    setAllowDuplicateHeaders,
    exportFrom,
    setExportFrom,
    exportTo,
    setExportTo,
    exportRangeError,
    handleExportData,
    isExporting,
    rangeShipmentCount,
  } = useShipmentImport({
    previewUrl,
    commitUrl,
    isTenantMode,
    institutionId,
    tenantSlug,
    tenantHeaders,
    tenantReady,
    shipmentRows,
    onImportSuccess: loadShipments,
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* ------------------------------------------------------------------ */}
      {/* Import Hub                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="import-hub-heading">
        <h2 id="import-hub-heading" className="mb-1 text-sm font-semibold">
          Historical Shipment Import
        </h2>
        <p className="text-muted-foreground mb-4 text-sm">
          {isTenantMode
            ? "Institution admins can import historical shipment records and export current institution data for reporting."
            : "Superusers can import historical shipment records from Excel files and export current institution data for reporting or migration purposes."}
        </p>

        <div className="grid gap-6 md:grid-cols-[1fr_280px]">
          {/* ---- Left: drop zone, steps, results ---- */}
          <div className="flex flex-col gap-4">
            {/* Step indicator */}
            <ol className="flex items-center" aria-label="Import progress">
              {IMPORT_STEPS.map(({ num, label }, i) => (
                <li key={num} className="flex items-center">
                  {i > 0 && <div className="bg-border mx-3 h-px w-8 shrink-0" aria-hidden="true" />}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                        importStep >= num
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                      aria-hidden="true"
                    >
                      {num}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        importStep >= num ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>

            <FileDropZone
              rawText={rawText}
              sourceFileName={sourceFileName}
              onFile={processFile}
              isReadingFile={isReadingFile}
              isPasteMode={isPasteMode}
              onPasteModeChange={setIsPasteMode}
              onRawTextChange={handlePasteChange}
            />

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleParsePreview}
                disabled={isParsing || !rawText.trim()}
              >
                {isParsing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {isParsing ? "Parsing…" : "Parse Preview"}
              </Button>
              <Button
                variant="outline"
                onClick={handleCommitImport}
                disabled={isImporting || !canCommit || !tenantReady}
              >
                {isImporting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {isImporting ? "Importing…" : "Commit Import"}
              </Button>
            </div>

            {/* Error message */}
            {errorMessage && (
              <p className="text-destructive text-xs" role="status" aria-live="polite">
                {errorMessage}
              </p>
            )}

            <ImportResultsPanel
              preview={preview}
              commitSummary={commitSummary}
              onReset={handleReset}
            />

            <p className="text-muted-foreground text-xs">
              Imports are preview-first. Re-run preview after changing input or options.
            </p>
          </div>

          {/* ---- Right sidebar: settings + export ---- */}
          <aside className="flex flex-col gap-4" aria-label="Import settings and export">
            {/* Import Settings */}
            <fieldset className="flex flex-col gap-4 rounded-md border p-3">
              <legend className="px-1 text-xs font-medium">Import Settings</legend>

              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor="species-autocreate" className="text-xs">
                    Auto-create species
                  </Label>
                  {isTenantMode && (
                    <p className="text-muted-foreground text-[10px]">Platform only</p>
                  )}
                </div>
                <Switch
                  id="species-autocreate"
                  checked={allowSpeciesAutocreate}
                  onCheckedChange={setAllowSpeciesAutocreate}
                  disabled={isTenantMode}
                  aria-describedby={isTenantMode ? "species-autocreate-hint" : undefined}
                />
              </div>
              {isTenantMode && (
                <p id="species-autocreate-hint" className="sr-only">
                  Auto-create species is restricted to platform superusers.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="duplicate-handling" className="text-xs">
                  Duplicate headers
                </Label>
                <Select
                  value={allowDuplicateHeaders ? "allow" : "skip"}
                  onValueChange={(v) => setAllowDuplicateHeaders(v === "allow")}
                >
                  <SelectTrigger id="duplicate-handling" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow" className="text-xs">
                      Allow duplicates
                    </SelectItem>
                    <SelectItem value="skip" className="text-xs">
                      Skip duplicates
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>

            {/* Preview stats — surfaces after parse */}
            {preview && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-medium">Preview Stats</p>
                <div className="space-y-1.5">
                  {(
                    [
                      { label: "Rows parsed", value: preview.summary.total_rows, warn: false },
                      {
                        label: "Shipments",
                        value: preview.summary.shipments_detected,
                        warn: false,
                      },
                      {
                        label: "Errors",
                        value: preview.summary.row_errors,
                        warn: preview.summary.row_errors > 0,
                        error: preview.summary.row_errors > 0,
                      },
                      {
                        label: "Warnings",
                        value: preview.summary.warnings,
                        warn: preview.summary.warnings > 0,
                        error: false,
                      },
                      {
                        label: "Unknown species",
                        value: preview.summary.unknown_species,
                        warn: preview.summary.unknown_species > 0,
                        error: false,
                      },
                      {
                        label: "Unknown suppliers",
                        value: preview.summary.unknown_suppliers,
                        warn: preview.summary.unknown_suppliers > 0,
                        error: false,
                      },
                    ] as { label: string; value: number; warn: boolean; error?: boolean }[]
                  ).map(({ label, value, warn, error }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs",
                          error
                            ? "text-destructive"
                            : warn
                              ? "text-amber-700"
                              : "text-muted-foreground",
                        )}
                      >
                        {label}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium tabular-nums",
                          error ? "text-destructive" : warn ? "text-amber-700" : "text-foreground",
                        )}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Export */}
            <fieldset className="flex flex-col gap-3 rounded-md border p-3">
              <legend className="px-1 text-xs font-medium">Export</legend>
              <div className="space-y-1">
                <Label htmlFor="export-from" className="text-xs">
                  From
                </Label>
                <DatePicker
                  id="export-from"
                  value={exportFrom}
                  onChange={setExportFrom}
                  maxDate={exportTo || undefined}
                  clearable
                  placeholder="Start date"
                  aria-describedby={exportRangeError ? "export-range-error" : undefined}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="export-to" className="text-xs">
                  To
                </Label>
                <DatePicker
                  id="export-to"
                  value={exportTo}
                  onChange={setExportTo}
                  minDate={exportFrom || undefined}
                  clearable
                  placeholder="End date"
                  aria-describedby={exportRangeError ? "export-range-error" : undefined}
                />
              </div>
              {exportRangeError && (
                <p id="export-range-error" className="text-destructive text-xs" role="alert">
                  {exportRangeError}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportData}
                disabled={!tenantReady || !!exportRangeError || isExporting}
                className="h-8 w-full text-xs"
              >
                {isExporting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {isExporting
                  ? "Exporting…"
                  : exportFrom || exportTo
                    ? `Export XLSX (${exportFrom?.slice(0, 4) ?? "start"}–${exportTo?.slice(0, 4) ?? "now"})`
                    : "Export XLSX (all)"}
              </Button>
              {rangeShipmentCount !== null && (
                <p className="text-muted-foreground text-xs">
                  {rangeShipmentCount.toLocaleString()} shipment
                  {rangeShipmentCount !== 1 ? "s" : ""}
                  {exportFrom || exportTo ? " in range" : ""}
                </p>
              )}
            </fieldset>
          </aside>
        </div>
      </section>

      <hr />

      <ShipmentViewer
        shipmentRows={shipmentRows}
        isLoading={isLoadingViewer}
        error={viewerError}
        onRefresh={loadShipments}
      />

      <hr />

      <DangerZone
        shipmentRows={shipmentRows}
        isTenantMode={isTenantMode}
        institutionId={institutionId}
        tenantHeaders={tenantHeaders}
        onDeleteSuccess={loadShipments}
      />
    </div>
  );
}
