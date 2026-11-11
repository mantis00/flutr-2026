import { z } from "zod";
import { dateOnlyToUtcDate, extractDateOnly } from "@/lib/date-only";
import { PARASITE_TYPES, sumParasiteDetails, type ParasiteType } from "@/lib/parasite-details";
import { sanitizeText } from "@/lib/validation/sanitize";
import { paginatedQuerySchema } from "./pagination";

/**
 * ---------------------------
 * Query: List Shipments
 * GET /tenant/shipments
 * ---------------------------
 */

export const listShipmentsQuerySchema = paginatedQuerySchema;

export type ListShipmentsQuery = z.infer<typeof listShipmentsQuerySchema>;

/**
 * ---------------------------
 * Params: Shipment ID
 * /tenant/shipments/[id]
 * ---------------------------
 */

export const shipmentIdParamsSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .strict();

export type ShipmentIdParams = z.infer<typeof shipmentIdParamsSchema>;

/**
 * ---------------------------
 * Shipment Item (Create)
 * ---------------------------
 */

type ShipmentItemAccountingInput = {
  number_received: number;
  emerged_in_transit: number;
  damaged_in_transit: number;
  diseased_in_transit: number;
  parasite: number;
  parasite_details?: {
    type: ParasiteType;
    count: number;
    description?: string | null;
  }[];
  parasite_unclassified?: number;
  non_emergence: number;
  poor_emergence: number;
};

const parasiteDetailSchema = z
  .object({
    type: z.enum(PARASITE_TYPES),
    count: z.number().int().positive(),
    description: z.string().max(500).transform(sanitizeText).nullable().optional(),
  })
  .strict()
  .superRefine((detail, ctx) => {
    if (detail.type === "other" && !detail.description?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A description is required for Other",
        path: ["description"],
      });
    }
  });

function validateParasiteDetails(item: ShipmentItemAccountingInput, ctx: z.RefinementCtx): void {
  const details = item.parasite_details ?? [];
  const types = new Set<string>();

  for (const [index, detail] of details.entries()) {
    if (types.has(detail.type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each parasite type may only be listed once",
        path: ["parasite_details", index, "type"],
      });
    }
    types.add(detail.type);
  }

  const unclassified = item.parasite_unclassified ?? 0;
  if (sumParasiteDetails(details) + unclassified !== item.parasite) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Parasite count must equal the classified and unclassified counts",
      path: ["parasite"],
    });
  }
}

function validateLossesWithinReceived(
  item: ShipmentItemAccountingInput,
  ctx: z.RefinementCtx,
): void {
  const totalLosses =
    item.emerged_in_transit +
    item.damaged_in_transit +
    item.diseased_in_transit +
    item.parasite +
    item.non_emergence +
    item.poor_emergence;

  if (totalLosses > item.number_received) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Total losses cannot exceed number received",
      path: [],
    });
  }

  if (item.parasite_details !== undefined || item.parasite_unclassified !== undefined) {
    validateParasiteDetails(item, ctx);
  }
}

// Deliberately has no `good_emergence` field: this schema validates untrusted input for the
// public manual shipment create/add-item routes, and `.strict()` rejects any unrecognized key
// outright. Widening it to accept `good_emergence` would let any tenant user with ordinary
// shipment-create permission set Released directly through the public API, bypassing the
// product's approved admin-only direct-editing design. The historical importer instead carries
// the field through `createShipment()`'s own, wider parameter type (see `CreateShipmentPayload`
// in `queries/shipments.ts`), without widening this public schema at all.
const shipmentItemCreateSchema = z
  .object({
    butterfly_species_id: z.number({ message: "Butterfly species is required" }).int().positive(),
    number_received: z.number({ message: "Number received is required" }).int().min(0),
    emerged_in_transit: z.number().int().min(0).default(0),
    damaged_in_transit: z.number().int().min(0).default(0),
    diseased_in_transit: z.number().int().min(0).default(0),
    parasite: z.number().int().min(0).default(0),
    parasite_details: z.array(parasiteDetailSchema).max(PARASITE_TYPES.length).optional(),
    non_emergence: z.number().int().min(0).default(0),
    poor_emergence: z.number().int().min(0).default(0),
  })
  .strict()
  .superRefine(validateLossesWithinReceived);

const shipmentDateOnlySchema = z
  .string()
  .transform((value) => extractDateOnly(value.trim()))
  .refine((value): value is string => value !== null, {
    message: "Expected a valid date in YYYY-MM-DD format",
  })
  .transform((value) => dateOnlyToUtcDate(value));

/**
 * ---------------------------
 * Create Shipment
 * POST /tenant/shipments
 * ---------------------------
 */

export const createShipmentBodySchema = z
  .object({
    supplier_code: z.string({ message: "Supplier code is required" }).min(1).max(30),
    shipment_date: shipmentDateOnlySchema,
    arrival_date: shipmentDateOnlySchema,
    items: z.array(shipmentItemCreateSchema).min(1, "At least one shipment item is required"),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.arrival_date < data.shipment_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Arrival date must be on or after shipment date",
        path: ["arrival_date"],
      });
    }

    const seen = new Set<number>();

    for (const item of data.items) {
      if (seen.has(item.butterfly_species_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Butterfly species must be unique per shipment",
          path: ["items"],
        });
        break;
      }

      seen.add(item.butterfly_species_id);
    }
  });

export type CreateShipmentBody = z.infer<typeof createShipmentBodySchema>;

/**
 * ---------------------------
 * Shipment Item (Update)
 * ---------------------------
 */

const shipmentItemUpdateSchema = z
  .object({
    id: z.number().int().positive(),
    number_received: z.number().int().min(0),
    emerged_in_transit: z.number().int().min(0),
    damaged_in_transit: z.number().int().min(0),
    diseased_in_transit: z.number().int().min(0),
    parasite: z.number().int().min(0),
    parasite_unclassified: z.number().int().min(0).optional(),
    parasite_details: z.array(parasiteDetailSchema).max(PARASITE_TYPES.length).optional(),
    non_emergence: z.number().int().min(0),
    poor_emergence: z.number().int().min(0),
  })
  .strict()
  .superRefine((item, ctx) => {
    validateLossesWithinReceived(item, ctx);
    if (item.parasite_details !== undefined && item.parasite_unclassified === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unclassified parasite count is required with parasite details",
        path: ["parasite_unclassified"],
      });
    }
  });

/**
 * ---------------------------
 * Shipment Item (Add)
 * ---------------------------
 */

const shipmentItemAddSchema = shipmentItemCreateSchema;

/**
 * ---------------------------
 * Update Shipment
 * PATCH /tenant/shipments/[id]
 * ---------------------------
 */

export const updateShipmentBodySchema = z
  .object({
    supplier_code: z.string().min(1).max(30).optional(),
    shipment_date: shipmentDateOnlySchema.optional(),
    arrival_date: shipmentDateOnlySchema.optional(),
    update_items: z.array(shipmentItemUpdateSchema).min(1).optional(),
    add_items: z.array(shipmentItemAddSchema).min(1).optional(),
    delete_items: z.array(z.number().int().positive()).min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      !data.supplier_code &&
      !data.shipment_date &&
      !data.arrival_date &&
      !data.update_items &&
      !data.add_items &&
      !data.delete_items
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one change is required",
      });
    }

    if (data.shipment_date && data.arrival_date) {
      if (data.arrival_date < data.shipment_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Arrival date must be on or after shipment date",
          path: ["arrival_date"],
        });
      }
    }
  });

export type UpdateShipmentBody = z.infer<typeof updateShipmentBodySchema>;

/**
 * ---------------------------
 * Delete Shipment (Tenant)
 * DELETE /tenant/shipments
 * ---------------------------
 *
 * Used primarily for historical import testing.
 */

export const deleteShipmentTenantSchema = z
  .object({
    // Tenant context is supplied via x-tenant-slug header.
  })
  .strict();

export type DeleteShipmentTenantBody = z.infer<typeof deleteShipmentTenantSchema>;
