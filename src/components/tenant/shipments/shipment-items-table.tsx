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
  SpeciesSearchToolbar,
  type SpeciesFilters,
} from "@/components/shared/species-search-toolbar";
import { useSpeciesSearch, type SpeciesItem } from "@/hooks/use-species-search";
import { cn } from "@/lib/utils";

import {
  computeItemEditReserve,
  computeItemRemaining,
  formatReleasedQuantity,
  type ShipmentItemRow,
} from "./types";

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
 * `sum(losses) + max(inFlightQuantity, goodEmergence ?? 0) ≤ numberReceived`
 * server-side. Mirroring both independent constraints client-side gives
 * better feedback (we clamp at the cap) and matches the composer's
 * per-species behavior.
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
 * - `numberReceived` cannot drop below the stricter of event-backed physical
 *   inventory and aggregate Released, plus `sum(losses)`.
 * - Individual loss columns cannot push the total losses past
 *   `numberReceived - reserved`. Clamping at this cap gives the user immediate
 *   feedback instead of a server error after Save.
 */
function metricMaxFor(item: ShipmentItemRow, field: MetricKey): number | undefined {
  if (field === "numberReceived") return undefined;

  const otherLosses = LOSS_FIELDS.filter((k) => k !== field).reduce((acc, k) => acc + item[k], 0);
  return Math.max(0, item.numberReceived - computeItemEditReserve(item) - otherLosses);
}

function metricMinFor(item: ShipmentItemRow, field: MetricKey): number {
  if (field !== "numberReceived") return 0;
  const totalLosses = LOSS_FIELDS.reduce((acc, k) => acc + item[k], 0);
  return computeItemEditReserve(item) + totalLosses;
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

      {/* One wrapping card per species (mirrors the add-shipment form). */}
      <div>
        {search.results.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No species in this shipment.
          </p>
        ) : (
          <ul className="grid gap-4">
            {search.results.map((item) => {
              const remaining = computeItemRemaining(item);
              return (
                <li
                  key={item.id}
                  className="bg-card @container flex flex-col gap-4 rounded-lg border p-4"
                >
                  {/*
                    Header grid driven by the card's own width (container query),
                    not the viewport, since the sidebar changes how much room a
                    card gets. Narrow: image / name / remove on row one, stats on
                    row two. Wide (@lg): everything on a single row.
                  */}
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 @lg:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
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
                        <Bug className="text-muted-foreground absolute inset-0 m-auto size-7" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium">{item.commonName}</div>
                      <div className="text-muted-foreground truncate text-sm italic">
                        {item.scientificName}
                      </div>
                    </div>
                    <dl className="order-last col-span-3 flex gap-2 @lg:order-none @lg:col-span-1">
                      <div className="bg-muted min-w-16 rounded-md px-3 py-1.5 text-center">
                        <dt className="text-muted-foreground text-xs font-medium">Released</dt>
                        <dd className="text-lg leading-tight font-semibold">
                          {formatReleasedQuantity(item.goodEmergence)}
                        </dd>
                      </div>
                      <div
                        className={cn(
                          "min-w-16 rounded-md px-3 py-1.5 text-center",
                          remaining === 0
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-muted",
                        )}
                      >
                        <dt
                          className={cn(
                            "text-xs font-medium",
                            remaining !== 0 && "text-muted-foreground",
                          )}
                        >
                          Remaining
                        </dt>
                        <dd className="text-lg leading-tight font-semibold">
                          {remaining === 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="size-4" aria-hidden="true" />
                              <span>0</span>
                              <span className="sr-only"> (none remaining)</span>
                            </span>
                          ) : (
                            remaining
                          )}
                        </dd>
                      </div>
                    </dl>
                    {editing && (
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
                    )}
                  </div>

                  {editing ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
                      {METRIC_COLUMNS.map((col) => (
                        <div key={col.key} className="space-y-1">
                          <div className="text-xs font-medium">{col.short}</div>
                          <MetricStepper
                            value={item[col.key]}
                            min={metricMinFor(item, col.key)}
                            max={metricMaxFor(item, col.key)}
                            ariaLabel={`${col.label} for ${item.commonName}`}
                            onChange={(next) => onMetricChange?.(item.id, col.key, next)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <dl className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
                      {METRIC_COLUMNS.map((col) => (
                        <div key={col.key} className="space-y-1">
                          <dt className="text-xs font-medium">
                            <span aria-hidden="true">{col.short}</span>
                            <span className="sr-only">{col.label}</span>
                          </dt>
                          <dd className="text-sm">{item[col.key]}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
