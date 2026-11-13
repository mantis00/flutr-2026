"use client";

import { useId, useMemo, useState } from "react";
import Image from "next/image";
import { Bug, CheckCircle2, ChevronDown, Minus, Plus, Trash2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
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
import { computeOtherParasiteCount } from "@/lib/parasite-breakdown";

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
  /** Called when editing mode is on and the user changes parasitoid counts. */
  onParasiteBreakdownChange?: (
    itemId: number,
    waspCount: number | null,
    flyCount: number | null,
    description: string,
  ) => void;
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
  if (field === "parasite") {
    const otherLosses = LOSS_FIELDS.filter((key) => key !== "parasite").reduce(
      (acc, key) => acc + item[key],
      0,
    );
    const inventoryMinimum = computeItemEditReserve(item) + otherLosses;
    const categorizedMinimum = (item.parasiteWaspCount ?? 0) + (item.parasiteFlyCount ?? 0);
    return Math.max(inventoryMinimum, categorizedMinimum);
  }
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
  onParasiteBreakdownChange,
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
  const showParasiteBreakdown =
    editing ||
    items.some(
      (item) =>
        item.parasite > 0 &&
        (item.parasiteWaspCount !== null ||
          item.parasiteFlyCount !== null ||
          Boolean(item.parasiteDescription?.trim())),
    );
  const hasShipmentBreakdownCounts = items.some(
    (item) =>
      item.parasite > 0 && (item.parasiteWaspCount !== null || item.parasiteFlyCount !== null),
  );

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
              {showParasiteBreakdown && (
                <TableHead className="text-center">Parasite breakdown</TableHead>
              )}
              <TableHead className="text-center">Released</TableHead>
              <TableHead className="text-center">Remaining</TableHead>
              {editing && <TableHead className="w-[60px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {search.results.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={
                    METRIC_COLUMNS.length + (showParasiteBreakdown ? 4 : 3) + (editing ? 1 : 0)
                  }
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
                  {showParasiteBreakdown && (
                    <TableCell className="text-sm">
                      <ParasiteBreakdownCell
                        item={item}
                        editing={editing}
                        showUnenteredAsOther={hasShipmentBreakdownCounts}
                        onChange={(waspCount, flyCount, description) =>
                          onParasiteBreakdownChange?.(item.id, waspCount, flyCount, description)
                        }
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-center text-sm">
                    {formatReleasedQuantity(item.goodEmergence)}
                  </TableCell>
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
                        <span className="sr-only"> (none remaining)</span>
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

interface ParasiteBreakdownCellProps {
  item: ShipmentItemRow;
  editing: boolean;
  showUnenteredAsOther: boolean;
  onChange: (waspCount: number | null, flyCount: number | null, description: string) => void;
}

function ParasiteBreakdownCell({
  item,
  editing,
  showUnenteredAsOther,
  onChange,
}: ParasiteBreakdownCellProps) {
  const id = useId();
  const otherCount = computeOtherParasiteCount(
    item.parasite,
    item.parasiteWaspCount,
    item.parasiteFlyCount,
  );
  const isTracked = otherCount !== null;

  const handleCountChange = (field: "wasp" | "fly", rawValue: string) => {
    const value = rawValue === "" ? null : Number(rawValue);
    if (value !== null && (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))) {
      return;
    }

    const waspCount = field === "wasp" ? value : item.parasiteWaspCount;
    const flyCount = field === "fly" ? value : item.parasiteFlyCount;
    onChange(waspCount, flyCount, item.parasiteDescription ?? "");
  };

  if (!editing) {
    const waspCount = item.parasiteWaspCount ?? 0;
    const flyCount = item.parasiteFlyCount ?? 0;
    const displayOtherCount =
      otherCount ?? (showUnenteredAsOther && item.parasite > 0 ? item.parasite : null);
    const hasVisibleCount =
      waspCount > 0 || flyCount > 0 || (displayOtherCount !== null && displayOtherCount > 0);

    if (!hasVisibleCount && !item.parasiteDescription) {
      return <span className="text-muted-foreground">—</span>;
    }

    return (
      <div className="space-y-1">
        {hasVisibleCount && (
          <div className="space-y-1">
            {waspCount > 0 && <div>Wasps: {waspCount}</div>}
            {flyCount > 0 && <div>Flies: {flyCount}</div>}
            {displayOtherCount !== null && displayOtherCount > 0 && (
              <div>Other: {displayOtherCount}</div>
            )}
          </div>
        )}
        {item.parasiteDescription && (
          <details className="group">
            <summary className="text-primary hover:text-primary/80 inline-flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
              <span>Description</span>
              <ChevronDown
                className="size-3 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-1 max-w-48 text-xs whitespace-pre-wrap">{item.parasiteDescription}</p>
          </details>
        )}
      </div>
    );
  }

  return (
    <details className="group min-w-36">
      <summary className="text-primary hover:text-primary/80 inline-flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2">
        <span>{isTracked || item.parasiteDescription ? "Edit details" : "Add details"}</span>
        <ChevronDown
          className="size-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="bg-background mt-2 min-w-52 space-y-3 rounded-md border p-3 shadow-md">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-wasp`} className="text-xs">
              Wasps
            </Label>
            <Input
              id={`${id}-wasp`}
              type="number"
              inputMode="numeric"
              min={0}
              max={Math.max(0, item.parasite - (item.parasiteFlyCount ?? 0))}
              step={1}
              value={item.parasiteWaspCount ?? ""}
              aria-label={`Wasp count for ${item.commonName}`}
              onChange={(event) => handleCountChange("wasp", event.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-fly`} className="text-xs">
              Flies
            </Label>
            <Input
              id={`${id}-fly`}
              type="number"
              inputMode="numeric"
              min={0}
              max={Math.max(0, item.parasite - (item.parasiteWaspCount ?? 0))}
              step={1}
              value={item.parasiteFlyCount ?? ""}
              aria-label={`Fly count for ${item.commonName}`}
              onChange={(event) => handleCountChange("fly", event.target.value)}
              className="h-8"
            />
          </div>
        </div>
        {isTracked ? (
          <p className="text-muted-foreground text-xs">Other: {otherCount}</p>
        ) : (
          <p className="text-muted-foreground text-xs">Leave counts blank to skip the breakdown.</p>
        )}
        <div className="space-y-1">
          <Label htmlFor={`${id}-description`} className="text-xs">
            Description (optional)
          </Label>
          <Textarea
            id={`${id}-description`}
            maxLength={1000}
            rows={2}
            value={item.parasiteDescription ?? ""}
            aria-label={`Parasite description for ${item.commonName}`}
            onChange={(event) =>
              onChange(item.parasiteWaspCount, item.parasiteFlyCount, event.target.value)
            }
            placeholder="Add details about the parasitoid"
            className="min-h-16 resize-y text-sm"
          />
        </div>
      </div>
    </details>
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
