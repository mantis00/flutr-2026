import { z } from "zod";
import { dateOnlyToUtcDate, extractDateOnly } from "@/lib/date-only";
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

const shipmentItemCreateSchema = z
  .object({
    butterfly_species_id: z.number({ message: "Butterfly species is required" }).int().positive(),
    number_received: z.number({ message: "Number received is required" }).int().min(0),
    emerged_in_transit: z.number().int().min(0).default(0),
    damaged_in_transit: z.number().int().min(0).default(0),
    diseased_in_transit: z.number().int().min(0).default(0),
    parasite: z.number().int().min(0).default(0),
    non_emergence: z.number().int().min(0).default(0),
    poor_emergence: z.number().int().min(0).default(0),
  })
  .strict();

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
    non_emergence: z.number().int().min(0),
    poor_emergence: z.number().int().min(0),
  })
  .strict();

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
