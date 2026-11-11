"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PARASITE_TYPES,
  type ParasiteDetail,
  type ParasiteType,
  sumParasiteDetails,
} from "@/lib/parasite-details";

const TYPE_LABELS: Record<ParasiteType, string> = {
  wasp: "Wasp",
  fly: "Fly",
  other: "Other",
};

export type ParasitePromptItem = {
  id: number;
  name: string;
  parasite: number;
  details: ParasiteDetail[];
};

type TypeInput = { count: number; description: string };
type ItemInput = Record<ParasiteType, TypeInput>;
type DetailsByItemId = Record<number, ParasiteDetail[]>;

interface ParasiteDetailsDialogProps {
  open: boolean;
  items: ParasitePromptItem[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (details: DetailsByItemId) => void;
  submitting?: boolean;
  errorMessage?: string | null;
}

function createInputs(items: ParasitePromptItem[]): Record<number, ItemInput> {
  return Object.fromEntries(
    items.map((item) => {
      const byType = new Map(item.details.map((detail) => [detail.type, detail]));
      return [
        item.id,
        Object.fromEntries(
          PARASITE_TYPES.map((type) => {
            const detail = byType.get(type);
            return [type, { count: detail?.count ?? 0, description: detail?.description ?? "" }];
          }),
        ),
      ];
    }),
  ) as Record<number, ItemInput>;
}

export function ParasiteDetailsDialog({
  open,
  items,
  onOpenChange,
  onConfirm,
  submitting = false,
  errorMessage,
}: ParasiteDetailsDialogProps) {
  const [values, setValues] = useState<Record<number, ItemInput>>(() => createInputs(items));

  const detailsByItemId = Object.fromEntries(
    items.map((item) => [
      item.id,
      PARASITE_TYPES.flatMap((type) => {
        const value = values[item.id]?.[type];
        if (!value?.count) return [];
        return [
          {
            type,
            count: value.count,
            description: value.description.trim() || null,
          },
        ];
      }),
    ]),
  );
  const canConfirm = items.every((item) => {
    const details = detailsByItemId[item.id] ?? [];
    if (sumParasiteDetails(details) !== item.parasite) return false;
    return details.every((detail) => detail.type !== "other" || !!detail.description?.trim());
  });

  function changeCount(itemId: number, type: ParasiteType, delta: number) {
    setValues((current) => {
      const itemValues = current[itemId];
      const total = PARASITE_TYPES.reduce((sum, currentType) => {
        return sum + (itemValues?.[currentType].count ?? 0);
      }, 0);
      const next = Math.max(0, (itemValues?.[type].count ?? 0) + delta);
      if (delta > 0 && total >= (items.find((item) => item.id === itemId)?.parasite ?? 0)) {
        return current;
      }
      return {
        ...current,
        [itemId]: {
          ...itemValues,
          [type]: { ...itemValues[type], count: next },
        },
      };
    });
  }

  function changeDescription(itemId: number, type: ParasiteType, description: string) {
    setValues((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [type]: { ...current[itemId][type], description },
      },
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Classify parasitized butterflies</DialogTitle>
          <DialogDescription>
            Allocate each parasite total among wasps, flies, and other. The counts must match the
            number entered for each species before the shipment can be saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {errorMessage && (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          )}
          {items.map((item) => {
            const itemValues = values[item.id];
            const allocated = PARASITE_TYPES.reduce(
              (sum, type) => sum + (itemValues?.[type].count ?? 0),
              0,
            );
            return (
              <section
                key={item.id}
                aria-labelledby={`parasite-title-${item.id}`}
                className="space-y-3 rounded-md border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 id={`parasite-title-${item.id}`} className="font-medium">
                    {item.name}
                  </h3>
                  <p
                    className={allocated === item.parasite ? "text-sm" : "text-destructive text-sm"}
                    aria-live="polite"
                  >
                    {allocated} of {item.parasite} classified
                  </p>
                </div>
                {PARASITE_TYPES.map((type) => (
                  <div
                    key={type}
                    className="grid gap-3 sm:grid-cols-[7rem_auto_1fr] sm:items-center"
                  >
                    <Label>{TYPE_LABELS[type]}</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`Decrease ${TYPE_LABELS[type]} count for ${item.name}`}
                        disabled={!itemValues?.[type].count || submitting}
                        onClick={() => changeCount(item.id, type, -1)}
                      >
                        <Minus className="size-4" aria-hidden="true" />
                      </Button>
                      <output
                        aria-label={`${TYPE_LABELS[type]} count`}
                        className="min-w-8 text-center tabular-nums"
                      >
                        {itemValues?.[type].count ?? 0}
                      </output>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`Increase ${TYPE_LABELS[type]} count for ${item.name}`}
                        disabled={allocated >= item.parasite || submitting}
                        onClick={() => changeCount(item.id, type, 1)}
                      >
                        <Plus className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {(type === "other" || !!itemValues?.[type].count) && (
                      <div className="space-y-1">
                        <Label htmlFor={`parasite-description-${item.id}-${type}`}>
                          Description{type === "other" ? " (required)" : " (optional)"}
                        </Label>
                        <Textarea
                          id={`parasite-description-${item.id}-${type}`}
                          value={itemValues?.[type].description ?? ""}
                          maxLength={500}
                          rows={2}
                          required={type === "other" && !!itemValues?.[type].count}
                          aria-invalid={
                            type === "other" && !!itemValues?.[type].count
                              ? !itemValues?.[type].description.trim()
                              : undefined
                          }
                          onChange={(event) => changeDescription(item.id, type, event.target.value)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </section>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canConfirm || submitting}
            onClick={() => onConfirm(detailsByItemId)}
          >
            {submitting ? "Saving…" : "Confirm and save shipment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
