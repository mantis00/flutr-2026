import {
  computeReleaseEditBounds,
  computeReleaseEditLossFieldCap,
  computeSignedReleaseBaseline,
  ZERO_RELEASE_EDIT_LOSSES,
} from "@/components/tenant/releases/release-edit-capacity";
import type { ShipmentItemRow } from "@/components/tenant/shipments/types";
import {
  applyGoodEmergenceDelta,
  calculateRemaining,
  RELEASE_ERRORS,
} from "@/lib/queries/releases";

function makeItem(overrides: Partial<ShipmentItemRow> = {}): ShipmentItemRow {
  return {
    id: 101,
    butterflySpeciesId: 1,
    scientificName: "Danaus plexippus",
    commonName: "Monarch",
    images: [],
    numberReceived: 100,
    emergedInTransit: 0,
    damagedInTransit: 0,
    diseasedInTransit: 0,
    parasite: 0,
    nonEmergence: 0,
    poorEmergence: 0,
    inFlightQuantity: 20,
    goodEmergence: 20,
    ...overrides,
  };
}

function toServerItem(item: ShipmentItemRow) {
  return {
    id: item.id,
    shipment_id: 55,
    number_received: item.numberReceived,
    emerged_in_transit: item.emergedInTransit,
    damaged_in_transit: item.damagedInTransit,
    diseased_in_transit: item.diseasedInTransit,
    parasite: item.parasite,
    non_emergence: item.nonEmergence,
    poor_emergence: item.poorEmergence,
    good_emergence: item.goodEmergence,
  };
}

describe("signed release-edit capacity", () => {
  it.each([
    ["positive", 30, 20, 10, 0, 90],
    ["zero", 20, 20, 0, 0, 100],
    ["negative", 15, 20, -5, 5, 105],
  ])(
    "matches the server for a %s aggregate-minus-event baseline",
    (_label, goodEmergence, originalRelease, expectedBaseline, expectedMin, expectedMax) => {
      const item = makeItem({ goodEmergence, inFlightQuantity: originalRelease });
      const signedBaseline = computeSignedReleaseBaseline(goodEmergence, originalRelease);
      const bounds = computeReleaseEditBounds({
        item,
        desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalRelease,
      });

      expect(signedBaseline).toBe(expectedBaseline);
      expect(bounds).toEqual({ min: expectedMin, max: expectedMax, isFeasible: true });
      expect(bounds.max).toBe(calculateRemaining(toServerItem(item), signedBaseline));
    },
  );

  it("prevents a negative resulting aggregate when the event exceeds Good Emergence", () => {
    const goodEmergence = 15;
    const originalRelease = 20;
    const item = makeItem({ goodEmergence, inFlightQuantity: originalRelease });
    const bounds = computeReleaseEditBounds({
      item,
      desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
      originalLosses: ZERO_RELEASE_EDIT_LOSSES,
      originalRelease,
    });

    expect(bounds.min).toBe(5);
    expect(applyGoodEmergenceDelta(goodEmergence, bounds.min - originalRelease)).toBe(0);
    expect(() => applyGoodEmergenceDelta(goodEmergence, bounds.min - 1 - originalRelease)).toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW,
    );
  });

  it("identifies a negative-baseline range as infeasible when losses exceed Received", () => {
    const item = makeItem({
      numberReceived: 100,
      damagedInTransit: 110,
      goodEmergence: 15,
      inFlightQuantity: 20,
    });

    expect(
      computeReleaseEditBounds({
        item,
        desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalRelease: 20,
      }),
    ).toEqual({ min: 5, max: 0, isFeasible: false });
  });

  it("becomes feasible when reducing this event's losses repairs the accounting range", () => {
    const item = makeItem({
      numberReceived: 100,
      damagedInTransit: 110,
      goodEmergence: 15,
      inFlightQuantity: 20,
    });
    const originalLosses = { ...ZERO_RELEASE_EDIT_LOSSES, damagedInTransit: 20 };

    const infeasible = computeReleaseEditBounds({
      item,
      desiredLosses: { ...ZERO_RELEASE_EDIT_LOSSES, damagedInTransit: 11 },
      originalLosses,
      originalRelease: 20,
    });
    const boundary = computeReleaseEditBounds({
      item,
      desiredLosses: { ...ZERO_RELEASE_EDIT_LOSSES, damagedInTransit: 10 },
      originalLosses,
      originalRelease: 20,
    });

    expect(infeasible).toEqual({ min: 5, max: 4, isFeasible: false });
    expect(boundary).toEqual({ min: 5, max: 5, isFeasible: true });
  });

  it.each([
    ["positive", 30, 20, 70],
    ["zero", 20, 20, 80],
    ["negative", 15, 20, 85],
  ])(
    "uses the same %s signed baseline for loss-field capacity",
    (_label, goodEmergence, originalRelease, expectedCap) => {
      const item = makeItem({ goodEmergence, inFlightQuantity: originalRelease });

      expect(
        computeReleaseEditLossFieldCap({
          item,
          field: "poorEmergence",
          desiredRelease: 20,
          desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
          originalLosses: ZERO_RELEASE_EDIT_LOSSES,
          originalRelease,
        }),
      ).toBe(expectedCap);
    },
  );

  it("preserves NULL handling for the defensive edit path", () => {
    const item = makeItem({ goodEmergence: null, inFlightQuantity: 0 });

    expect(
      computeReleaseEditBounds({
        item,
        desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalRelease: 0,
      }),
    ).toEqual({ min: 0, max: 0, isFeasible: true });
    expect(
      computeReleaseEditLossFieldCap({
        item,
        field: "poorEmergence",
        desiredRelease: 0,
        desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalRelease: 0,
      }),
    ).toBe(100);
  });
});
