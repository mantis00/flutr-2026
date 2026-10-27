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
    // Negative baseline: the physical in_flight floor (0, since this event's
    // own 20 is the item's entire in_flight here) is more restrictive than
    // the signed aggregate baseline (-5) alone, so max is floored at 100 —
    // not 105. Allowing 105 here would let this single event's actual
    // in_flight quantity exceed numberReceived (100), which is physically
    // impossible regardless of the aggregate bookkeeping.
    ["negative", 15, 20, -5, 5, 100],
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
      // Outside-event physical in_flight is 0 for every row in this table
      // (inFlightQuantity === originalRelease), so the physical reserve here
      // equals the signed baseline floored at 0.
      expect(bounds.max).toBe(calculateRemaining(toServerItem(item), Math.max(signedBaseline, 0)));
    },
  );

  it("enforces the independent physical in_flight floor when it exceeds the signed aggregate baseline", () => {
    // 40 total in_flight for the item, only 5 of which belong to this event
    // (originalRelease: 5) — 35 are genuinely committed by other release
    // events. The signed aggregate baseline alone (15 - 5 = 10) would wrongly
    // allow this event's quantity up to 90; the 35 held elsewhere floors the
    // real maximum at 65.
    const item = makeItem({ goodEmergence: 15, inFlightQuantity: 40 });
    const bounds = computeReleaseEditBounds({
      item,
      desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
      originalLosses: ZERO_RELEASE_EDIT_LOSSES,
      originalRelease: 5,
    });

    expect(bounds).toEqual({ min: 0, max: 65, isFeasible: true });
  });

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

    // The physical floor (0, since inFlightQuantity === originalRelease here)
    // ties with the signed aggregate baseline (-5) floored at 0, so the true
    // boundary is 5 (not 10, as it would be under the aggregate-only
    // formula): received(100) - shipmentLossesOutsideEvent(90) - DL - 0 >= min(5).
    const infeasible = computeReleaseEditBounds({
      item,
      desiredLosses: { ...ZERO_RELEASE_EDIT_LOSSES, damagedInTransit: 6 },
      originalLosses,
      originalRelease: 20,
    });
    const boundary = computeReleaseEditBounds({
      item,
      desiredLosses: { ...ZERO_RELEASE_EDIT_LOSSES, damagedInTransit: 5 },
      originalLosses,
      originalRelease: 20,
    });

    expect(infeasible).toEqual({ min: 5, max: 4, isFeasible: false });
    expect(boundary).toEqual({ min: 5, max: 5, isFeasible: true });
  });

  it.each([
    ["positive", 30, 20, 70],
    ["zero", 20, 20, 80],
    // Negative baseline: as above, the physical floor (0 here) is more
    // restrictive than the signed aggregate baseline (-5), so the cap is 80,
    // not 85 — 85 would let this event's losses plus its own 20-quantity
    // release exceed numberReceived (100).
    ["negative", 15, 20, 80],
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

  it("applies the same independent physical floor to the loss-field cap", () => {
    const item = makeItem({ goodEmergence: 15, inFlightQuantity: 40 });

    expect(
      computeReleaseEditLossFieldCap({
        item,
        field: "poorEmergence",
        desiredRelease: 5,
        desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalRelease: 5,
      }),
    ).toBe(60);
  });

  it("restores the physical in_flight floor for a NULL aggregate when other events hold real quantity", () => {
    // 30 in_flight for the item, none of it from this event (originalRelease:
    // 0) — all 30 are committed by other release events. The old
    // signedBaseline-only formula (0 for NULL) ignored this entirely and
    // would hand back the full 100.
    const item = makeItem({ goodEmergence: null, inFlightQuantity: 30 });

    expect(
      computeReleaseEditLossFieldCap({
        item,
        field: "poorEmergence",
        desiredRelease: 0,
        desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalRelease: 0,
      }),
    ).toBe(70);
  });

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

  it("pins the Released control to its existing quantity when good_emergence is NULL but the event already carries a positive quantity", () => {
    // A NULL aggregate must not allow this event's existing release quantity
    // to be edited in either direction: {min: 0, max: 0} would let a user
    // decrement a real event quantity down to 0, which the server rejects
    // with GOOD_EMERGENCE_UNTRACKED — contradicting the "cannot be changed"
    // guidance shown for this row. Pinning min/max to the original quantity
    // keeps the range feasible (so loss-only corrections stay available)
    // without permitting any change to the Released quantity itself.
    const item = makeItem({ goodEmergence: null, inFlightQuantity: 30 });

    expect(
      computeReleaseEditBounds({
        item,
        desiredLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalLosses: ZERO_RELEASE_EDIT_LOSSES,
        originalRelease: 30,
      }),
    ).toEqual({ min: 30, max: 30, isFeasible: true });
  });
});
