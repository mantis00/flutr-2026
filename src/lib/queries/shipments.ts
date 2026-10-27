import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { dateOnlyToUtcDate } from "@/lib/date-only";
import {
  shipments,
  shipment_items,
  butterfly_species,
  in_flight,
  release_events,
  release_event_losses,
} from "@/lib/schema";
import { ensureSpeciesLinksForInstitution } from "@/lib/queries/species";

import type { CreateShipmentBody, UpdateShipmentBody } from "@/lib/validation/shipments";

export const SHIPMENT_ERRORS = {
  CANNOT_DELETE_ITEM_IN_FLIGHT: "CANNOT_DELETE_ITEM_IN_FLIGHT",
  INVALID_INVENTORY_REDUCTION: "INVALID_INVENTORY_REDUCTION",
  SHIPMENT_ITEM_NOT_FOUND: "SHIPMENT_ITEM_NOT_FOUND",
} as const;

/**
 * Parse a YYYY-MM-DD date-only string into a UTC start-of-day Date.
 * Input shape/calendar validity is enforced upstream by Zod.
 */
export function parseDateOnlyToUtcStart(value: string): Date {
  return dateOnlyToUtcDate(value);
}

/**
 * Compute an exclusive UTC upper bound for a YYYY-MM-DD date-only string.
 * Example: 2024-12-31 -> 2025-01-01T00:00:00.000Z.
 */
export function parseDateOnlyToUtcExclusiveEnd(value: string): Date {
  const start = parseDateOnlyToUtcStart(value);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * List shipments for a tenant (paginated). Each row carries a `remaining`
 * count and an `isCompleted` flag derived from shipment items + in_flight.
 */
export async function listShipments(institutionId: number, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: shipments.id,
        supplierCode: shipments.supplier_code,
        shipmentDate: sql<string>`to_char(${shipments.shipment_date}, 'YYYY-MM-DD')`.as(
          "shipment_date",
        ),
        arrivalDate: sql<string>`to_char(${shipments.arrival_date}, 'YYYY-MM-DD')`.as(
          "arrival_date",
        ),
        createdAt: shipments.created_at,
      })
      .from(shipments)
      .where(eq(shipments.institution_id, institutionId))
      .orderBy(desc(shipments.shipment_date))
      .limit(limit)
      .offset(offset),

    db
      .select({ total: count() })
      .from(shipments)
      .where(eq(shipments.institution_id, institutionId)),
  ]);

  const total = totalResult[0]?.total ?? 0;
  const completionByShipmentId = await getShipmentCompletionMap(
    institutionId,
    rows.map((row) => row.id),
  );

  const enriched = rows.map((row) => {
    const status = completionByShipmentId.get(row.id) ?? { remaining: 0, isCompleted: true };
    return {
      ...row,
      remaining: status.remaining,
      isCompleted: status.isCompleted,
    };
  });

  return {
    shipments: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Pure helper that turns the raw aggregation rows from the DB into the
 * shipment-id → {remaining, isCompleted} map. Extracted so the completion
 * logic (clamping, empty-shipment defaulting, in_flight subtraction) can be
 * unit-tested without going through drizzle.
 */
export function buildShipmentCompletionMap(
  itemRows: { shipmentId: number; itemCount: number; grossAvailable: number | string }[],
  releasedRows: { shipmentId: number; released: number | string }[],
  shipmentIds?: number[],
): Map<number, { remaining: number; isCompleted: boolean }> {
  const releasedByShipmentId = new Map(
    releasedRows.map((row) => [row.shipmentId, Number(row.released)]),
  );

  const map = new Map<number, { remaining: number; isCompleted: boolean }>();

  for (const row of itemRows) {
    const released = releasedByShipmentId.get(row.shipmentId) ?? 0;
    const remaining = Math.max(0, Number(row.grossAvailable) - released);
    map.set(row.shipmentId, {
      remaining,
      isCompleted: row.itemCount > 0 && remaining === 0,
    });
  }

  // Shipments with zero items aren't returned by the grouping above. Default
  // them to "in progress" so empty shells aren't surfaced as completed.
  if (shipmentIds) {
    for (const id of shipmentIds) {
      if (!map.has(id)) {
        map.set(id, { remaining: 0, isCompleted: false });
      }
    }
  }

  return map;
}

/**
 * Compute remaining butterflies + completion flag per shipment for a tenant.
 *
 * Per shipment item, "remaining" = number_received - (emerged_in_transit
 * + damaged + diseased + parasite + non_emergence + poor_emergence)
 * - sum(in_flight.quantity).
 * A shipment is "completed" when remaining sums to zero across all of its
 * items AND it has at least one item (an empty shipment is treated as
 * in-progress so users see something to fill in).
 *
 * If `shipmentIds` is provided the result is restricted to those ids;
 * otherwise every shipment for the institution is included.
 */
export async function getShipmentCompletionMap(
  institutionId: number,
  shipmentIds?: number[],
): Promise<Map<number, { remaining: number; isCompleted: boolean }>> {
  if (shipmentIds && shipmentIds.length === 0) {
    return new Map();
  }

  const itemConditions = [eq(shipment_items.institution_id, institutionId)];
  if (shipmentIds) {
    itemConditions.push(inArray(shipment_items.shipment_id, shipmentIds));
  }

  // Per-shipment item totals (received minus losses), grouped in SQL.
  const itemRows = await db
    .select({
      shipmentId: shipment_items.shipment_id,
      itemCount: count(shipment_items.id),
      grossAvailable: sql<number>`coalesce(sum(
        ${shipment_items.number_received}
        - ${shipment_items.emerged_in_transit}
        - ${shipment_items.damaged_in_transit}
        - ${shipment_items.diseased_in_transit}
        - ${shipment_items.parasite}
        - ${shipment_items.non_emergence}
        - ${shipment_items.poor_emergence}
      ), 0)::int`.as("gross_available"),
    })
    .from(shipment_items)
    .where(and(...itemConditions))
    .groupBy(shipment_items.shipment_id);

  // Per-shipment in_flight totals via shipment_items join.
  const releasedConditions = [eq(in_flight.institution_id, institutionId)];
  if (shipmentIds) {
    releasedConditions.push(inArray(shipment_items.shipment_id, shipmentIds));
  }

  const releasedRows = await db
    .select({
      shipmentId: shipment_items.shipment_id,
      released: sql<number>`coalesce(sum(${in_flight.quantity}), 0)::int`.as("released_total"),
    })
    .from(in_flight)
    .innerJoin(
      shipment_items,
      and(
        eq(shipment_items.id, in_flight.shipment_item_id),
        eq(shipment_items.institution_id, in_flight.institution_id),
      ),
    )
    .where(and(...releasedConditions))
    .groupBy(shipment_items.shipment_id);

  return buildShipmentCompletionMap(itemRows, releasedRows, shipmentIds);
}

/**
 * Fetch shipment with line items
 */
export async function getShipmentWithItems(institutionId: number, shipmentId: number) {
  const [shipment] = await db
    .select({
      id: shipments.id,
      supplierCode: shipments.supplier_code,
      shipmentDate: sql<string>`to_char(${shipments.shipment_date}, 'YYYY-MM-DD')`.as(
        "shipment_date",
      ),
      arrivalDate: sql<string>`to_char(${shipments.arrival_date}, 'YYYY-MM-DD')`.as("arrival_date"),
      createdAt: shipments.created_at,
    })
    .from(shipments)
    .where(and(eq(shipments.id, shipmentId), eq(shipments.institution_id, institutionId)))
    .limit(1);

  if (!shipment) return null;

  const items = await db
    .select({
      id: shipment_items.id,

      butterflySpeciesId: shipment_items.butterfly_species_id,

      scientificName: butterfly_species.scientific_name,
      commonName: butterfly_species.common_name,

      numberReceived: shipment_items.number_received,
      emergedInTransit: shipment_items.emerged_in_transit,
      damagedInTransit: shipment_items.damaged_in_transit,
      diseasedInTransit: shipment_items.diseased_in_transit,
      parasite: shipment_items.parasite,
      nonEmergence: shipment_items.non_emergence,
      poorEmergence: shipment_items.poor_emergence,

      // ::int cast is required: PG sum() over integer returns bigint, which
      // node-postgres serializes as a string. Without the cast, JS code that
      // does `acc + item.inFlightQuantity` ends up string-concatenating
      // ("0" + "5" + "10" → "0510") and surfaces as a giant number.
      inFlightQuantity: sql<number>`coalesce(sum(${in_flight.quantity}), 0)::int`.as(
        "in_flight_quantity",
      ),
    })
    .from(shipment_items)
    .leftJoin(butterfly_species, eq(shipment_items.butterfly_species_id, butterfly_species.id))
    .leftJoin(
      in_flight,
      and(
        eq(shipment_items.id, in_flight.shipment_item_id),
        eq(shipment_items.institution_id, in_flight.institution_id),
      ),
    )
    .where(
      and(
        eq(shipment_items.shipment_id, shipmentId),
        eq(shipment_items.institution_id, institutionId),
      ),
    )
    .groupBy(
      shipment_items.id,
      shipment_items.butterfly_species_id,
      butterfly_species.scientific_name,
      butterfly_species.common_name,
    );

  return { shipment, items };
}

/**
 * Create shipment with line items
 */
export async function createShipment(institutionId: number, payload: CreateShipmentBody) {
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(shipments)
      .values({
        institution_id: institutionId,
        supplier_code: payload.supplier_code,
        shipment_date: payload.shipment_date,
        arrival_date: payload.arrival_date,
      })
      .returning({ id: shipments.id });

    const items = payload.items.map((item) => ({
      institution_id: institutionId,
      shipment_id: inserted.id,
      butterfly_species_id: item.butterfly_species_id,
      number_received: item.number_received,
      emerged_in_transit: item.emerged_in_transit,
      damaged_in_transit: item.damaged_in_transit,
      diseased_in_transit: item.diseased_in_transit,
      parasite: item.parasite,
      non_emergence: item.non_emergence,
      poor_emergence: item.poor_emergence,
    }));

    await ensureSpeciesLinksForInstitution(
      institutionId,
      payload.items.map((item) => item.butterfly_species_id),
      tx,
    );
    await tx.insert(shipment_items).values(items);

    return inserted.id;
  });
}

/**
 * Check whether a shipment header already exists for the same tenant and key.
 */
export async function shipmentHeaderExists(
  institutionId: number,
  supplierCode: string,
  shipmentDate: Date,
  arrivalDate: Date,
) {
  const [row] = await db
    .select({ id: shipments.id })
    .from(shipments)
    .where(
      and(
        eq(shipments.institution_id, institutionId),
        eq(shipments.supplier_code, supplierCode),
        eq(shipments.shipment_date, shipmentDate),
        eq(shipments.arrival_date, arrivalDate),
      ),
    )
    .limit(1);

  return !!row;
}

/**
 * Lightweight summary list of all shipments for an institution, with aggregated
 * item count and total received. Used by the Data tab shipment viewer.
 * Returns all rows ordered by shipment date descending (no pagination).
 */
export async function getShipmentSummaryList(institutionId: number) {
  return db
    .select({
      id: shipments.id,
      supplierCode: shipments.supplier_code,
      shipmentDate: sql<string>`to_char(${shipments.shipment_date}, 'YYYY-MM-DD')`.as(
        "shipment_date",
      ),
      arrivalDate: sql<string>`to_char(${shipments.arrival_date}, 'YYYY-MM-DD')`.as("arrival_date"),
      itemCount: count(shipment_items.id),
      totalReceived: sql<number>`coalesce(sum(${shipment_items.number_received}), 0)`.as(
        "total_received",
      ),
    })
    .from(shipments)
    .leftJoin(
      shipment_items,
      and(
        eq(shipment_items.shipment_id, shipments.id),
        eq(shipment_items.institution_id, shipments.institution_id),
      ),
    )
    .where(eq(shipments.institution_id, institutionId))
    .groupBy(shipments.id, shipments.supplier_code, shipments.shipment_date, shipments.arrival_date)
    .orderBy(desc(shipments.shipment_date));
}

/**
 * Flat shipment rows for XLSX export, with optional date range filter.
 * `from` and `to` are YYYY-MM-DD strings; when provided, only shipments
 * whose `shipment_date` falls within the inclusive range are exported.
 */
export async function listShipmentExportRows(
  institutionId: number,
  range?: { from?: string; to?: string },
) {
  const conditions = [eq(shipment_items.institution_id, institutionId)];

  if (range?.from) {
    conditions.push(gte(shipments.shipment_date, parseDateOnlyToUtcStart(range.from)));
  }
  if (range?.to) {
    conditions.push(lt(shipments.shipment_date, parseDateOnlyToUtcExclusiveEnd(range.to)));
  }

  return db
    .select({
      supplierCode: shipments.supplier_code,
      shipmentDate: sql<string>`to_char(${shipments.shipment_date}, 'YYYY-MM-DD')`.as(
        "shipment_date",
      ),
      arrivalDate: sql<string>`to_char(${shipments.arrival_date}, 'YYYY-MM-DD')`.as("arrival_date"),
      scientificName: butterfly_species.scientific_name,
      commonName: butterfly_species.common_name,
      numberReceived: shipment_items.number_received,
      emergedInTransit: shipment_items.emerged_in_transit,
      damagedInTransit: shipment_items.damaged_in_transit,
      diseasedInTransit: shipment_items.diseased_in_transit,
      parasite: shipment_items.parasite,
      nonEmergence: shipment_items.non_emergence,
      poorEmergence: shipment_items.poor_emergence,
    })
    .from(shipment_items)
    .innerJoin(
      shipments,
      and(
        eq(shipments.id, shipment_items.shipment_id),
        eq(shipments.institution_id, shipment_items.institution_id),
      ),
    )
    .innerJoin(butterfly_species, eq(butterfly_species.id, shipment_items.butterfly_species_id))
    .where(and(...conditions))
    .orderBy(
      asc(shipments.shipment_date),
      asc(shipments.supplier_code),
      asc(butterfly_species.scientific_name),
    );
}

/**
 * Update shipment header or items
 */
export async function updateShipment(
  institutionId: number,
  shipmentId: number,
  payload: UpdateShipmentBody,
) {
  return db.transaction(async (tx) => {
    // Determine whether the shipment header exists up front so the route can
    // return 404 when there is nothing to update.
    const [existingShipment] = await tx
      .select({ id: shipments.id })
      .from(shipments)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.institution_id, institutionId)))
      .limit(1);

    if (!existingShipment) return false;

    if (payload.supplier_code || payload.shipment_date || payload.arrival_date) {
      const updateData: Record<string, unknown> = {};

      if (payload.supplier_code) updateData.supplier_code = payload.supplier_code;
      if (payload.shipment_date) updateData.shipment_date = payload.shipment_date;
      if (payload.arrival_date) updateData.arrival_date = payload.arrival_date;

      await tx
        .update(shipments)
        .set(updateData)
        .where(and(eq(shipments.id, shipmentId), eq(shipments.institution_id, institutionId)));
    }

    if (payload.update_items) {
      for (const item of payload.update_items) {
        // Lock the row to serialize with concurrent release creation (which also locks shipment_items)
        const lockedRows = await tx
          .select({ id: shipment_items.id })
          .from(shipment_items)
          .where(
            and(
              eq(shipment_items.id, item.id),
              eq(shipment_items.institution_id, institutionId),
              eq(shipment_items.shipment_id, shipmentId),
            ),
          )
          .for("update");

        if (lockedRows.length === 0) {
          throw new Error(SHIPMENT_ERRORS.SHIPMENT_ITEM_NOT_FOUND);
        }

        const [inFlightRow] = await tx
          .select({ total: sql<number>`coalesce(sum(${in_flight.quantity}), 0)` })
          .from(in_flight)
          .where(
            and(
              eq(in_flight.shipment_item_id, item.id),
              eq(in_flight.institution_id, institutionId),
            ),
          );

        const inFlightTotal = inFlightRow?.total ?? 0;

        const availableAfterUpdate =
          item.number_received -
          item.emerged_in_transit -
          item.damaged_in_transit -
          item.diseased_in_transit -
          item.parasite -
          item.non_emergence -
          item.poor_emergence;

        if (availableAfterUpdate < inFlightTotal) {
          throw new Error(SHIPMENT_ERRORS.INVALID_INVENTORY_REDUCTION);
        }

        await tx
          .update(shipment_items)
          .set({
            number_received: item.number_received,
            emerged_in_transit: item.emerged_in_transit,
            damaged_in_transit: item.damaged_in_transit,
            diseased_in_transit: item.diseased_in_transit,
            parasite: item.parasite,
            non_emergence: item.non_emergence,
            poor_emergence: item.poor_emergence,
          })
          .where(
            and(
              eq(shipment_items.id, item.id),
              eq(shipment_items.institution_id, institutionId),
              eq(shipment_items.shipment_id, shipmentId),
            ),
          );
      }
    }

    if (payload.add_items) {
      await ensureSpeciesLinksForInstitution(
        institutionId,
        payload.add_items.map((item) => item.butterfly_species_id),
        tx,
      );

      const rows = payload.add_items.map((item) => ({
        institution_id: institutionId,
        shipment_id: shipmentId,
        butterfly_species_id: item.butterfly_species_id,
        number_received: item.number_received,
        emerged_in_transit: item.emerged_in_transit,
        damaged_in_transit: item.damaged_in_transit,
        diseased_in_transit: item.diseased_in_transit,
        parasite: item.parasite,
        non_emergence: item.non_emergence,
        poor_emergence: item.poor_emergence,
      }));

      await tx.insert(shipment_items).values(rows);
    }

    if (payload.delete_items) {
      const rows = await tx
        .select({
          shipmentItemId: in_flight.shipment_item_id,
        })
        .from(in_flight)
        .where(
          and(
            eq(in_flight.institution_id, institutionId),
            inArray(in_flight.shipment_item_id, payload.delete_items),
          ),
        );

      if (rows.length > 0) {
        throw new Error(SHIPMENT_ERRORS.CANNOT_DELETE_ITEM_IN_FLIGHT);
      }

      const deleted = await tx
        .delete(shipment_items)
        .where(
          and(
            eq(shipment_items.institution_id, institutionId),
            eq(shipment_items.shipment_id, shipmentId),
            inArray(shipment_items.id, payload.delete_items),
          ),
        )
        .returning({ id: shipment_items.id });

      if (deleted.length !== payload.delete_items.length) {
        throw new Error(SHIPMENT_ERRORS.SHIPMENT_ITEM_NOT_FOUND);
      }
    }

    return true;
  });
}

/**
 * Delete single shipment
 *
 * Deletes shipment-owned children before deleting the shipment header.
 */
export async function deleteShipment(institutionId: number, shipmentId: number) {
  return db.transaction(async (tx) => {
    const [targetShipment] = await tx
      .select({ id: shipments.id })
      .from(shipments)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.institution_id, institutionId)))
      .limit(1);

    if (!targetShipment) return false;

    const targetItems = await tx
      .select({ id: shipment_items.id })
      .from(shipment_items)
      .where(
        and(
          eq(shipment_items.shipment_id, shipmentId),
          eq(shipment_items.institution_id, institutionId),
        ),
      );

    const itemIds = targetItems.map((item) => item.id);

    if (itemIds.length > 0) {
      await tx
        .delete(in_flight)
        .where(
          and(
            eq(in_flight.institution_id, institutionId),
            inArray(in_flight.shipment_item_id, itemIds),
          ),
        );

      await tx
        .delete(release_event_losses)
        .where(
          and(
            eq(release_event_losses.institution_id, institutionId),
            inArray(release_event_losses.shipment_item_id, itemIds),
          ),
        );
    }

    await tx
      .delete(release_events)
      .where(
        and(
          eq(release_events.institution_id, institutionId),
          eq(release_events.shipment_id, shipmentId),
        ),
      );

    if (itemIds.length > 0) {
      await tx
        .delete(shipment_items)
        .where(
          and(
            eq(shipment_items.institution_id, institutionId),
            eq(shipment_items.shipment_id, shipmentId),
          ),
        );
    }

    const result = await tx
      .delete(shipments)
      .where(and(eq(shipments.id, shipmentId), eq(shipments.institution_id, institutionId)))
      .returning({ id: shipments.id });

    return result.length > 0;
  });
}

/**
 * TESTING ONLY
 *
 * Bulk delete shipments for tenant.
 */
export async function bulkDeleteShipmentsForTenant(institutionId: number) {
  return db.delete(shipments).where(eq(shipments.institution_id, institutionId));
}

// ---------------------------------------------------------------------------
// Bulk delete
// ---------------------------------------------------------------------------

export type ShipmentDeleteOptions =
  | { mode: "all" }
  | { mode: "year"; year: number }
  | { mode: "range"; from: string; to: string };

/**
 * Bulk-delete shipments for an institution by mode.
 *
 * Deletion order respects FK constraints:
 *   in_flight (restrict on shipment_items) → release_events → shipment_items → shipments
 *
 * Returns the count of shipment headers deleted.
 */
export async function deleteShipmentsForInstitution(
  institutionId: number,
  options: ShipmentDeleteOptions,
): Promise<{ deleted: number }> {
  return db.transaction(async (tx) => {
    // Build shipment-level conditions
    const conditions = [eq(shipments.institution_id, institutionId)];
    if (options.mode === "year") {
      conditions.push(sql`extract(year from ${shipments.shipment_date})::int = ${options.year}`);
    } else if (options.mode === "range") {
      conditions.push(gte(shipments.shipment_date, parseDateOnlyToUtcStart(options.from)));
      conditions.push(lt(shipments.shipment_date, parseDateOnlyToUtcExclusiveEnd(options.to)));
    }
    const shipmentWhere = and(...conditions);

    // Resolve target shipment IDs
    const targetShipments = await tx
      .select({ id: shipments.id })
      .from(shipments)
      .where(shipmentWhere);

    if (targetShipments.length === 0) return { deleted: 0 };

    const shipmentIds = targetShipments.map((s) => s.id);

    // Resolve shipment item IDs (needed to target child rows that restrict shipment_items)
    const targetItems = await tx
      .select({ id: shipment_items.id })
      .from(shipment_items)
      .where(
        and(
          eq(shipment_items.institution_id, institutionId),
          inArray(shipment_items.shipment_id, shipmentIds),
        ),
      );

    const itemIds = targetItems.map((i) => i.id);

    // 1. Remove in_flight rows first — they have RESTRICT on shipment_items
    if (itemIds.length > 0) {
      await tx
        .delete(in_flight)
        .where(
          and(
            eq(in_flight.institution_id, institutionId),
            inArray(in_flight.shipment_item_id, itemIds),
          ),
        );

      await tx
        .delete(release_event_losses)
        .where(
          and(
            eq(release_event_losses.institution_id, institutionId),
            inArray(release_event_losses.shipment_item_id, itemIds),
          ),
        );
    }

    // 2. Remove release_events (CASCADE would clean up any remaining in_flight)
    await tx
      .delete(release_events)
      .where(
        and(
          eq(release_events.institution_id, institutionId),
          inArray(release_events.shipment_id, shipmentIds),
        ),
      );

    // 3. Remove shipment_items
    if (itemIds.length > 0) {
      await tx
        .delete(shipment_items)
        .where(
          and(
            eq(shipment_items.institution_id, institutionId),
            inArray(shipment_items.shipment_id, shipmentIds),
          ),
        );
    }

    // 4. Remove shipments and return count
    const deleted = await tx.delete(shipments).where(shipmentWhere).returning({ id: shipments.id });

    return { deleted: deleted.length };
  });
}
