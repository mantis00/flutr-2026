"use client";

import { useId, useMemo, useState } from "react";
import Image from "next/image";
import { Bug, CheckCircle2, Minus, Plus, Trash2 } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SpeciesSearchToolbar,
  type SpeciesFilters,
} from "@/components/shared/species-search-toolbar";
import { useSpeciesSearch, type SpeciesItem } from "@/hooks/use-species-search";
import { cn } from "@/lib/utils";

import { computeItemRemaining, type ShipmentItemRow } from "./types";

type LossField =
  | "emergedInTransit"
  | "damagedInTransit"
  | "diseasedInTransit"
  | "parasite"
  | "nonEmergence"
  | "poorEmergence";

type MetricKey = "numberReceived" | LossField;

interface MetricColumn {
  key: MetricKey;
  label: string;
  short: string;
}

const METRIC_COLUMNS: MetricColumn[] = [
  { key: "numberReceived", label: "Number received", short: "Received" },
  { key: "emergedInTransit", label: "Emerged in transit", short: "Emerged" },
  { key: "damagedInTransit", label: "Damaged in transit", short: "Damaged" },
  { key: "diseasedInTransit", label: "Diseased in transit", short: "Diseased" },
  { key: "parasite", label: "Parasite", short: "Parasite" },
  { key: "nonEmergence", label: "Non-emergence", short: "Non-emerg" },
  { key: "poorEmergence", label: "Poor emergence", short: "Poor-emerg" },
];

/**
 * Loss columns that must satisfy
 * `sum(losses) + inFlightQuantity ≤ numberReceived` server-side. Mirroring
 * that constraint client-side gives better feedback (we clamp at the cap)
 * and matches the composer's per-species behavior.
 */
const LOSS_FIELDS: LossField[] = [
  "emergedInTransit",
  "damagedInTransit",
  "diseasedInTransit",
  "parasite",
  "nonEmergence",
  "poorEmergence",
];

interface ShipmentItemsTableProps {
  items: ShipmentItemRow[];
  /** When true, every metric is editable inline with steppers + a numeric input. */
  editing: boolean;
  /** Called when editing mode is on and the user changes a metric. */
  onMetricChange?: (itemId: number, field: MetricKey, value: number) => void;
  /** Called when editing mode is on and the user wants to remove an item. */
  onRemoveItem?: (itemId: number) => void;
}

/**
 * Per-column maximum in edit mode.
 *
 * - `numberReceived` cannot drop below `inFlightQuantity + sum(losses)` or the
 *   PATCH API rejects it as an `INVALID_INVENTORY_REDUCTION`.
 * - Individual loss columns cannot push the total losses past
 *   `numberReceived - inFlightQuantity`. Clamping at this cap gives the user
 *   immediate feedback instead of a server error after Save.
 */
function metricMaxFor(item: ShipmentItemRow, field: MetricKey): number | undefined {
  if (field === "numberReceived") return undefined;

  const otherLosses = LOSS_FIELDS.filter((k) => k !== field).reduce((acc, k) => acc + item[k], 0);
  return Math.max(0, item.numberReceived - item.inFlightQuantity - otherLosses);
}

function metricMinFor(item: ShipmentItemRow, field: MetricKey): number {
  if (field !== "numberReceived") return 0;
  const totalLosses = LOSS_FIELDS.reduce((acc, k) => acc + item[k], 0);
  return item.inFlightQuantity + totalLosses;
}

type ItemSpeciesItem = SpeciesItem & ShipmentItemRow;

/**
 * The items table for the Individual Shipment page. Always wrapped in
 * `SpeciesSearchToolbar` per the outline. Each row shows both common and
 * scientific names plus an image. In view mode metrics are read-only; in
 * editing mode every column gets +/− steppers and a numeric input.
 */
export function ShipmentItemsTable({
  items,
  editing,
  onMetricChange,
  onRemoveItem,
}: ShipmentItemsTableProps) {
  const adapted = useMemo<ItemSpeciesItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        scientific_name: item.scientificName,
        common_name: item.commonName,
        // The shipment items query doesn't expose `family`, so default to "—"
        // which renders harmlessly in the toolbar's family filter.
        family: "—",
      })),
    [items],
  );

  const search = useSpeciesSearch<ItemSpeciesItem>({ items: adapted, pageSize: items.length || 1 });

  const [pendingDelete, setPendingDelete] = useState<ShipmentItemRow | null>(null);

  return (
    <div className="space-y-4">
      <SpeciesSearchToolbar
        query={search.query}
        sortField={search.sortField}
        sortDirection={search.sortDirection}
        filters={{ families: search.activeFamilies }}
        families={search.families}
        onQueryChange={search.setQuery}
        onSortChange={search.setSort}
        onFiltersChange={(filters: SpeciesFilters) => search.setActiveFamilies(filters.families)}
        onReset={search.resetAll}
      />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">Species</TableHead>
              {METRIC_COLUMNS.map((col) => (
                <TableHead key={col.key} className="text-center">
                  {col.short}
                </TableHead>
              ))}
              <TableHead className="text-center">Released</TableHead>
              <TableHead className="text-center">Remaining</TableHead>
              {editing && <TableHead className="w-[60px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {search.results.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={METRIC_COLUMNS.length + (editing ? 4 : 3)}
                  className="text-muted-foreground py-6 text-center text-sm"
                >
                  No species in this shipment.
                </TableCell>
              </TableRow>
            ) : (
              search.results.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded">
                        {item.images[0] ? (
                          <Image
                            src={item.images[0].thumb}
                            alt=""
                            width={128}
                            height={128}
                            unoptimized
                            className="size-full object-cover"
                          />
                        ) : (
                          <Bug className="text-muted-foreground absolute inset-0 m-auto size-6" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{item.commonName}</div>
                        <div className="text-muted-foreground truncate text-xs italic">
                          {item.scientificName}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  {METRIC_COLUMNS.map((col) => (
                    <TableCell key={col.key} className="text-center">
                      {editing ? (
                        <MetricStepper
                          value={item[col.key]}
                          min={metricMinFor(item, col.key)}
                          max={metricMaxFor(item, col.key)}
                          ariaLabel={`${col.label} for ${item.commonName}`}
                          onChange={(next) => onMetricChange?.(item.id, col.key, next)}
                        />
                      ) : (
                        <span className="text-sm">{item[col.key]}</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-center text-sm">{item.inFlightQuantity}</TableCell>
                  <TableCell
                    className={cn(
                      "text-center text-sm font-medium",
                      computeItemRemaining(item) === 0 && "text-emerald-600",
                    )}
                  >
                    {computeItemRemaining(item) === 0 ? (
                      <span className="inline-flex items-center justify-center gap-1">
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        <span>0</span>
                        <span className="sr-only"> (released)</span>
                      </span>
                    ) : (
                      computeItemRemaining(item)
                    )}
                  </TableCell>
                  {editing && (
                    <TableCell className="text-right">
                      {/*
                        Items that already have released butterflies cannot be
                        removed — the release would lose its source row.
                        Disabling here matches the server-side
                        `CANNOT_DELETE_ITEM_IN_FLIGHT` rejection.
                      */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={
                          item.inFlightQuantity > 0
                            ? `Cannot remove ${item.commonName}: already released`
                            : `Remove ${item.commonName}`
                        }
                        disabled={item.inFlightQuantity > 0}
                        title={
                          item.inFlightQuantity > 0 ? "Cannot remove: already released" : undefined
                        }
                        onClick={() => setPendingDelete(item)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this species from the shipment?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${pendingDelete.commonName} (${pendingDelete.scientificName}) will be removed when you save changes. Items that already have released butterflies cannot be removed.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onRemoveItem?.(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface MetricStepperProps {
  value: number;
  ariaLabel: string;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

function MetricStepper({ value, ariaLabel, onChange, min = 0, max }: MetricStepperProps) {
  // Stable id for the visually-hidden constraint hint so screen readers can
  // announce the allowed range alongside the input via aria-describedby.
  // useId() yields stable, hydration-safe ids across server and client.
  const hintId = useId();

  const clamp = (next: number) => {
    const floored = Math.floor(Number.isFinite(next) ? next : min);
    const lower = Math.max(min, floored);
    return typeof max === "number" ? Math.min(max, lower) : lower;
  };

  const hint = typeof max === "number" ? `Allowed range ${min} to ${max}.` : `Minimum ${min}.`;

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-7"
        aria-label={`Increase ${ariaLabel}`}
        disabled={typeof max === "number" && value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus className="size-3" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={ariaLabel}
        aria-describedby={hintId}
        className="h-7 w-14 px-1 text-center text-sm"
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <span id={hintId} className="sr-only">
        {hint}
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-7"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus className="size-3" />
      </Button>
    </div>
  );
}
