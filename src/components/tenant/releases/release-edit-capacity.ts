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
 * mirrors the server's `calculateRemaining(item, goodEmergence -
 * originalRelease)`. The minimum mirrors the signed-delta underflow guard so
 * the resulting stored Good Emergence cannot become negative.
 */
export function computeReleaseEditBounds(params: {
  item: ShipmentItemRow;
  desiredLosses: ReleaseEditLossValues;
  originalLosses: ReleaseEditLossValues;
  originalRelease: number;
}): ReleaseEditBounds {
  const { item, desiredLosses, originalLosses, originalRelease } = params;

  if (item.goodEmergence === null) return { min: 0, max: 0, isFeasible: true };

  const signedBaseline = computeSignedReleaseBaseline(item.goodEmergence, originalRelease);
  const shipmentLossesOutsideEvent = computeShipmentLossesOutsideEvent(item, originalLosses);
  const desiredEventLossTotal = sumReleaseEditLosses(desiredLosses);
  const max =
    item.numberReceived - shipmentLossesOutsideEvent - desiredEventLossTotal - signedBaseline;

  const min = Math.max(0, -signedBaseline);
  const clampedMax = Math.max(0, max);

  return { min, max: clampedMax, isFeasible: min <= clampedMax };
}

/**
 * Per-loss-field maximum while replacing one event. NULL aggregate Released
 * retains the existing loss-only behavior; numeric baselines stay signed so
 * this calculation matches the server's post-delta accounting.
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
  const desiredLossesExcludingField = sumReleaseEditLosses(desiredLosses) - desiredLosses[field];
  const max =
    item.numberReceived -
    signedBaseline -
    shipmentLossesOutsideEvent -
    desiredRelease -
    desiredLossesExcludingField;

  return Math.max(0, max);
}
