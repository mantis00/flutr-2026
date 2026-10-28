/**
 * Shared shapes for the tenant shipment + release UIs.
 *
 * Field names match what the tenant API actually returns (camelCase) so
 * components don't have to translate at the boundary.
 */

import type { SpeciesImage } from "@/lib/wingspan/images";

export type SpeciesPickerOption = {
  id: number;
  scientificName: string;
  commonName: string;
  family: string;
  images: SpeciesImage[];
};

export type ShipmentListRow = {
  id: number;
  supplierCode: string;
  shipmentDate: string;
  arrivalDate: string;
  createdAt: string;
  remaining: number;
  isCompleted: boolean;
};

export type ShipmentItemRow = {
  id: number;
  butterflySpeciesId: number;
  scientificName: string;
  commonName: string;
  images: SpeciesImage[];
  numberReceived: number;
  emergedInTransit: number;
  damagedInTransit: number;
  diseasedInTransit: number;
  parasite: number;
  nonEmergence: number;
  poorEmergence: number;
  /**
   * Event-level actual in-flight total (sum of real `in_flight` rows).
   * Retained for the physical-inventory guards that must track real
   * releases regardless of accounting state: the force-edit metric caps and
   * the "cannot remove: already released" delete guard. NOT used for
   * Remaining/completion display or release-capacity caps — see
   * `goodEmergence` for those.
   */
  inFlightQuantity: number;
  /**
   * Authoritative aggregate for shipment Released displays, Remaining,
   * completion, and release capacity. It may legitimately differ from
   * `inFlightQuantity`; `null` means the historical Released outcome is
   * unknown (distinct from a tracked `0`).
   */
  goodEmergence: number | null;
};

export type ShipmentDetailHeader = {
  id: number;
  supplierCode: string;
  shipmentDate: string;
  arrivalDate: string;
  createdAt: string;
};

export type ShipmentDetailResponse = {
  shipment: ShipmentDetailHeader;
  items: ShipmentItemRow[];
};

export type ReleaseHistoryRow = {
  id: number;
  shipmentId: number;
  supplierCode: string;
  shipmentDate: string;
  releaseDate: string;
  releasedBy: string;
  /** Event-backed total for this release event, not aggregate Good Emergence. */
  totalReleased: number;
  totalLosses: number;
};

export type ReleaseEventDetail = {
  event: {
    id: number;
    shipmentId: number;
    releaseDate: string;
    releasedBy: string;
  };
  items: { id: number; shipmentItemId: number; quantity: number }[];
  losses: {
    id: number;
    shipmentItemId: number;
    damagedInTransit: number;
    diseasedInTransit: number;
    parasite: number;
    nonEmergence: number;
    poorEmergence: number;
  }[];
};

function computeGrossAvailable(item: ShipmentItemRow): number {
  return (
    item.numberReceived -
    item.emergedInTransit -
    item.damagedInTransit -
    item.diseasedInTransit -
    item.parasite -
    item.nonEmergence -
    item.poorEmergence
  );
}

/**
 * Compute the authoritative shipment-level Released total. A single
 * historical item whose Released value is unknown makes the aggregate
 * unknown; numeric values (including 0) are summed exactly. Event-backed
 * `inFlightQuantity` values are intentionally not consulted here.
 */
export function computeShipmentReleasedTotal(
  items: readonly Pick<ShipmentItemRow, "goodEmergence">[],
): number | null {
  let total = 0;

  for (const item of items) {
    if (item.goodEmergence === null) return null;
    total += item.goodEmergence;
  }

  return total;
}

/** Format a Released quantity without collapsing unknown historical data to 0. */
export function formatReleasedQuantity(value: number | null): string {
  return value === null ? "Unknown" : String(value);
}

/**
 * Quantity shipment editing must reserve before Received/loss controls can
 * allocate the rest. Aggregate Released and event-backed physical inventory
 * are independent safeguards, so the stricter current value wins.
 */
export function computeItemEditReserve(
  item: Pick<ShipmentItemRow, "goodEmergence" | "inFlightQuantity">,
): number {
  return Math.max(item.inFlightQuantity, item.goodEmergence ?? 0);
}

/**
 * Compute the remaining (outstanding) butterflies for a single shipment item,
 * for **display** (shipment detail / list Remaining + completion). Received
 * minus all loss columns minus `good_emergence`, clamped at 0. A `null`
 * `good_emergence` (historical, outcome untracked) forces remaining to 0 so
 * the item reads as accounted-for/complete instead of showing a false
 * "still has butterflies" count.
 *
 * For the allocation cap used by the create/edit-release flows, use
 * `computeItemReleaseCap` instead — it must NOT apply the null-forcing rule
 * (see that function's doc comment).
 */
export function computeItemRemaining(item: ShipmentItemRow): number {
  if (item.goodEmergence === null) return 0;
  return Math.max(0, computeGrossAvailable(item) - item.goodEmergence);
}

/**
 * Compute the remaining release/loss-correction capacity for a single
 * shipment item, for the create/edit-release flows. Mirrors the capacity
 * formula `calculateRemaining()` in `src/lib/queries/releases.ts` uses for
 * create/update release mutations: received minus all loss columns minus
 * `good_emergence`, clamped at 0 — but unlike `computeItemRemaining`, a
 * `null` `good_emergence` subtracts as 0 rather than forcing the whole
 * result to 0. This preserves the supported loss-only correction path for
 * historical unknown rows, but the server still rejects any actual
 * release-quantity change against them (`GOOD_EMERGENCE_UNTRACKED`).
 */
export function computeItemReleaseCap(item: ShipmentItemRow): number {
  return Math.max(0, computeGrossAvailable(item) - (item.goodEmergence ?? 0));
}

/**
 * Whether this item's Released total (`good_emergence`) is tracked and may
 * accept a new release-quantity allocation. Mirrors the server's
 * `assertGoodEmergenceTracked` / `GOOD_EMERGENCE_UNTRACKED` rule, so the
 * create/edit-release UI never lets a user enter a Good Emergence quantity
 * that is guaranteed to be rejected at submit time.
 *
 * Loss-only corrections (poor emergence, diseased, parasite, non-emergence)
 * are unaffected by this — the server permits those for untracked items too
 * — so this must gate only the Good Emergence / release-quantity allocation,
 * never the overall `computeItemReleaseCap` used for loss categories.
 */
export function isGoodEmergenceTracked(item: ShipmentItemRow): boolean {
  return item.goodEmergence !== null;
}
