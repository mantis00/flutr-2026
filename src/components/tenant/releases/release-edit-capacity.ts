import type { ShipmentItemRow } from "@/components/tenant/shipments/types";

export type ReleaseEditLossField =
  | "damagedInTransit"
  | "diseasedInTransit"
  | "parasite"
  | "nonEmergence"
  | "poorEmergence";

export type ReleaseEditLossValues = Record<ReleaseEditLossField, number>;

export interface ReleaseEditBounds {
  min: number;
  max: number;
  isFeasible: boolean;
}

export const ZERO_RELEASE_EDIT_LOSSES: ReleaseEditLossValues = {
  damagedInTransit: 0,
  diseasedInTransit: 0,
  parasite: 0,
  nonEmergence: 0,
  poorEmergence: 0,
};

export function sumReleaseEditLosses(values: ReleaseEditLossValues): number {
  return (
    values.damagedInTransit +
    values.diseasedInTransit +
    values.parasite +
    values.nonEmergence +
    values.poorEmergence
  );
}

/**
 * Aggregate Released that belongs outside the event being edited. This must
 * remain signed: a manual aggregate adjustment can legitimately make the
 * event's existing quantity larger than the stored aggregate.
 */
export function computeSignedReleaseBaseline(
  goodEmergence: number,
  originalRelease: number,
): number {
  return goodEmergence - originalRelease;
}

/**
 * Actual physical in-flight quantity committed by every *other* release
 * event for this item. Excludes this event's own original quantity so it
 * isn't double-counted against the signed aggregate baseline above.
 */
function computeReleasedOutsideEvent(item: ShipmentItemRow, originalRelease: number): number {
  return Math.max(0, item.inFlightQuantity - originalRelease);
}

function computeShipmentLossesOutsideEvent(
  item: ShipmentItemRow,
  originalLosses: ReleaseEditLossValues,
): number {
  const currentShipmentLossTotal =
    item.emergedInTransit +
    item.damagedInTransit +
    item.diseasedInTransit +
    item.parasite +
    item.nonEmergence +
    item.poorEmergence;

  return Math.max(0, currentShipmentLossTotal - sumReleaseEditLosses(originalLosses));
}

/**
 * Client bounds for replacing one event's release quantity. The maximum
 * enforces two independent safeguards, mirroring the server: stored Good
 * Emergence after the signed event delta cannot exceed Received (the
 * aggregate baseline), and actual `in_flight` after replacing this event's
 * original quantity cannot exceed Received either (the physical baseline) —
 * whichever reservation is larger wins, since the two can legitimately
 * diverge. The minimum mirrors the signed-delta underflow guard so the
 * resulting stored Good Emergence cannot become negative.
 *
 * A `null` aggregate Released pins the control at its original quantity:
 * the event's release quantity cannot be changed while the aggregate
 * remains unknown, but the range stays feasible so loss-only corrections
 * are not blocked.
 */
export function computeReleaseEditBounds(params: {
  item: ShipmentItemRow;
  desiredLosses: ReleaseEditLossValues;
  originalLosses: ReleaseEditLossValues;
  originalRelease: number;
}): ReleaseEditBounds {
  const { item, desiredLosses, originalLosses, originalRelease } = params;

  if (item.goodEmergence === null) {
    return { min: originalRelease, max: originalRelease, isFeasible: true };
  }

  const signedBaseline = computeSignedReleaseBaseline(item.goodEmergence, originalRelease);
  const releasedOutsideEvent = computeReleasedOutsideEvent(item, originalRelease);
  const physicalReserve = Math.max(signedBaseline, releasedOutsideEvent);
  const shipmentLossesOutsideEvent = computeShipmentLossesOutsideEvent(item, originalLosses);
  const desiredEventLossTotal = sumReleaseEditLosses(desiredLosses);
  const max =
    item.numberReceived - shipmentLossesOutsideEvent - desiredEventLossTotal - physicalReserve;

  const min = Math.max(0, -signedBaseline);
  const clampedMax = Math.max(0, max);

  return { min, max: clampedMax, isFeasible: min <= clampedMax };
}

/**
 * Per-loss-field maximum while replacing one event. NULL aggregate Released
 * retains the existing loss-only behavior; numeric baselines enforce the
 * same two independent reservations (signed aggregate baseline, actual
 * physical in_flight outside this event) as the Released stepper above.
 */
export function computeReleaseEditLossFieldCap(params: {
  item: ShipmentItemRow;
  field: ReleaseEditLossField;
  desiredRelease: number;
  desiredLosses: ReleaseEditLossValues;
  originalLosses: ReleaseEditLossValues;
  originalRelease: number;
}): number {
  const { item, field, desiredRelease, desiredLosses, originalLosses, originalRelease } = params;
  const shipmentLossesOutsideEvent = computeShipmentLossesOutsideEvent(item, originalLosses);
  const signedBaseline =
    item.goodEmergence === null
      ? 0
      : computeSignedReleaseBaseline(item.goodEmergence, originalRelease);
  const releasedOutsideEvent = computeReleasedOutsideEvent(item, originalRelease);
  const physicalReserve = Math.max(signedBaseline, releasedOutsideEvent);
  const desiredLossesExcludingField = sumReleaseEditLosses(desiredLosses) - desiredLosses[field];
  const max =
    item.numberReceived -
    physicalReserve -
    shipmentLossesOutsideEvent -
    desiredRelease -
    desiredLossesExcludingField;

  return Math.max(0, max);
}
