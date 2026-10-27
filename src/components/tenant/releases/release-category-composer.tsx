"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SpeciesSearchToolbar,
  type SpeciesFilters,
} from "@/components/shared/species-search-toolbar";
import { useSpeciesSearch, type SpeciesItem } from "@/hooks/use-species-search";
import { SpeciesThumbnailStrip } from "@/components/tenant/releases/species-thumbnail-strip";
import { cn } from "@/lib/utils";

import { computeItemRemaining, type ShipmentItemRow } from "@/components/tenant/shipments/types";

export const RELEASE_CATEGORIES = [
  "goodEmergence",
  "poorEmergence",
  "diseased",
  "parasite",
  "nonEmergence",
] as const;

export type ReleaseCategory = (typeof RELEASE_CATEGORIES)[number];

export const EMERGENCE_CATEGORIES: ReleaseCategory[] = ["goodEmergence", "poorEmergence"];
export const LOSS_CATEGORIES: ReleaseCategory[] = ["diseased", "parasite", "nonEmergence"];

export const CATEGORY_LABELS: Record<ReleaseCategory, string> = {
  goodEmergence: "Good emergence",
  poorEmergence: "Poor emergence",
  diseased: "Diseased",
  parasite: "Parasite",
  nonEmergence: "No emergence",
};

const CATEGORY_SHORT: Record<ReleaseCategory, string> = {
  goodEmergence: "Good",
  poorEmergence: "Poor",
  diseased: "Diseased",
  parasite: "Parasite",
  nonEmergence: "No emerg.",
};

export type CategoryQuantities = Record<number, Partial<Record<ReleaseCategory, number>>>;

type ComposerMode = "emergence" | "other";

interface ReleaseCategoryComposerProps {
  items: ShipmentItemRow[];
  values: CategoryQuantities;
  onChange: (itemId: number, category: ReleaseCategory, value: number) => void;
}

type ComposerSpeciesItem = SpeciesItem & ShipmentItemRow & { baseRemaining: number };

function sumValues(values: Partial<Record<ReleaseCategory, number>> | undefined): number {
  if (!values) return 0;
  let total = 0;
  for (const value of Object.values(values)) {
    if (typeof value === "number") total += value;
  }
  return total;
}

/**
 * Multi-category composer used by the Create Release page. Each species row
 * shows two or three inline steppers depending on the active mode:
 *
 * - **Emergence** (default): Good Emergence + Poor Emergence
 * - **Other**: Diseased + Parasite + No Emergence
 *
 * A single mode toggle at the top swaps the visible steppers without losing
 * the values entered in the other mode. Good Emergence becomes the release
 * quantity; the other four buckets are recorded as losses on the shipment.
 */
export function ReleaseCategoryComposer({ items, values, onChange }: ReleaseCategoryComposerProps) {
  const [mode, setMode] = useState<ComposerMode>("emergence");
  // Toggle row pins to the top of the scroll area so the user can switch
  // categories without scrolling back up on long shipments.

  const adapted = useMemo<ComposerSpeciesItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        scientific_name: item.scientificName,
        common_name: item.commonName,
        family: "",
        baseRemaining: computeItemRemaining(item),
      })),
    [items],
  );

  // Only species that still have releasable butterflies are surfaced.
  const releasable = useMemo(() => adapted.filter((item) => item.baseRemaining > 0), [adapted]);

  // Paginated to keep large shipments (hundreds of species) performant. A
  // "Load more" button below the list reveals the next batch.
  const search = useSpeciesSearch<ComposerSpeciesItem>({
    items: releasable,
    pageSize: 24,
  });

  const visibleCategories = mode === "emergence" ? EMERGENCE_CATEGORIES : LOSS_CATEGORIES;

  return (
    <div className="space-y-4">
      <div className="bg-card sticky top-0 z-20 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(next) => {
            // Radix returns "" when the user clicks the active item; ignore it
            // so the toggle always reflects a real mode.
            if (next === "emergence" || next === "other") setMode(next);
          }}
          variant="outline"
          aria-label="Stepper mode"
        >
          <ToggleGroupItem value="emergence">Emergence</ToggleGroupItem>
          <ToggleGroupItem value="other">Other</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-muted-foreground text-xs">
          {mode === "emergence"
            ? "Set Good and Poor emergence counts. Good releases the butterflies."
            : "Set Diseased, Parasite, and No-emergence counts."}
        </p>
      </div>

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
          No butterflies are available to release in this shipment.
        </div>
      ) : (
        <ul className="grid gap-3">
          {search.visibleResults.map((item) => {
            const itemValues = values[item.id];
            const allocatedAcrossCategories = sumValues(itemValues);
            const remainingHeadroom = Math.max(0, item.baseRemaining - allocatedAcrossCategories);
            const headroomDescribedBy = `release-headroom-${item.id}`;

            return (
              <li
                key={item.id}
                className="bg-card flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <SpeciesThumbnailStrip images={item.images} profile={mode} />
                  <div className="min-w-0">
                    <div className="truncate text-base font-medium">{item.commonName}</div>
                    <div className="text-muted-foreground truncate text-sm italic">
                      {item.scientificName}
                    </div>
                    <CategorySummary
                      values={itemValues}
                      remaining={item.baseRemaining}
                      allocated={allocatedAcrossCategories}
                    />
                  </div>
                </div>

                <div
                  className={cn(
                    "grid w-full gap-3 md:w-auto",
                    visibleCategories.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3",
                  )}
                >
                  {visibleCategories.map((category) => {
                    const ownValue = itemValues?.[category] ?? 0;
                    // Cap = baseRemaining minus everything allocated elsewhere.
                    // Adding back ownValue lets the user adjust their own field
                    // without bumping into a self-imposed ceiling.
                    const cap = Math.max(
                      0,
                      item.baseRemaining - allocatedAcrossCategories + ownValue,
                    );
                    return (
                      <CategoryStepper
                        key={category}
                        label={CATEGORY_LABELS[category]}
                        value={ownValue}
                        cap={cap}
                        onChange={(next) => onChange(item.id, category, next)}
                        ariaLabel={`${CATEGORY_LABELS[category]} for ${item.commonName}`}
                        ariaDescribedBy={headroomDescribedBy}
                        disabled={cap === 0 && ownValue === 0}
                      />
                    );
                  })}
                </div>

                <span id={headroomDescribedBy} className="sr-only">
                  {remainingHeadroom} remaining for this species
                </span>
              </li>
            );
          })}
        </ul>
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

interface CategoryStepperProps {
  label: string;
  value: number;
  cap: number;
  ariaLabel: string;
  ariaDescribedBy?: string;
  onChange: (next: number) => void;
  disabled?: boolean;
}

/**
 * Compact label + −/input/+ control. No Clear / All — the user explicitly
 * asked to remove those buttons from the release composer.
 */
function CategoryStepper({
  label,
  value,
  cap,
  ariaLabel,
  ariaDescribedBy,
  onChange,
  disabled,
}: CategoryStepperProps) {
  const clamp = (next: number) => {
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, Math.min(cap, Math.floor(next)));
  };

  return (
    <div className="flex flex-col items-stretch gap-1">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-10 shrink-0"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= cap}
          aria-label={`Increase ${ariaLabel}`}
        >
          <Plus className="size-4" />
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
          disabled={disabled}
          className={cn(
            "h-10 w-16 text-center text-base font-semibold",
            value > 0 && "border-primary",
          )}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-10 shrink-0"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value === 0}
          aria-label={`Decrease ${ariaLabel}`}
        >
          <Minus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

interface CategorySummaryProps {
  values: Partial<Record<ReleaseCategory, number>> | undefined;
  remaining: number;
  allocated: number;
}

/** Shows the per-species cap and any non-zero allocations from either mode. */
function CategorySummary({ values, remaining, allocated }: CategorySummaryProps) {
  const populated = RELEASE_CATEGORIES.filter((category) => (values?.[category] ?? 0) > 0);

  return (
    <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <span>
        Allocated {allocated} / {remaining}
      </span>
      {populated.length > 0 && <span aria-hidden="true">·</span>}
      {populated.map((category, index) => (
        <span key={category}>
          {CATEGORY_SHORT[category]}: {values?.[category] ?? 0}
          {index < populated.length - 1 && ","}
        </span>
      ))}
    </div>
  );
}
