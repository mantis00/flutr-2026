import { z } from "zod";

import { dateOnlyToUtcDate, extractDateOnly } from "@/lib/date-only";

const releaseEventDateSchema = z
  .string()
  .transform((value) => extractDateOnly(value.trim()))
  .refine((value): value is string => value !== null, {
    message: "Expected a valid date in YYYY-MM-DD format",
  })
  .transform((value) => dateOnlyToUtcDate(value));

const releaseItemSchema = z
  .object({
    shipment_item_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
  })
  .strict();

const updateReleaseItemSchema = z
  .object({
    shipment_item_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().nonnegative(),
  })
  .strict();

const releaseLossColumns = [
  "damaged_in_transit",
  "diseased_in_transit",
  "parasite",
  "non_emergence",
  "poor_emergence",
] as const;

/**
 * Loss-column corrections that can be applied atomically alongside a release
 * POST. Each row carries absolute new values for any loss columns the client
 * wants to adjust; omitted columns are left unchanged. The same transaction
 * that creates the release event also writes these updates, so the
 * "remaining" check is computed against the post-correction inventory.
 */
const releaseLossUpdateSchema = z
  .object({
    shipment_item_id: z.coerce.number().int().positive(),
    damaged_in_transit: z.coerce.number().int().nonnegative().optional(),
    diseased_in_transit: z.coerce.number().int().nonnegative().optional(),
    parasite: z.coerce.number().int().nonnegative().optional(),
    non_emergence: z.coerce.number().int().nonnegative().optional(),
    poor_emergence: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();

export const createReleaseFromShipmentSchema = z
  .object({
    released_at: releaseEventDateSchema.optional(),
    items: z.array(releaseItemSchema).default([]),
    loss_updates: z.array(releaseLossUpdateSchema).optional().default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<number>();

    for (const item of data.items) {
      if (seen.has(item.shipment_item_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shipment items must be unique in a release request",
          path: ["items"],
        });
        break;
      }

      seen.add(item.shipment_item_id);
    }

    const lossSeen = new Set<number>();
    for (const row of data.loss_updates ?? []) {
      if (lossSeen.has(row.shipment_item_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shipment items must be unique in loss_updates",
          path: ["loss_updates"],
        });
        break;
      }
      lossSeen.add(row.shipment_item_id);
    }

    // Create-release can be "release + losses" OR "losses-only" (e.g. poor emergence),
    // but should still reject truly empty/no-op payloads.
    const hasAnyLossValue = (data.loss_updates ?? []).some((row) =>
      releaseLossColumns.some((column) => typeof row[column] === "number"),
    );

    if (data.items.length === 0 && !hasAnyLossValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one release item or loss update is required",
        path: ["items"],
      });
    }
  });

export type ReleaseLossUpdate = z.infer<typeof releaseLossUpdateSchema>;

export type CreateReleaseFromShipmentBody = z.infer<typeof createReleaseFromShipmentSchema>;

export const updateInFlightQuantitySchema = z
  .object({
    quantity: z.coerce.number().int().positive(),
  })
  .strict();

export type UpdateInFlightQuantityBody = z.infer<typeof updateInFlightQuantitySchema>;

// Backwards-compatible alias for existing scaffold route imports.
export const createReleaseBodySchema = createReleaseFromShipmentSchema;

export const releaseInFlightParamsSchema = z
  .object({
    releaseId: z.coerce.number().int().positive(),
  })
  .strict();

export const createInFlightBodySchema = z
  .object({
    shipment_item_id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
  })
  .strict();

export type CreateInFlightBody = z.infer<typeof createInFlightBodySchema>;

const updateReleaseLossRowSchema = z
  .object({
    shipment_item_id: z.coerce.number().int().positive(),
    damaged_in_transit: z.coerce.number().int().nonnegative(),
    diseased_in_transit: z.coerce.number().int().nonnegative(),
    parasite: z.coerce.number().int().nonnegative(),
    non_emergence: z.coerce.number().int().nonnegative(),
    poor_emergence: z.coerce.number().int().nonnegative(),
  })
  .strict();

export const updateReleaseEventItemsSchema = z
  .object({
    items: z.array(updateReleaseItemSchema).default([]),
    // Edit-flow event-level losses. Distinct name from create `loss_updates`
    // to avoid mixing absolute-total and event-level semantics.
    losses: z.array(updateReleaseLossRowSchema).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.items.length === 0 && (!data.losses || data.losses.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one release item or losses row is required",
        path: ["items"],
      });
    }

    const seen = new Set<number>();

    for (const item of data.items) {
      if (seen.has(item.shipment_item_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shipment items must be unique in a release request",
          path: ["items"],
        });
        break;
      }

      seen.add(item.shipment_item_id);
    }

    const lossSeen = new Set<number>();
    for (const row of data.losses ?? []) {
      if (lossSeen.has(row.shipment_item_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shipment items must be unique in losses",
          path: ["losses"],
        });
        break;
      }
      lossSeen.add(row.shipment_item_id);
    }
  });

export type UpdateReleaseEventItemsBody = z.infer<typeof updateReleaseEventItemsSchema>;

/**
 * Query schema for `GET /api/tenant/releases`. Mirrors the shipments list
 * pagination contract so the UI can rely on a consistent shape.
 */
export const listReleasesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  })
  .strict();

export type ListReleasesQuery = z.infer<typeof listReleasesQuerySchema>;
