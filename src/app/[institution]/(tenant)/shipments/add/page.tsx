"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bug, Minus, Plus, Trash2 } from "lucide-react";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { ROUTES } from "@/lib/routes";

import { DatePicker } from "@/components/shared/date-picker";
import { SpeciesPickerDialog } from "@/components/tenant/shipments/species-picker-dialog";
import {
  SupplierSelect,
  mapSupplierRowsToOptions,
  type SupplierOption,
} from "@/components/tenant/shipments/supplier-select";
import type { SpeciesPickerOption } from "@/components/tenant/shipments/types";
import type { SpeciesImage } from "@/lib/wingspan/images";

type ShipmentItemForm = {
  butterfly_species_id: number;
  scientific_name: string;
  common_name: string;
  images: SpeciesImage[];
  number_received: number;
  emerged_in_transit: number;
  damaged_in_transit: number;
  diseased_in_transit: number;
  parasite: number;
  non_emergence: number;
  poor_emergence: number;
};

type LossKey =
  | "number_received"
  | "emerged_in_transit"
  | "damaged_in_transit"
  | "diseased_in_transit"
  | "parasite"
  | "non_emergence"
  | "poor_emergence";

const METRIC_FIELDS: { key: LossKey; label: string }[] = [
  { key: "number_received", label: "Received" },
  { key: "emerged_in_transit", label: "Emerged" },
  { key: "damaged_in_transit", label: "Damaged" },
  { key: "diseased_in_transit", label: "Diseased" },
  { key: "parasite", label: "Parasite" },
  { key: "non_emergence", label: "Non-emerg" },
  { key: "poor_emergence", label: "Poor-emerg" },
];

/** Today's date in YYYY-MM-DD using the user's local timezone. */
function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Per-field invalid markers. A field is considered invalid only after the
 * user has tried to submit at least once, so first-time visitors don't see a
 * sea of red on a fresh page.
 */
type FieldErrors = {
  supplier?: boolean;
  shipmentDate?: boolean;
  arrivalDate?: boolean;
  itemsEmpty?: boolean;
  receivedByItemId: Record<number, boolean>;
};

const EMPTY_FIELD_ERRORS: FieldErrors = { receivedByItemId: {} };

function blankItem(species: SpeciesPickerOption): ShipmentItemForm {
  return {
    butterfly_species_id: species.id,
    scientific_name: species.scientificName,
    common_name: species.commonName,
    images: species.images,
    number_received: 0,
    emerged_in_transit: 0,
    damaged_in_transit: 0,
    diseased_in_transit: 0,
    parasite: 0,
    non_emergence: 0,
    poor_emergence: 0,
  };
}

export default function AddShipmentPage() {
  const params = useParams<{ institution: string }>();
  const router = useRouter();
  const slug = params?.institution ?? "";

  const [supplierCode, setSupplierCode] = useState("");
  const [shipmentDate, setShipmentDate] = useState("");
  // Arrival defaults to today since most shipments are recorded the day they
  // arrive on-site. The user can still pick a different date if needed.
  const [arrivalDate, setArrivalDate] = useState(() => todayYmd());
  const [items, setItems] = useState<ShipmentItemForm[]>([]);

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [species, setSpecies] = useState<SpeciesPickerOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(EMPTY_FIELD_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ShipmentItemForm | null>(null);

  const tenantHeaders = useMemo(() => ({ "x-tenant-slug": slug }), [slug]);

  // Load suppliers + species in parallel.
  useEffect(() => {
    if (!slug) return;
    const ac = new AbortController();
    void (async () => {
      try {
        const [supRes, spRes] = await Promise.all([
          fetch("/api/tenant/suppliers", { headers: tenantHeaders, signal: ac.signal }),
          fetch("/api/tenant/species", { headers: tenantHeaders, signal: ac.signal }),
        ]);

        if (!supRes.ok) {
          throw new Error("Unable to load suppliers.");
        }
        if (!spRes.ok) {
          throw new Error("Unable to load species.");
        }

        const supJson = await supRes.json().catch(() => null);
        const spJson = await spRes.json().catch(() => null);

        const supplierRows = Array.isArray(supJson?.suppliers)
          ? supJson.suppliers
          : Array.isArray(supJson?.data?.suppliers)
            ? supJson.data.suppliers
            : [];
        setSuppliers(mapSupplierRowsToOptions(supplierRows));

        const speciesRows = Array.isArray(spJson?.species) ? spJson.species : [];
        setSpecies(
          speciesRows
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
                } satisfies SpeciesPickerOption;
              },
            )
            .filter((row: SpeciesPickerOption | null): row is SpeciesPickerOption => row !== null),
        );
      } catch (err) {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorMessage(err instanceof Error ? err.message : "Unable to load shipment form data.");
      }
    })();
    return () => ac.abort();
  }, [slug, tenantHeaders]);

  const addedSpeciesIds = useMemo(() => items.map((item) => item.butterfly_species_id), [items]);

  const handlePickerConfirm = useCallback((chosen: SpeciesPickerOption[]) => {
    setItems((current) => [
      ...current,
      ...chosen
        .filter((c) => !current.some((item) => item.butterfly_species_id === c.id))
        .map(blankItem),
    ]);
    // Adding species clears the "no items" error and any per-item received
    // errors that happened to belong to species the user has now removed.
    setFieldErrors((prev) => ({ ...prev, itemsEmpty: false }));
  }, []);

  const updateItem = useCallback((id: number, key: LossKey, value: number) => {
    const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    setItems((current) =>
      current.map((item) => (item.butterfly_species_id === id ? { ...item, [key]: safe } : item)),
    );
    // Clear the per-item received error as soon as the user types something
    // > 0 into that field.
    if (key === "number_received" && safe > 0) {
      setFieldErrors((prev) => {
        if (!prev.receivedByItemId[id]) return prev;
        const next = { ...prev.receivedByItemId };
        delete next[id];
        return { ...prev, receivedByItemId: next };
      });
    }
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.butterfly_species_id !== id));
    setFieldErrors((prev) => {
      const next = { ...prev.receivedByItemId };
      delete next[id];
      return { ...prev, receivedByItemId: next };
    });
  }, []);

  /**
   * Build the per-field error map for the current form state. Returns
   * `null` when everything's valid; otherwise returns the errors AND a
   * one-liner suitable for the top-of-form banner.
   */
  const validate = (): { errors: FieldErrors; message: string } | null => {
    const errors: FieldErrors = { receivedByItemId: {} };
    const issues: string[] = [];

    if (!supplierCode) {
      errors.supplier = true;
      issues.push("supplier");
    }
    if (!shipmentDate) {
      errors.shipmentDate = true;
      issues.push("shipment date");
    }
    if (!arrivalDate) {
      errors.arrivalDate = true;
      issues.push("arrival date");
    }
    if (items.length === 0) {
      errors.itemsEmpty = true;
      issues.push("at least one butterfly species");
    }
    for (const item of items) {
      if (item.number_received <= 0) {
        errors.receivedByItemId[item.butterfly_species_id] = true;
      }
    }

    const hasReceivedErrors = Object.keys(errors.receivedByItemId).length > 0;
    if (hasReceivedErrors) {
      issues.push("a received count above zero on every species");
    }

    if (issues.length === 0) return null;

    return {
      errors,
      message: `Please fill in: ${issues.join(", ")}.`,
    };
  };

  // Clear date errors as the user picks values; don't wait for re-submit.
  const handleShipmentDateChange = useCallback((next: string) => {
    setShipmentDate(next);
    if (next) setFieldErrors((prev) => ({ ...prev, shipmentDate: false }));
  }, []);

  const handleArrivalDateChange = useCallback((next: string) => {
    setArrivalDate(next);
    if (next) setFieldErrors((prev) => ({ ...prev, arrivalDate: false }));
  }, []);

  const handleSupplierChange = useCallback((code: string) => {
    setSupplierCode(code);
    if (code) setFieldErrors((prev) => ({ ...prev, supplier: false }));
  }, []);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const validation = validate();
    if (validation) {
      setFieldErrors(validation.errors);
      setErrorMessage(validation.message);
      return;
    }
    setFieldErrors(EMPTY_FIELD_ERRORS);

    setSubmitting(true);
    try {
      const response = await fetch("/api/tenant/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...tenantHeaders },
        body: JSON.stringify({
          supplier_code: supplierCode,
          shipment_date: shipmentDate,
          arrival_date: arrivalDate,
          items: items.map(
            ({
              butterfly_species_id,
              number_received,
              emerged_in_transit,
              damaged_in_transit,
              diseased_in_transit,
              parasite,
              non_emergence,
              poor_emergence,
            }) => ({
              butterfly_species_id,
              number_received,
              emerged_in_transit,
              damaged_in_transit,
              diseased_in_transit,
              parasite,
              non_emergence,
              poor_emergence,
            }),
          ),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(result?.error?.message ?? "Unable to create shipment.");
        return;
      }
      router.push(ROUTES.tenant.shipmentById(slug, result.id));
    } catch {
      setErrorMessage("Unable to create shipment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-3xl font-semibold">Add shipment</h1>
        <p className="text-muted-foreground">
          Record a new shipment and the butterflies that arrived.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Shipment details</CardTitle>
            <CardDescription>Supplier and dates for this shipment.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="supplier">Supplier</Label>
              <SupplierSelect
                id="supplier"
                suppliers={suppliers}
                value={supplierCode}
                onChange={handleSupplierChange}
                aria-invalid={fieldErrors.supplier}
                aria-describedby={fieldErrors.supplier ? "supplier-error" : undefined}
              />
              {fieldErrors.supplier && (
                <p id="supplier-error" className="text-destructive text-xs">
                  Supplier is required.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="shipment-date">Shipment date</Label>
              <DatePicker
                id="shipment-date"
                value={shipmentDate}
                onChange={handleShipmentDateChange}
                // The arrival date sets the latest valid shipment date — a
                // shipment can't have left the supplier after it arrived.
                maxDate={arrivalDate || undefined}
                aria-invalid={fieldErrors.shipmentDate}
                aria-describedby={fieldErrors.shipmentDate ? "shipment-date-error" : undefined}
              />
              {fieldErrors.shipmentDate && (
                <p id="shipment-date-error" className="text-destructive text-xs">
                  Shipment date is required.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="arrival-date">Arrival date</Label>
              <DatePicker
                id="arrival-date"
                value={arrivalDate}
                onChange={handleArrivalDateChange}
                // Conversely, arrival can't be earlier than the shipment date.
                minDate={shipmentDate || undefined}
                aria-invalid={fieldErrors.arrivalDate}
                aria-describedby={fieldErrors.arrivalDate ? "arrival-date-error" : undefined}
              />
              {fieldErrors.arrivalDate && (
                <p id="arrival-date-error" className="text-destructive text-xs">
                  Arrival date is required.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Butterflies</CardTitle>
              <CardDescription>
                Add species and record received quantities and any losses.
              </CardDescription>
            </div>
            <Button type="button" onClick={() => setPickerOpen(true)}>
              Add butterflies
            </Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p
                className={cn(
                  "rounded-md border p-6 text-center text-sm",
                  fieldErrors.itemsEmpty
                    ? "border-destructive text-destructive"
                    : "text-muted-foreground",
                )}
              >
                No species added yet. Click <strong>Add butterflies</strong> to get started.
              </p>
            ) : (
              <ul className="grid gap-4">
                {items.map((item) => {
                  const receivedInvalid = !!fieldErrors.receivedByItemId[item.butterfly_species_id];
                  return (
                    <li
                      key={item.butterfly_species_id}
                      className={cn(
                        "bg-card flex flex-col gap-4 rounded-lg border p-4",
                        receivedInvalid && "border-destructive",
                      )}
                    >
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
                            <Bug className="text-muted-foreground absolute inset-0 m-auto size-7" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-medium">{item.common_name}</div>
                          <div className="text-muted-foreground truncate text-sm italic">
                            {item.scientific_name}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${item.common_name}`}
                          onClick={() => setPendingDelete(item)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                        {METRIC_FIELDS.map((field) => (
                          <MetricInput
                            key={field.key}
                            label={field.label}
                            value={item[field.key]}
                            ariaLabel={`${field.label} for ${item.common_name}`}
                            // Only the "Received" stepper is required > 0; the rest
                            // can legitimately stay at 0.
                            invalid={field.key === "number_received" && receivedInvalid}
                            onChange={(next) =>
                              updateItem(item.butterfly_species_id, field.key, next)
                            }
                          />
                        ))}
                      </div>
                      {receivedInvalid && (
                        <p className="text-destructive text-xs">Received must be greater than 0.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            {errorMessage ? (
              <span className="text-destructive text-sm" role="alert">
                {errorMessage}
              </span>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save shipment"}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <SpeciesPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        species={species}
        excludeIds={addedSpeciesIds}
        onConfirm={handlePickerConfirm}
      />

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
                ? `${pendingDelete.common_name} (${pendingDelete.scientific_name}) and any quantities you entered for it will be discarded.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) removeItem(pendingDelete.butterfly_species_id);
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

interface MetricInputProps {
  label: string;
  value: number;
  ariaLabel: string;
  onChange: (next: number) => void;
  invalid?: boolean;
}

function MetricInput({ label, value, ariaLabel, onChange, invalid }: MetricInputProps) {
  const clamp = (next: number) => Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
  return (
    <div className="space-y-1">
      <Label className={cn("text-xs", invalid && "text-destructive")}>{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8"
          aria-label={`Increase ${ariaLabel}`}
          onClick={() => onChange(clamp(value + 1))}
        >
          <Plus className="size-3" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          aria-label={ariaLabel}
          aria-invalid={invalid}
          className="h-8 w-14 px-1 text-center text-sm"
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-8"
          aria-label={`Decrease ${ariaLabel}`}
          onClick={() => onChange(clamp(value - 1))}
        >
          <Minus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
