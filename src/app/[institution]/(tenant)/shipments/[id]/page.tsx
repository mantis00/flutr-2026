"use client";

import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";

import { Link } from "@/components/ui/link";
import { formatDateOnlyForDisplay } from "@/lib/date-only";
import { logger } from "@/lib/logger";
import { ROUTES } from "@/lib/routes";
import { hasPermission } from "@/lib/permissions";

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

import { ShipmentItemsTable } from "@/components/tenant/shipments/shipment-items-table";
import { SpeciesPickerDialog } from "@/components/tenant/shipments/species-picker-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  computeItemRemaining,
  type ReleaseHistoryRow,
  type ShipmentDetailResponse,
  type ShipmentItemRow,
  type SpeciesPickerOption,
} from "@/components/tenant/shipments/types";
import type { SpeciesImage } from "@/lib/wingspan/images";

const releaseDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function formatReleaseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return releaseDateFormatter.format(date);
}

type MetricKey =
  | "numberReceived"
  | "emergedInTransit"
  | "damagedInTransit"
  | "diseasedInTransit"
  | "parasite"
  | "nonEmergence"
  | "poorEmergence";

const METRIC_TO_API: Record<MetricKey, string> = {
  numberReceived: "number_received",
  emergedInTransit: "emerged_in_transit",
  damagedInTransit: "damaged_in_transit",
  diseasedInTransit: "diseased_in_transit",
  parasite: "parasite",
  nonEmergence: "non_emergence",
  poorEmergence: "poor_emergence",
};

export default function ShipmentDetailPage() {
  const params = useParams<{ institution: string; id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const canDelete = hasPermission(session?.user?.role ?? "", "DELETE_SHIPMENT");
  const slug = params?.institution ?? "";
  const shipmentId = Number(params?.id);

  const [data, setData] = useState<ShipmentDetailResponse | null>(null);
  const [releases, setReleases] = useState<ReleaseHistoryRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [forceEditPrompted, setForceEditPrompted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<ShipmentItemRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Species catalog for the picker is lazy-loaded the first time the user
  // opens it from edit mode. We keep it in state so re-opening is instant.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [species, setSpecies] = useState<SpeciesPickerOption[]>([]);
  const [speciesLoaded, setSpeciesLoaded] = useState(false);

  // Counter for temporary IDs assigned to newly added (unsaved) items.
  // Real shipment item ids are positive serials, so negative ids are an
  // unambiguous "this is a draft, send via add_items" marker.
  const tempIdCounter = useRef(0);

  const tenantHeaders = useMemo(() => ({ "x-tenant-slug": slug }), [slug]);

  const loadShipment = useCallback(
    async (signal?: AbortSignal) => {
      setStatus("loading");
      setErrorMessage(null);
      try {
        // Fetch the shipment + its release history in parallel. The release
        // endpoint already returns totalReleased per event so the history table
        // can render without an extra round-trip.
        const [detailResponse, releasesResponse] = await Promise.all([
          fetch(`/api/tenant/shipments/${shipmentId}`, { headers: tenantHeaders, signal }),
          fetch(`/api/tenant/shipments/${shipmentId}/releases`, {
            headers: tenantHeaders,
            signal,
          }),
        ]);

        const detailResult = await detailResponse.json().catch(() => null);
        if (signal?.aborted) return;
        if (!detailResponse.ok) {
          setStatus("error");
          setErrorMessage(detailResult?.error?.message ?? "Failed to load shipment.");
          return;
        }
        setData(detailResult);
        setDraftItems(detailResult.items ?? []);

        // Releases are non-essential — if they fail to load, surface the
        // shipment anyway and just leave the history empty.
        if (releasesResponse.ok) {
          const releasesResult = await releasesResponse.json().catch(() => null);
          if (signal?.aborted) return;
          const events = Array.isArray(releasesResult?.releaseEvents)
            ? (releasesResult.releaseEvents as ReleaseHistoryRow[]).map((row) => ({
                ...row,
                totalLosses: Number(row.totalLosses ?? 0),
              }))
            : [];
          setReleases(events);
        } else {
          setReleases([]);
        }

        setStatus("idle");
      } catch (err) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setStatus("error");
        setErrorMessage("Failed to load shipment.");
      }
    },
    [shipmentId, tenantHeaders],
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadShipment(ac.signal);
    return () => ac.abort();
  }, [loadShipment]);

  const totals = useMemo(() => {
    const items = data?.items ?? [];
    const totalReceived = items.reduce((acc, item) => acc + item.numberReceived, 0);
    const totalLosses = items.reduce(
      (acc, item) =>
        acc +
        item.emergedInTransit +
        item.damagedInTransit +
        item.diseasedInTransit +
        item.parasite +
        item.nonEmergence +
        item.poorEmergence,
      0,
    );
    const totalReleased = items.reduce((acc, item) => acc + item.inFlightQuantity, 0);
    const remaining = items.reduce((acc, item) => acc + computeItemRemaining(item), 0);
    return {
      totalReceived,
      totalLosses,
      totalReleased,
      remaining,
      isCompleted: items.length > 0 && remaining === 0,
    };
  }, [data]);

  const speciesAbortRef = useRef<AbortController | null>(null);

  const loadSpecies = useCallback(async () => {
    if (speciesLoaded) return;
    speciesAbortRef.current?.abort();
    const ac = new AbortController();
    speciesAbortRef.current = ac;
    try {
      const response = await fetch("/api/tenant/species", {
        headers: tenantHeaders,
        signal: ac.signal,
      });
      const result = await response.json().catch(() => null);
      if (ac.signal.aborted) return;
      const rows = Array.isArray(result?.species) ? result.species : [];
      const options: SpeciesPickerOption[] = rows
        .map(
          (row: {
            id?: number;
            scientificName?: string;
            commonName?: string;
            commonNameOverride?: string;
            family?: string;
            images?: SpeciesImage[];
          }) => {
            const id = typeof row.id === "number" ? row.id : Number(row.id);
            const sci = (row.scientificName ?? "").trim();
            if (!Number.isFinite(id) || id <= 0 || !sci) return null;
            const common =
              (row.commonNameOverride ?? "").trim() || (row.commonName ?? "").trim() || sci;
            return {
              id,
              scientificName: sci,
              commonName: common,
              family: (row.family ?? "").trim() || "—",
              images: row.images ?? [],
            };
          },
        )
        .filter((row: SpeciesPickerOption | null): row is SpeciesPickerOption => row !== null);
      setSpecies(options);
      setSpeciesLoaded(true);
    } catch (error) {
      if (ac.signal.aborted) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Picker will show an empty list; user can close and reopen to retry.
      logger.error("Failed to load species for picker:", error);
    }
  }, [speciesLoaded, tenantHeaders]);

  useEffect(() => {
    return () => speciesAbortRef.current?.abort();
  }, []);

  const handleStartEditing = () => {
    setForceEditPrompted(false);
    setDraftItems(data?.items ?? []);
    setEditing(true);
  };

  const handleCancelEditing = () => {
    setEditing(false);
    setDraftItems(data?.items ?? []);
    // Reset the temp id counter so a fresh edit session starts at -1.
    tempIdCounter.current = 0;
  };

  const handleOpenPicker = () => {
    void loadSpecies();
    setPickerOpen(true);
  };

  const handlePickerConfirm = useCallback((chosen: SpeciesPickerOption[]) => {
    setDraftItems((current) => {
      const existingSpeciesIds = new Set(current.map((item) => item.butterflySpeciesId));
      const additions: ShipmentItemRow[] = chosen
        .filter((option) => !existingSpeciesIds.has(option.id))
        .map((option) => {
          tempIdCounter.current -= 1;
          return {
            id: tempIdCounter.current,
            butterflySpeciesId: option.id,
            scientificName: option.scientificName,
            commonName: option.commonName,
            images: option.images,
            numberReceived: 0,
            emergedInTransit: 0,
            damagedInTransit: 0,
            diseasedInTransit: 0,
            parasite: 0,
            nonEmergence: 0,
            poorEmergence: 0,
            inFlightQuantity: 0,
          };
        });
      return [...current, ...additions];
    });
  }, []);

  const handleMetricChange = useCallback((itemId: number, field: MetricKey, value: number) => {
    setDraftItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    );
  }, []);

  const handleRemoveDraftItem = useCallback((itemId: number) => {
    setDraftItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const handleSave = async () => {
    if (!data) return;

    const original = new Map(data.items.map((item) => [item.id, item]));
    // Only consider real (positive id) draft rows when computing deletions —
    // negative ids are session-local additions, not existing rows.
    const existingDraftIds = new Set(
      draftItems.filter((item) => item.id > 0).map((item) => item.id),
    );

    const updateItems = draftItems
      .filter((draft) => {
        if (draft.id <= 0) return false;
        const orig = original.get(draft.id);
        if (!orig) return false;
        return (Object.keys(METRIC_TO_API) as MetricKey[]).some((k) => orig[k] !== draft[k]);
      })
      .map((draft) => ({
        id: draft.id,
        number_received: draft.numberReceived,
        emerged_in_transit: draft.emergedInTransit,
        damaged_in_transit: draft.damagedInTransit,
        diseased_in_transit: draft.diseasedInTransit,
        parasite: draft.parasite,
        non_emergence: draft.nonEmergence,
        poor_emergence: draft.poorEmergence,
      }));

    const addItems = draftItems
      .filter((draft) => draft.id <= 0)
      .map((draft) => ({
        butterfly_species_id: draft.butterflySpeciesId,
        number_received: draft.numberReceived,
        emerged_in_transit: draft.emergedInTransit,
        damaged_in_transit: draft.damagedInTransit,
        diseased_in_transit: draft.diseasedInTransit,
        parasite: draft.parasite,
        non_emergence: draft.nonEmergence,
        poor_emergence: draft.poorEmergence,
      }));

    const deleteItems = data.items
      .filter((item) => !existingDraftIds.has(item.id))
      .map((item) => item.id);

    if (updateItems.length === 0 && addItems.length === 0 && deleteItems.length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      const body: Record<string, unknown> = {};
      if (updateItems.length > 0) body.update_items = updateItems;
      if (addItems.length > 0) body.add_items = addItems;
      if (deleteItems.length > 0) body.delete_items = deleteItems;

      const response = await fetch(`/api/tenant/shipments/${shipmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...tenantHeaders },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(result?.error?.message ?? "Unable to save changes.");
        return;
      }
      setEditing(false);
      tempIdCounter.current = 0;
      await loadShipment();
      // loadShipment without a signal is fine here — the post-save reload
      // is short-lived and intentionally outlives the original effect.
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!canDelete || deleting) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/tenant/shipments/${shipmentId}`, {
        method: "DELETE",
        headers: tenantHeaders,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setDeleteOpen(false);
        setErrorMessage(result?.error?.message ?? "Unable to delete shipment.");
        return;
      }
      setDeleteOpen(false);
      router.push(ROUTES.tenant.shipments(slug));
    } catch {
      setDeleteOpen(false);
      setErrorMessage("Unable to delete shipment.");
    } finally {
      setDeleting(false);
    }
  };

  // Bad URL ids — bail to the nearest not-found boundary instead of showing a
  // bespoke "invalid id" message inside the tenant shell.
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
        <Button asChild variant="outline">
          <Link href={ROUTES.tenant.shipments(slug)}>
            <ArrowLeft className="size-4" />
            Back to shipments
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={ROUTES.tenant.shipments(slug)}>
              <ArrowLeft className="size-4" />
              All shipments
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold">Shipment from {data.shipment.supplierCode}</h1>
          <p className="text-muted-foreground">
            Shipped {formatDateOnlyForDisplay(data.shipment.shipmentDate)} · Arrived{" "}
            {formatDateOnlyForDisplay(data.shipment.arrivalDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!editing && !totals.isCompleted && data.items.length > 0 && (
            <Button asChild>
              <Link href={ROUTES.tenant.shipmentReleaseNew(slug, shipmentId)}>Add release</Link>
            </Button>
          )}
          {!editing && (
            <Button variant="outline" onClick={() => setForceEditPrompted(true)}>
              <Pencil className="size-4" />
              Edit items
            </Button>
          )}
          {!editing && canDelete && (
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden="true" className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card className="gap-1 py-3">
          <CardHeader className="px-3">
            <CardDescription className="text-xs">Status</CardDescription>
          </CardHeader>
          <CardContent className="px-3">
            <div className="text-base font-semibold">
              {totals.isCompleted ? "Completed" : `${totals.remaining} remaining`}
            </div>
          </CardContent>
        </Card>
        <SummaryCard label="Received" value={totals.totalReceived} />
        <SummaryCard label="Losses" value={totals.totalLosses} />
        <SummaryCard label="Released" value={totals.totalReleased} />
      </div>

      {errorMessage && (
        <div className="text-destructive text-sm" role="alert">
          {errorMessage}
        </div>
      )}

      <Card>
        {/*
          Sticky so the title and (most importantly) the Save / Cancel buttons
          remain visible while the user scrolls through a long species list.
          The nearest scroll ancestor is the tenant `<main>` so `top-0` pins
          this just below the tenant header.
        */}
        <CardHeader className="bg-card sticky top-0 z-10 flex flex-row items-center justify-between gap-4 space-y-0 rounded-t-xl border-b">
          <div>
            <CardTitle>Butterflies</CardTitle>
            <CardDescription>
              {editing
                ? "Editing the shipment items directly. Be careful — this bypasses release tracking."
                : "Search and review the species in this shipment."}
            </CardDescription>
          </div>
          {editing && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={handleOpenPicker} disabled={saving}>
                <Plus className="size-4" />
                Add butterflies
              </Button>
              <Button variant="outline" onClick={handleCancelEditing} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <ShipmentItemsTable
            items={editing ? draftItems : data.items}
            editing={editing}
            onMetricChange={handleMetricChange}
            onRemoveItem={handleRemoveDraftItem}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Release history</CardTitle>
          <CardDescription>
            All releases recorded against this shipment, newest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {releases.length === 0 ? (
            <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
              No releases yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Release date</TableHead>
                    <TableHead>Released by</TableHead>
                    <TableHead className="text-right">Released</TableHead>
                    <TableHead className="text-right">Losses</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releases.map((release) => (
                    <TableRow key={release.id}>
                      <TableCell className="font-medium">
                        {formatReleaseDate(release.releaseDate)}
                      </TableCell>
                      <TableCell>{release.releasedBy}</TableCell>
                      <TableCell className="text-right">{release.totalReleased}</TableCell>
                      <TableCell className="text-right">{release.totalLosses}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={ROUTES.tenant.shipmentReleaseEdit(slug, shipmentId, release.id)}
                          >
                            Edit
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={forceEditPrompted} onOpenChange={setForceEditPrompted}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit shipment items?</AlertDialogTitle>
            <AlertDialogDescription>
              This bypasses release tracking. Use it only when correcting data entry mistakes. Any
              reduction below already-released quantities will be rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartEditing}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={canDelete && deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shipment?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1.5">
                <p>
                  Are you sure you want to delete this shipment? This will permanently delete the
                  shipment and all information associated with it. This action cannot be undone.
                </p>
                <div className="bg-muted text-muted-foreground rounded-md p-3 text-sm">
                  <div className="text-foreground font-medium">
                    {data.shipment.supplierCode} shipment #{data.shipment.id}
                  </div>
                  <div>
                    Shipped {formatDateOnlyForDisplay(data.shipment.shipmentDate)} - Arrived{" "}
                    {formatDateOnlyForDisplay(data.shipment.arrivalDate)}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>
              <Trash2 aria-hidden="true" className="size-4" />
              {deleting ? "Deleting..." : "Delete shipment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SpeciesPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        species={species}
        excludeIds={draftItems.map((item) => item.butterflySpeciesId)}
        onConfirm={handlePickerConfirm}
      />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-1 py-3">
      <CardHeader className="px-3">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-3">
        <div className="text-base font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
