import {
  computeItemEditReserve,
  computeItemRemaining,
  computeItemReleaseCap,
  computeShipmentReleasedTotal,
  formatReleasedQuantity,
  isGoodEmergenceTracked,
  type ShipmentItemRow,
} from "@/components/tenant/shipments/types";

function makeItem(overrides: Partial<ShipmentItemRow> = {}): ShipmentItemRow {
  return {
    id: 1,
    butterflySpeciesId: 100,
    scientificName: "Danaus plexippus",
    commonName: "Monarch",
    images: [],
    numberReceived: 0,
    emergedInTransit: 0,
    damagedInTransit: 0,
    diseasedInTransit: 0,
    parasite: 0,
    nonEmergence: 0,
    poorEmergence: 0,
    inFlightQuantity: 0,
    goodEmergence: 0,
    ...overrides,
  };
}

describe("shipment Released display", () => {
  it("uses numeric Good Emergence when no release events exist", () => {
    const item = makeItem({ goodEmergence: 80, inFlightQuantity: 0 });

    expect(computeShipmentReleasedTotal([item])).toBe(80);
    expect(formatReleasedQuantity(item.goodEmergence)).toBe("80");
  });

  it("preserves an explicit tracked zero instead of using event history", () => {
    const item = makeItem({ goodEmergence: 0, inFlightQuantity: 12 });

    expect(computeShipmentReleasedTotal([item])).toBe(0);
    expect(formatReleasedQuantity(item.goodEmergence)).toBe("0");
  });

  it("displays a null item Released value as Unknown", () => {
    expect(formatReleasedQuantity(null)).toBe("Unknown");
  });

  it("makes the shipment total unknown when known and unknown rows are mixed", () => {
    const items = [
      makeItem({ id: 1, goodEmergence: 80 }),
      makeItem({ id: 2, goodEmergence: null }),
      makeItem({ id: 3, goodEmergence: 10 }),
    ];

    const total = computeShipmentReleasedTotal(items);
    expect(total).toBeNull();
    expect(formatReleasedQuantity(total)).toBe("Unknown");
  });

  it("sums every Good Emergence value when the shipment is fully known", () => {
    const items = [
      makeItem({ id: 1, goodEmergence: 80, inFlightQuantity: 0 }),
      makeItem({ id: 2, goodEmergence: 0, inFlightQuantity: 5 }),
      makeItem({ id: 3, goodEmergence: 15, inFlightQuantity: 40 }),
    ];

    expect(computeShipmentReleasedTotal(items)).toBe(95);
  });
});

describe("computeItemEditReserve (shipment quantity controls)", () => {
  it("reserves aggregate Released when it exceeds the event-backed total", () => {
    expect(computeItemEditReserve(makeItem({ goodEmergence: 12, inFlightQuantity: 7 }))).toBe(12);
  });

  it("reserves the event-backed total when it exceeds aggregate Released", () => {
    expect(computeItemEditReserve(makeItem({ goodEmergence: 7, inFlightQuantity: 12 }))).toBe(12);
  });

  it("keeps the event-backed safeguard when aggregate Released is unknown", () => {
    expect(computeItemEditReserve(makeItem({ goodEmergence: null, inFlightQuantity: 9 }))).toBe(9);
  });

  it("treats a known aggregate Released zero as zero when no events exist", () => {
    expect(computeItemEditReserve(makeItem({ goodEmergence: 0, inFlightQuantity: 0 }))).toBe(0);
  });
});

describe("computeItemRemaining (shipment accounting display)", () => {
  it("returns received minus losses minus good_emergence in the normal case", () => {
    // number_received 100, losses 10, good_emergence 70 -> remaining 20
    const item = makeItem({
      numberReceived: 100,
      damagedInTransit: 4,
      diseasedInTransit: 2,
      parasite: 1,
      nonEmergence: 2,
      poorEmergence: 1,
      goodEmergence: 70,
    });
    expect(computeItemRemaining(item)).toBe(20);
  });

  it("returns 0 when fully accounted (received - losses - good_emergence = 0)", () => {
    const item = makeItem({
      numberReceived: 100,
      damagedInTransit: 4,
      diseasedInTransit: 2,
      parasite: 1,
      nonEmergence: 2,
      poorEmergence: 1,
      goodEmergence: 90,
    });
    expect(computeItemRemaining(item)).toBe(0);
  });

  it("forces remaining to 0 for a historical row with untracked (null) good_emergence", () => {
    const item = makeItem({
      numberReceived: 100,
      damagedInTransit: 10,
      goodEmergence: null,
    });
    expect(computeItemRemaining(item)).toBe(0);
  });

  it("clamps remaining at 0 when losses + good_emergence exceed received", () => {
    // Defensive: bad data shouldn't yield a negative remaining count that
    // would confuse downstream UI math.
    const item = makeItem({
      numberReceived: 10,
      damagedInTransit: 5,
      diseasedInTransit: 5,
      goodEmergence: 5,
    });
    expect(computeItemRemaining(item)).toBe(0);
  });

  it("returns 0 for an all-zero item", () => {
    expect(computeItemRemaining(makeItem())).toBe(0);
  });

  it("subtracts emergedInTransit from remaining inventory", () => {
    const item = makeItem({
      numberReceived: 8,
      emergedInTransit: 2,
      poorEmergence: 2,
      goodEmergence: 4,
    });

    expect(computeItemRemaining(item)).toBe(0);
  });

  it("keeps existing zero-emerged calculations unchanged", () => {
    const item = makeItem({
      numberReceived: 30,
      emergedInTransit: 0,
      poorEmergence: 2,
      goodEmergence: 20,
    });

    expect(computeItemRemaining(item)).toBe(8);
  });

  it("treats every loss column equally", () => {
    const lossColumns: Array<keyof ShipmentItemRow> = [
      "emergedInTransit",
      "damagedInTransit",
      "diseasedInTransit",
      "parasite",
      "nonEmergence",
      "poorEmergence",
    ];
    for (const column of lossColumns) {
      const item = makeItem({ numberReceived: 10, [column]: 4 });
      expect(computeItemRemaining(item)).toBe(6);
    }
  });
});

describe("computeItemReleaseCap (create/edit-release allocation capacity)", () => {
  it("matches computeItemRemaining for a normal tracked item", () => {
    const item = makeItem({
      numberReceived: 50,
      damagedInTransit: 2,
      diseasedInTransit: 1,
      parasite: 1,
      nonEmergence: 3,
      poorEmergence: 1,
      goodEmergence: 10,
    });
    expect(computeItemReleaseCap(item)).toBe(computeItemRemaining(item));
    expect(computeItemReleaseCap(item)).toBe(32);
  });

  it("does NOT force to 0 for a historical row with untracked (null) good_emergence", () => {
    // Unlike the display formula, an unknown total is treated as "nothing
    // subtracted yet" so loss-only corrections on historical rows remain
    // possible from the release composer. This cap alone is NOT sufficient
    // to gate the Good Emergence category, though — callers must also check
    // isGoodEmergenceTracked() and block that one category specifically (see
    // the describe block below). Any attempt to actually set a release
    // quantity against it is still rejected server-side.
    const item = makeItem({
      numberReceived: 100,
      damagedInTransit: 10,
      goodEmergence: null,
    });
    expect(computeItemReleaseCap(item)).toBe(90);
    expect(computeItemRemaining(item)).toBe(0);
    expect(isGoodEmergenceTracked(item)).toBe(false);
  });

  it("clamps at 0 when losses + good_emergence exceed received", () => {
    const item = makeItem({
      numberReceived: 10,
      damagedInTransit: 5,
      diseasedInTransit: 5,
      goodEmergence: 5,
    });
    expect(computeItemReleaseCap(item)).toBe(0);
  });
});

describe("isGoodEmergenceTracked", () => {
  it("returns true for a tracked (numeric) good_emergence, including 0", () => {
    expect(isGoodEmergenceTracked(makeItem({ goodEmergence: 0 }))).toBe(true);
    expect(isGoodEmergenceTracked(makeItem({ goodEmergence: 42 }))).toBe(true);
  });

  it("returns false for an untracked (null) good_emergence", () => {
    expect(isGoodEmergenceTracked(makeItem({ goodEmergence: null }))).toBe(false);
  });

  it("documents the split: Good Emergence must be blocked while loss capacity remains available", () => {
    // This is the exact scenario the create/edit-release UI must handle: a
    // historical row with room left under computeItemReleaseCap (so it's
    // still visible and loss-correctable in the composer), but
    // isGoodEmergenceTracked is false, so callers must cap the Good
    // Emergence category specifically at 0 regardless of this value —
    // mirroring the server's GOOD_EMERGENCE_UNTRACKED rejection — while every
    // other category keeps the full computeItemReleaseCap ceiling.
    const item = makeItem({ numberReceived: 100, damagedInTransit: 10, goodEmergence: null });

    expect(isGoodEmergenceTracked(item)).toBe(false); // Good Emergence: capacity must be forced to 0
    expect(computeItemReleaseCap(item)).toBe(90); // poorEmergence/diseased/parasite/nonEmergence: still 90
  });
});
