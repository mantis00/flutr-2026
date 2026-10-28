"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ROUTES } from "@/lib/routes";

import {
  ReleaseEditComposer,
  type ReleaseEditLossesByItem,
  type ReleaseEditLossField,
  type ReleaseEditLossValues,
  type ReleaseEditQuantities,
} from "@/components/tenant/releases/release-edit-composer";
import {
  computeReleaseEditBounds,
  ZERO_RELEASE_EDIT_LOSSES,
} from "@/components/tenant/releases/release-edit-capacity";
import type {
  ReleaseEventDetail,
  ShipmentDetailResponse,
} from "@/components/tenant/shipments/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return dateFormatter.format(date);
}

export default function EditReleasePage() {
  const params = useParams<{ institution: string; id: string; releaseId: string }>();
  const router = useRouter();
  const slug = params?.institution ?? "";
  const shipmentId = Number(params?.id);
  const releaseId = Number(params?.releaseId);

  const [release, setRelease] = useState<ReleaseEventDetail | null>(null);
  const [shipment, setShipment] = useState<ShipmentDetailResponse | null>(null);
  const [releaseValues, setReleaseValues] = useState<ReleaseEditQuantities>({});
  const [originalReleaseValues, setOriginalReleaseValues] = useState<ReleaseEditQuantities>({});
  const [lossValues, setLossValues] = useState<ReleaseEditLossesByItem>({});
  const [originalLossValues, setOriginalLossValues] = useState<ReleaseEditLossesByItem>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tenantHeaders = useMemo(() => ({ "x-tenant-slug": slug }), [slug]);
  const detailHref = ROUTES.tenant.shipmentById(slug, shipmentId);
  const errorMessageId = "release-edit-error-message";

  const handleGoBack = () => router.back();

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      setStatus("loading");
      setErrorMessage(null);
      try {
        const releaseRes = await fetch(`/api/tenant/releases/${releaseId}`, {
          headers: tenantHeaders,
          signal: ac.signal,
        });
        const releaseJson = await releaseRes.json().catch(() => null);
        if (!releaseRes.ok) {
          setStatus("error");
          setErrorMessage(releaseJson?.error?.message ?? "Failed to load release.");
          return;
        }

        // Defensive: the release_event must belong to the shipment in the URL.
        // The API already enforces tenant scoping, but mismatched ids would be
        // a bug worth surfacing rather than silently editing the wrong row.
        if (releaseJson.event.shipmentId !== shipmentId) {
          setStatus("error");
          setErrorMessage("This release does not belong to that shipment.");
          return;
        }

        const shRes = await fetch(`/api/tenant/shipments/${shipmentId}`, {
          headers: tenantHeaders,
          signal: ac.signal,
        });
        const shJson = await shRes.json().catch(() => null);
        if (!shRes.ok) {
          setStatus("error");
          setErrorMessage(shJson?.error?.message ?? "Failed to load shipment.");
          return;
        }

        setRelease(releaseJson);
        setShipment(shJson);

        const initialReleaseValues: ReleaseEditQuantities = {};
        for (const item of releaseJson.items as ReleaseEventDetail["items"]) {
          initialReleaseValues[item.shipmentItemId] = item.quantity;
        }

        const initialLossValues: ReleaseEditLossesByItem = {};
        for (const row of releaseJson.losses as ReleaseEventDetail["losses"]) {
          initialLossValues[row.shipmentItemId] = {
            damagedInTransit: row.damagedInTransit,
            diseasedInTransit: row.diseasedInTransit,
            parasite: row.parasite,
            nonEmergence: row.nonEmergence,
            poorEmergence: row.poorEmergence,
          };
        }

        setReleaseValues(initialReleaseValues);
        setOriginalReleaseValues(initialReleaseValues);
        setLossValues(initialLossValues);
        setOriginalLossValues(initialLossValues);
        setStatus("idle");
      } catch (err) {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
        setErrorMessage("Failed to load release.");
      }
    })();
    return () => ac.abort();
  }, [releaseId, shipmentId, tenantHeaders]);

  const handleReleaseChange = useCallback((itemId: number, quantity: number) => {
    setReleaseValues((current) => ({ ...current, [itemId]: quantity }));
  }, []);

  const handleLossChange = useCallback(
    (itemId: number, field: ReleaseEditLossField, quantity: number) => {
      setLossValues((current) => {
        const currentItem: ReleaseEditLossValues = current[itemId] ?? {
          damagedInTransit: 0,
          diseasedInTransit: 0,
          parasite: 0,
          nonEmergence: 0,
          poorEmergence: 0,
        };
        return {
          ...current,
          [itemId]: {
            ...currentItem,
            [field]: quantity,
          },
        };
      });
    },
    [],
  );

  const trackedItemIds = useMemo(() => {
    if (!release) return [];
    const ids = new Set<number>();
    for (const item of release.items) ids.add(item.shipmentItemId);
    for (const row of release.losses) ids.add(row.shipmentItemId);
    return Array.from(ids);
  }, [release]);

  const trackedItems = useMemo(() => {
    if (!shipment || trackedItemIds.length === 0) return [];
    const idSet = new Set(trackedItemIds);
    return shipment.items.filter((item) => idSet.has(item.id));
  }, [shipment, trackedItemIds]);

  const hasInfeasibleReleaseEditRange = useMemo(
    () =>
      trackedItems.some((item) => {
        const bounds = computeReleaseEditBounds({
          item,
          desiredLosses: lossValues[item.id] ?? ZERO_RELEASE_EDIT_LOSSES,
          originalLosses: originalLossValues[item.id] ?? ZERO_RELEASE_EDIT_LOSSES,
          originalRelease: originalReleaseValues[item.id] ?? 0,
        });
        return !bounds.isFeasible;
      }),
    [lossValues, originalLossValues, originalReleaseValues, trackedItems],
  );

  const totalReleased = useMemo(
    () => Object.values(releaseValues).reduce((acc, value) => acc + (value || 0), 0),
    [releaseValues],
  );

  const totalLosses = useMemo(
    () =>
      Object.values(lossValues).reduce(
        (acc, row) =>
          acc +
          row.damagedInTransit +
          row.diseasedInTransit +
          row.parasite +
          row.nonEmergence +
          row.poorEmergence,
        0,
      ),
    [lossValues],
  );

  const handleSave = async () => {
    if (!release) return;
    if (trackedItems.length === 0) {
      setErrorMessage("This release has no editable rows.");
      return;
    }
    if (hasInfeasibleReleaseEditRange) {
      setErrorMessage(
        "Shipment Received/loss accounting must be corrected before this release can be saved.",
      );
      return;
    }

    const items = trackedItems.map((item) => ({
      shipment_item_id: item.id,
      quantity: releaseValues[item.id] ?? 0,
    }));

    const losses = trackedItems.map((item) => {
      const row = lossValues[item.id] ?? {
        damagedInTransit: 0,
        diseasedInTransit: 0,
        parasite: 0,
        nonEmergence: 0,
        poorEmergence: 0,
      };
      return {
        shipment_item_id: item.id,
        damaged_in_transit: row.damagedInTransit,
        diseased_in_transit: row.diseasedInTransit,
        parasite: row.parasite,
        non_emergence: row.nonEmergence,
        poor_emergence: row.poorEmergence,
      };
    });

    const nextTotalReleased = items.reduce((sum, row) => sum + row.quantity, 0);
    const nextTotalLosses = losses.reduce(
      (sum, row) =>
        sum +
        row.damaged_in_transit +
        row.diseased_in_transit +
        row.parasite +
        row.non_emergence +
        row.poor_emergence,
      0,
    );

    if (nextTotalReleased === 0 && nextTotalLosses === 0) {
      setErrorMessage(
        "Release must include at least one in-flight or loss quantity. Delete release instead.",
      );
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/tenant/releases/${releaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...tenantHeaders },
        body: JSON.stringify({ items, losses }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(result?.error?.message ?? "Unable to update release.");
        return;
      }
      router.push(detailHref);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRelease = async () => {
    setDeleteOpen(false);
    setDeleting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/tenant/releases/${releaseId}`, {
        method: "DELETE",
        headers: tenantHeaders,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409) {
          setErrorMessage(
            result?.error?.message ??
              "Delete Release could not be completed because undo would reduce shipment loss totals below zero. Adjust shipment totals first, then retry.",
          );
          return;
        }
        setErrorMessage(result?.error?.message ?? "Unable to delete release.");
        return;
      }

      router.push(detailHref);
    } finally {
      setDeleting(false);
    }
  };

  // Bad URL ids — bail to the nearest not-found boundary instead of rendering
  // a custom error state.
  if (
    !Number.isFinite(shipmentId) ||
    shipmentId <= 0 ||
    !Number.isFinite(releaseId) ||
    releaseId <= 0
  ) {
    notFound();
  }

  if (status === "loading") {
    return (
      <div className="text-muted-foreground" role="status" aria-live="polite" aria-busy="true">
        Loading release…
      </div>
    );
  }
  if (status === "error" || !release || !shipment) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-destructive">{errorMessage ?? "Release not available."}</p>
        <Button variant="outline" onClick={handleGoBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-32">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" onClick={handleGoBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-3xl font-semibold">Edit release</h1>
        <p className="text-muted-foreground">
          {shipment.shipment.supplierCode} · Released {formatDate(release.event.releaseDate)} by{" "}
          {release.event.releasedBy}
        </p>
        <div className="mt-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={saving || deleting}
          >
            <Trash2 className="size-4" />
            Delete Release
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div id={errorMessageId} className="text-destructive text-sm" role="alert">
          {errorMessage}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Release quantities</CardTitle>
          <CardDescription>
            Adjust this release&apos;s in-flight and loss-attribution values. Loss fields are
            event-level quantities for this release only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReleaseEditComposer
            items={trackedItems}
            releaseValues={releaseValues}
            lossValues={lossValues}
            originalReleaseValues={originalReleaseValues}
            originalLossValues={originalLossValues}
            onReleaseChange={handleReleaseChange}
            onLossChange={handleLossChange}
            errorMessageId={errorMessage ? errorMessageId : undefined}
          />
        </CardContent>
      </Card>

      <div className="bg-background sticky bottom-0 -mx-4 border-t px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div>
            <div className="text-muted-foreground text-xs uppercase">This release</div>
            <div
              className="text-2xl font-semibold"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {totalReleased} released · {totalLosses} losses
            </div>
          </div>
          <Button
            size="lg"
            onClick={handleSave}
            disabled={
              saving ||
              deleting ||
              hasInfeasibleReleaseEditRange ||
              (totalReleased === 0 && totalLosses === 0)
            }
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this release?</AlertDialogTitle>
            <AlertDialogDescription>
              This will undo the in-flight quantities and event-attributed loss quantities recorded
              by this release. If shipment totals were edited later, delete can be blocked to
              prevent negative loss totals.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRelease} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Release"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
