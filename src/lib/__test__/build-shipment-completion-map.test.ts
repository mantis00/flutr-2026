import { buildShipmentCompletionMap } from "@/lib/queries/shipments";

describe("buildShipmentCompletionMap", () => {
  it("passes through the pre-aggregated per-shipment remaining", () => {
    const map = buildShipmentCompletionMap([{ shipmentId: 1, itemCount: 2, remaining: 18 }]);

    expect(map.get(1)).toEqual({ remaining: 18, isCompleted: false });
  });

  it("flags isCompleted when remaining hits zero AND items exist", () => {
    const map = buildShipmentCompletionMap([{ shipmentId: 1, itemCount: 2, remaining: 0 }]);

    expect(map.get(1)).toEqual({ remaining: 0, isCompleted: true });
  });

  it("clamps remaining at zero defensively (SQL already clamps per item)", () => {
    // Shouldn't happen in practice since the SQL GREATEST(0, ...) clamps per
    // item before summing, but the helper must never report negative.
    const map = buildShipmentCompletionMap([{ shipmentId: 1, itemCount: 2, remaining: -5 }]);

    expect(map.get(1)).toEqual({ remaining: 0, isCompleted: true });
  });

  it("treats string numerics from PG as numbers", () => {
    // node-postgres can serialize bigint sums as strings if the ::int cast is
    // ever forgotten. The helper must coerce defensively.
    const map = buildShipmentCompletionMap([{ shipmentId: 1, itemCount: 1, remaining: "15" }]);

    expect(map.get(1)).toEqual({ remaining: 15, isCompleted: false });
  });

  it("defaults shipments with no items to in-progress when shipmentIds is provided", () => {
    // Empty shipments are surfaced as "still has work to do" so users can fill
    // them in instead of seeing them as completed shells.
    const map = buildShipmentCompletionMap([], [1, 2, 3]);

    expect(map.get(1)).toEqual({ remaining: 0, isCompleted: false });
    expect(map.get(2)).toEqual({ remaining: 0, isCompleted: false });
    expect(map.get(3)).toEqual({ remaining: 0, isCompleted: false });
  });

  it("does not synthesize entries for missing shipments when shipmentIds is omitted", () => {
    const map = buildShipmentCompletionMap([{ shipmentId: 1, itemCount: 1, remaining: 10 }]);

    expect(map.has(1)).toBe(true);
    expect(map.has(2)).toBe(false);
  });

  it("handles multiple shipments independently", () => {
    const map = buildShipmentCompletionMap([
      { shipmentId: 1, itemCount: 2, remaining: 0 },
      { shipmentId: 2, itemCount: 1, remaining: 10 },
    ]);

    expect(map.get(1)).toEqual({ remaining: 0, isCompleted: true });
    expect(map.get(2)).toEqual({ remaining: 10, isCompleted: false });
  });

  it("does NOT mark itemCount=0 shipments as completed even when remaining=0", () => {
    // Guards against the bug where empty shipments could otherwise look "done"
    // because their remaining sum is also zero.
    const map = buildShipmentCompletionMap([{ shipmentId: 1, itemCount: 0, remaining: 0 }]);

    expect(map.get(1)).toEqual({ remaining: 0, isCompleted: false });
  });
});
