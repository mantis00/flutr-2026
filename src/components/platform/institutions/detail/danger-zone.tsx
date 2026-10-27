"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/shared/date-picker";
import { type ShipmentSummaryRow } from "@/lib/shipment-import-utils";
import { useShipmentDelete } from "@/hooks/use-shipment-delete";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DangerZoneProps = {
  shipmentRows: ShipmentSummaryRow[] | null;
  isTenantMode: boolean;
  institutionId: number;
  tenantHeaders: Record<string, string> | undefined;
  onDeleteSuccess: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DangerZone({
  shipmentRows,
  isTenantMode,
  institutionId,
  tenantHeaders,
  onDeleteSuccess,
}: DangerZoneProps) {
  const {
    deleteYear,
    setDeleteYear,
    deleteRangeFrom,
    setDeleteRangeFrom,
    deleteRangeTo,
    setDeleteRangeTo,
    deleteYearParsed,
    deleteAllCount,
    deleteYearCount,
    deleteRangeError,
    deleteRangeCount,
    pendingDelete,
    setPendingDelete,
    pendingDeleteCount,
    isDeleting,
    handleDelete,
  } = useShipmentDelete({
    isTenantMode,
    institutionId,
    tenantHeaders,
    shipmentRows,
    onDeleteSuccess,
  });

  return (
    <section aria-labelledby="danger-zone-heading">
      <div className="border-destructive/40 rounded-md border p-4">
        <h2 id="danger-zone-heading" className="text-destructive mb-1 text-sm font-semibold">
          Danger Zone
        </h2>
        <p className="text-muted-foreground mb-4 text-xs">
          These actions permanently delete shipment data and cannot be undone.
        </p>

        <div className="flex flex-col divide-y">
          {/* Delete all */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
            <div>
              <p className="text-sm font-medium">Delete all shipment data</p>
              <p className="text-muted-foreground text-xs">
                Removes all shipments, items, releases, and in-flight records.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setPendingDelete({ mode: "all" })}
              disabled={isDeleting || deleteAllCount === 0}
            >
              Delete all
              {deleteAllCount > 0 ? ` (${deleteAllCount.toLocaleString()})` : ""}
            </Button>
          </div>

          {/* Delete by year */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-medium">Delete by year</p>
              <p className="text-muted-foreground text-xs">
                Remove all shipments for a specific calendar year.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Label htmlFor="delete-year" className="sr-only">
                  Year
                </Label>
                <Input
                  id="delete-year"
                  type="number"
                  min={1900}
                  max={2100}
                  value={deleteYear}
                  onChange={(e) => setDeleteYear(e.target.value)}
                  placeholder="YYYY"
                  className="h-8 w-24 text-xs"
                />
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (deleteYearParsed !== null) {
                    setPendingDelete({ mode: "year", year: deleteYearParsed });
                  }
                }}
                disabled={isDeleting || deleteYearParsed === null || deleteYearCount === 0}
              >
                Delete{deleteYearCount > 0 ? ` (${deleteYearCount.toLocaleString()})` : ""}
              </Button>
            </div>
          </div>

          {/* Delete by range */}
          <div className="flex flex-wrap items-start justify-between gap-3 pt-3 pb-0">
            <div>
              <p className="text-sm font-medium">Delete by date range</p>
              <p className="text-muted-foreground text-xs">
                Remove all shipments within a specific date window.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="delete-range-from" className="text-xs">
                    From
                  </Label>
                  <DatePicker
                    id="delete-range-from"
                    value={deleteRangeFrom}
                    onChange={setDeleteRangeFrom}
                    maxDate={deleteRangeTo || undefined}
                    clearable
                    placeholder="Start date"
                    className="w-44"
                    aria-describedby={deleteRangeError ? "delete-range-error" : undefined}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delete-range-to" className="text-xs">
                    To
                  </Label>
                  <DatePicker
                    id="delete-range-to"
                    value={deleteRangeTo}
                    onChange={setDeleteRangeTo}
                    minDate={deleteRangeFrom || undefined}
                    clearable
                    placeholder="End date"
                    className="w-44"
                    aria-describedby={deleteRangeError ? "delete-range-error" : undefined}
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (deleteRangeFrom && deleteRangeTo && !deleteRangeError) {
                      setPendingDelete({
                        mode: "range",
                        from: deleteRangeFrom,
                        to: deleteRangeTo,
                      });
                    }
                  }}
                  disabled={
                    isDeleting ||
                    !deleteRangeFrom ||
                    !deleteRangeTo ||
                    !!deleteRangeError ||
                    deleteRangeCount === 0
                  }
                >
                  Delete{deleteRangeCount > 0 ? ` (${deleteRangeCount.toLocaleString()})` : ""}
                </Button>
              </div>
              {deleteRangeError && (
                <p id="delete-range-error" className="text-destructive text-xs" role="alert">
                  {deleteRangeError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Single AlertDialog controlled by pendingDelete */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete shipment data?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.mode === "all" && (
                <>
                  This will permanently delete all{" "}
                  <strong>{pendingDeleteCount.toLocaleString()}</strong> shipment
                  {pendingDeleteCount !== 1 ? "s" : ""} and all related records for this
                  institution.
                </>
              )}
              {pendingDelete?.mode === "year" && (
                <>
                  This will permanently delete{" "}
                  <strong>{pendingDeleteCount.toLocaleString()}</strong> shipment
                  {pendingDeleteCount !== 1 ? "s" : ""} from <strong>{pendingDelete.year}</strong>{" "}
                  and all related records.
                </>
              )}
              {pendingDelete?.mode === "range" && (
                <>
                  This will permanently delete{" "}
                  <strong>{pendingDeleteCount.toLocaleString()}</strong> shipment
                  {pendingDeleteCount !== 1 ? "s" : ""} between{" "}
                  <strong>{pendingDelete.from}</strong> and <strong>{pendingDelete.to}</strong> and
                  all related records.
                </>
              )}{" "}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleDelete}>
              {isDeleting
                ? "Deleting…"
                : `Delete ${pendingDeleteCount.toLocaleString()} shipment${pendingDeleteCount !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
