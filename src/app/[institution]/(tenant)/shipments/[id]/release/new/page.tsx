"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnlyForDisplay } from "@/lib/date-only";
import { ROUTES } from "@/lib/routes";

import {
  CATEGORY_LABELS,
  RELEASE_CATEGORIES,
  ReleaseCategoryComposer,
  type CategoryQuantities,
  type ReleaseCategory,
} from "@/components/tenant/releases/release-category-composer";
import {
  computeItemRemaining,
  type ShipmentDetailResponse,
  type ShipmentItemRow,
} from "@/components/tenant/shipments/types";

function sumCategories(values: CategoryQuantities[number] | undefined): number {
  if (!values) return 0;
  let total = 0;
  for (const value of Object.values(values)) {
    if (typeof value === "number") total += value;
  }
  return total;
}

export default function CreateReleasePage() {
  const params = useParams<{ institution: string; id: string }>();
  const router = useRouter();
  const slug = params?.institution ?? "";
  const shipmentId = Number(params?.id);

  const [data, setData] = useState<ShipmentDetailResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [values, setValues] = useState<CategoryQuantities>({});
  const [submitting, setSubmitting] = useState(false);

  const tenantHeaders = useMemo(() => ({ "x-tenant-slug": slug }), [slug]);
  const detailHref = ROUTES.tenant.shipmentById(slug, shipmentId);

  const handleGoBack = () => router.back();

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      setStatus("loading");
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/tenant/shipments/${shipmentId}`, {
          headers: tenantHeaders,
          signal: ac.signal,
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          setStatus("error");
          setErrorMessage(result?.error?.message ?? "Failed to load shipment.");
          return;
        }
        setData(result);
        setStatus("idle");
      } catch (err) {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
        setErrorMessage("Failed to load shipment.");
      }
    })();
    return () => ac.abort();
  }, [shipmentId, tenantHeaders]);

  const handleChange = useCallback((itemId: number, category: ReleaseCategory, value: number) => {
    setValues((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? {}), [category]: value },
    }));
  }, []);

  /** Per-category totals across the whole shipment, for the sticky bar. */
  const categoryTotals = useMemo(() => {
    const totals: Record<ReleaseCategory, number> = {
      goodEmergence: 0,
      poorEmergence: 0,
      diseased: 0,
      parasite: 0,
      nonEmergence: 0,
    };
    for (const itemValues of Object.values(values)) {
      for (const category of RELEASE_CATEGORIES) {
        totals[category] += itemValues?.[category] ?? 0;
      }
    }
    return totals;
  }, [values]);

  const totalGood = categoryTotals.goodEmergence;
  const totalAllocated = useMemo(
    () => Object.values(categoryTotals).reduce((acc, value) => acc + value, 0),
    [categoryTotals],
  );

  /** Validate that no item has been over-allocated relative to its cap. */
  const validate = useCallback((): string | null => {
    if (!data) return "Shipment not loaded yet.";
    if (totalAllocated === 0) {
      return "Set at least one category quantity before saving.";
    }
    for (const item of data.items) {
      const allocated = sumCategories(values[item.id]);
      const cap = computeItemRemaining(item);
      if (allocated > cap) {
        return `${item.commonName}: allocated ${allocated} but only ${cap} remain.`;
      }
    }
    return null;
  }, [data, totalAllocated, values]);

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (!data) return;

    // Build the release items from Good Emergence and a single atomic
    // loss_updates payload from all loss category buckets. The backend
    // applies loss corrections and creates the release event inside one
    // transaction so a partial failure cannot leave losses persisted
    // without a release event.
    const releaseItems = Object.entries(values)
      .map(([id, itemValues]) => ({
        shipment_item_id: Number(id),
        quantity: itemValues?.goodEmergence ?? 0,
      }))
      .filter((row) => row.quantity > 0);

    const lossUpdates = data.items
      .map((item) => buildLossUpdate(item, values[item.id]))
      .filter((row): row is NonNullable<ReturnType<typeof buildLossUpdate>> => row !== null);

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const releaseResponse = await fetch(`/api/tenant/shipments/${shipmentId}/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tenantHeaders },
        body: JSON.stringify({
          items: releaseItems,
          ...(lossUpdates.length > 0 ? { loss_updates: lossUpdates } : {}),
        }),
      });
      if (!releaseResponse.ok) {
        const result = await releaseResponse.json().catch(() => null);
        setErrorMessage(result?.error?.message ?? "Unable to save release.");
        return;
      }

      router.push(detailHref);
    } finally {
      setSubmitting(false);
    }
  };

  // Bad URL ids — bail to the nearest not-found boundary instead of rendering
  // a custom error state.
  if (!Number.isFinite(shipmentId) || shipmentId <= 0) {
    notFound();
  }

  if (status === "loading") {
    return (
      <div className="text-muted-foreground" role="status" aria-live="polite" aria-busy="true">
        Loading shipment…
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-destructive">{errorMessage ?? "Shipment not available."}</p>
        <Button variant="outline" onClick={handleGoBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
    );
  }

  // -mb-6 lets the page-root's padding box reach the wrapper layout's padding
  // box bottom, so the sticky footer below stays pinned to the very bottom of
  // `main` even at maximum scroll (without it the footer rises by the
  // wrapper's py-6 at the end of the page).
  return (
    <div className="-mb-6 flex flex-col gap-6 pb-32">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" onClick={handleGoBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-3xl font-semibold">New release</h1>
        <p className="text-muted-foreground">
          {data.shipment.supplierCode} · Shipped{" "}
          {formatDateOnlyForDisplay(data.shipment.shipmentDate)} · Arrived{" "}
          {formatDateOnlyForDisplay(data.shipment.arrivalDate)}
        </p>
      </div>

      {errorMessage && (
        <div className="text-destructive text-sm" role="alert">
          {errorMessage}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sort the butterflies</CardTitle>
          <CardDescription>
            Tap a category, then set per-species counts. Good Emergence will be released; the other
            categories are recorded as losses on the shipment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReleaseCategoryComposer items={data.items} values={values} onChange={handleChange} />
        </CardContent>
      </Card>

      <div className="bg-background sticky bottom-0 -mx-4 border-t px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <ReleaseSummary totalGood={totalGood} categoryTotals={categoryTotals} />
          <Button size="lg" onClick={handleSubmit} disabled={submitting || totalAllocated === 0}>
            {submitting ? "Saving…" : "Save release"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact summary of what the release will save: a prominent "Releasing N"
 * primary line plus a muted per-category breakdown for any "Other" buckets
 * that have been allocated. Lives next to the Save button in the sticky
 * footer so the user can confirm totals at a glance.
 */
function ReleaseSummary({
  totalGood,
  categoryTotals,
}: {
  totalGood: number;
  categoryTotals: Record<ReleaseCategory, number>;
}) {
  const populatedOther = RELEASE_CATEGORIES.filter(
    (c) => c !== "goodEmergence" && categoryTotals[c] > 0,
  );

  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl leading-none font-semibold tabular-nums">{totalGood}</span>
        <span className="text-muted-foreground text-sm">
          {totalGood === 1 ? "butterfly to release" : "butterflies to release"}
        </span>
      </div>
      {populatedOther.length > 0 && (
        <p className="text-muted-foreground truncate text-xs">
          +{" "}
          {populatedOther
            .map((category) => `${CATEGORY_LABELS[category]} ${categoryTotals[category]}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * Build a `loss_updates` payload row for a single shipment item if any of its
 * loss categories were touched. The backend accepts absolute new values and
 * applies them inside the release transaction, so we send the existing loss
 * column plus the newly composed delta.
 */
function buildLossUpdate(
  item: ShipmentItemRow,
  itemValues: CategoryQuantities[number] | undefined,
): {
  shipment_item_id: number;
  diseased_in_transit: number;
  parasite: number;
  non_emergence: number;
  poor_emergence: number;
} | null {
  if (!itemValues) return null;

  const deltas = {
    diseased: itemValues.diseased ?? 0,
    parasite: itemValues.parasite ?? 0,
    nonEmergence: itemValues.nonEmergence ?? 0,
    poorEmergence: itemValues.poorEmergence ?? 0,
  };

  const hasAnyLoss = Object.values(deltas).some((value) => value > 0);
  if (!hasAnyLoss) return null;

  return {
    shipment_item_id: item.id,
    diseased_in_transit: item.diseasedInTransit + deltas.diseased,
    parasite: item.parasite + deltas.parasite,
    non_emergence: item.nonEmergence + deltas.nonEmergence,
    poor_emergence: item.poorEmergence + deltas.poorEmergence,
  };
}
