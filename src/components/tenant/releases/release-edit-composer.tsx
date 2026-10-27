"use client";

import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SpeciesSearchToolbar,
  type SpeciesFilters,
} from "@/components/shared/species-search-toolbar";
import { useSpeciesSearch, type SpeciesItem } from "@/hooks/use-species-search";
import { SpeciesThumbnailStrip } from "@/components/tenant/releases/species-thumbnail-strip";

import { type ShipmentItemRow } from "@/components/tenant/shipments/types";

export type ReleaseEditQuantities = Record<number, number>;

export type ReleaseEditLossField =
  | "damagedInTransit"
  | "diseasedInTransit"
  | "parasite"
  | "nonEmergence"
  | "poorEmergence";

export type ReleaseEditLossValues = Record<ReleaseEditLossField, number>;
export type ReleaseEditLossesByItem = Record<number, ReleaseEditLossValues>;

interface ReleaseEditComposerProps {
  items: ShipmentItemRow[];
  releaseValues: ReleaseEditQuantities;
  lossValues: ReleaseEditLossesByItem;
  originalReleaseValues: ReleaseEditQuantities;
  originalLossValues: ReleaseEditLossesByItem;
  onReleaseChange: (itemId: number, quantity: number) => void;
  onLossChange: (itemId: number, field: ReleaseEditLossField, quantity: number) => void;
  errorMessageId?: string;
}

type ComposerSpeciesItem = SpeciesItem & ShipmentItemRow;

const ZERO_LOSSES: ReleaseEditLossValues = {
  damagedInTransit: 0,
  diseasedInTransit: 0,
  parasite: 0,
  nonEmergence: 0,
  poorEmergence: 0,
};

const LOSS_FIELDS: Array<{ field: ReleaseEditLossField; label: string; shortLabel: string }> = [
  { field: "damagedInTransit", label: "Damaged", shortLabel: "Damaged" },
  { field: "diseasedInTransit", label: "Diseased", shortLabel: "Diseased" },
  { field: "parasite", label: "Parasite", shortLabel: "Parasite" },
  { field: "nonEmergence", label: "No emergence", shortLabel: "No emergence" },
  { field: "poorEmergence", label: "Poor emergence", shortLabel: "Poor emergence" },
];

function getLossValues(
  map: ReleaseEditLossesByItem,
  shipmentItemId: number,
): ReleaseEditLossValues {
  return map[shipmentItemId] ?? ZERO_LOSSES;
}

function sumLosses(values: ReleaseEditLossValues) {
  return (
    values.damagedInTransit +
    values.diseasedInTransit +
    values.parasite +
    values.nonEmergence +
    values.poorEmergence
  );
}

function clampNonNegativeInteger(next: number) {
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.floor(next));
}

/**
 * Compute the max in-flight quantity for this edit row so the UI reflects the
 * same core invariant the backend validates after applying event-level loss
 * deltas: desired in-flight must be <= remaining for the shipment item.
 */
function computeReleaseCap(params: {
  item: ShipmentItemRow;
  desiredLosses: ReleaseEditLossValues;
  originalLosses: ReleaseEditLossValues;
  originalRelease: number;
}) {
  const { item, desiredLosses, originalLosses, originalRelease } = params;

  const currentShipmentLossTotal =
    item.emergedInTransit +
    item.damagedInTransit +
    item.diseasedInTransit +
    item.parasite +
    item.nonEmergence +
    item.poorEmergence;

  const originalEventLossTotal = sumLosses(originalLosses);
  const desiredEventLossTotal = sumLosses(desiredLosses);
  const shipmentLossesOutsideEvent = Math.max(0, currentShipmentLossTotal - originalEventLossTotal);
  const releasedOutsideEvent = Math.max(0, item.inFlightQuantity - originalRelease);

  const cap =
    item.numberReceived - shipmentLossesOutsideEvent - desiredEventLossTotal - releasedOutsideEvent;

  return Math.max(0, cap);
}

/**
 * Compute a per-loss-field cap that keeps the row internally consistent with
 * the selected in-flight quantity for this release event.
 */
function computeLossFieldCap(params: {
  item: ShipmentItemRow;
  field: ReleaseEditLossField;
  desiredRelease: number;
  desiredLosses: ReleaseEditLossValues;
  originalLosses: ReleaseEditLossValues;
  originalRelease: number;
}) {
  const { item, field, desiredRelease, desiredLosses, originalLosses, originalRelease } = params;

  const currentShipmentLossTotal =
    item.emergedInTransit +
    item.damagedInTransit +
    item.diseasedInTransit +
    item.parasite +
    item.nonEmergence +
    item.poorEmergence;

  const originalEventLossTotal = sumLosses(originalLosses);
  const shipmentLossesOutsideEvent = Math.max(0, currentShipmentLossTotal - originalEventLossTotal);
  const releasedOutsideEvent = Math.max(0, item.inFlightQuantity - originalRelease);

  const desiredLossesExcludingField = sumLosses(desiredLosses) - desiredLosses[field];
  const cap =
    item.numberReceived -
    releasedOutsideEvent -
    shipmentLossesOutsideEvent -
    desiredRelease -
    desiredLossesExcludingField;

  return Math.max(0, cap);
}

interface CompactStepperProps {
  label: string;
  value: number;
  cap: number;
  ariaLabel: string;
  ariaDescribedBy?: string;
  onChange: (next: number) => void;
}

function CompactStepper({
  label,
  value,
  cap,
  ariaLabel,
  ariaDescribedBy,
  onChange,
}: CompactStepperProps) {
  const clamp = (next: number) => Math.max(0, Math.min(cap, clampNonNegativeInteger(next)));

  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-[11px] font-medium xl:hidden">{label}</div>
      <div className="inline-flex w-full items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8 shrink-0"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= cap}
          aria-label={`Increase ${ariaLabel}`}
        >
          <Plus className="size-3.5" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={cap}
          step={1}
          value={value}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          className="h-8 w-full min-w-16 px-1 text-center text-sm tabular-nums"
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8 shrink-0"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= 0}
          aria-label={`Decrease ${ariaLabel}`}
        >
          <Minus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Compact edit composer for release events:
 * - Desktop: row/card with species column + six compact quantity columns.
 * - Mobile: species card with stacked category controls underneath.
 */
export function ReleaseEditComposer({
  items,
  releaseValues,
  lossValues,
  originalReleaseValues,
  originalLossValues,
  onReleaseChange,
  onLossChange,
  errorMessageId,
}: ReleaseEditComposerProps) {
  const adapted = useMemo<ComposerSpeciesItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        scientific_name: item.scientificName,
        common_name: item.commonName,
        family: "",
      })),
    [items],
  );

  const search = useSpeciesSearch<ComposerSpeciesItem>({
    items: adapted,
    pageSize: 24,
  });

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

      {search.visibleResults.length === 0 ? (
        <div className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          No butterflies in this release match your filters.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-muted-foreground hidden grid-cols-[minmax(230px,2fr)_repeat(6,minmax(100px,1fr))] gap-2 px-3 text-[11px] font-medium tracking-wide uppercase xl:grid">
            <div>Species</div>
            <div className="text-center">Released</div>
            {LOSS_FIELDS.map((column) => (
              <div key={column.field} className="text-center">
                {column.shortLabel}
              </div>
            ))}
          </div>

          <ul className="grid gap-2">
            {search.visibleResults.map((item) => {
              const desiredRelease = releaseValues[item.id] ?? 0;
              const originalRelease = originalReleaseValues[item.id] ?? 0;
              const desiredLosses = getLossValues(lossValues, item.id);
              const originalLosses = getLossValues(originalLossValues, item.id);
              const desiredLossTotal = sumLosses(desiredLosses);
              const releaseCap = computeReleaseCap({
                item,
                desiredLosses,
                originalLosses,
                originalRelease,
              });

              return (
                <li
                  key={item.id}
                  className="bg-card grid gap-3 rounded-lg border p-3 xl:grid-cols-[minmax(230px,2fr)_repeat(6,minmax(100px,1fr))] xl:items-center xl:gap-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <SpeciesThumbnailStrip images={item.images} profile="compact" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.commonName}</div>
                      <div className="text-muted-foreground truncate text-xs italic">
                        {item.scientificName}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {desiredRelease} released · {desiredLossTotal} losses
                      </div>
                    </div>
                  </div>

                  <CompactStepper
                    label="Released"
                    value={desiredRelease}
                    cap={releaseCap}
                    ariaLabel={`Released quantity for ${item.commonName}`}
                    ariaDescribedBy={errorMessageId}
                    onChange={(next) => onReleaseChange(item.id, next)}
                  />

                  {LOSS_FIELDS.map(({ field, label }) => {
                    const value = desiredLosses[field];
                    const fieldCap = computeLossFieldCap({
                      item,
                      field,
                      desiredRelease,
                      desiredLosses,
                      originalLosses,
                      originalRelease,
                    });
                    return (
                      <CompactStepper
                        key={field}
                        label={label}
                        value={value}
                        cap={fieldCap}
                        ariaLabel={`${label} quantity for ${item.commonName}`}
                        ariaDescribedBy={errorMessageId}
                        onChange={(next) => onLossChange(item.id, field, next)}
                      />
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {search.hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={search.loadMore}
            aria-label="Load more butterfly species"
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
