import {
  assertGoodEmergenceTracked,
  applyGoodEmergenceDelta,
  calculateRemaining,
  computeCreateLossDelta,
  computeDeleteLossRollbackPatch,
  RELEASE_ERRORS,
} from "@/lib/queries/releases";

const baseItem = {
  id: 1,
  shipment_id: 10,
  number_received: 100,
  emerged_in_transit: 0,
  damaged_in_transit: 0,
  diseased_in_transit: 0,
  parasite: 0,
  non_emergence: 0,
  poor_emergence: 0,
  good_emergence: 0,
};

describe("calculateRemaining", () => {
  it("returns full number_received when no losses and nothing released", () => {
    expect(calculateRemaining(baseItem, 0)).toBe(100);
  });

  it("subtracts already-released from available", () => {
    expect(calculateRemaining(baseItem, 40)).toBe(60);
  });

  it("subtracts all loss columns before applying releases", () => {
    const item = {
      ...baseItem,
      emerged_in_transit: 6,
      damaged_in_transit: 5,
      diseased_in_transit: 3,
      parasite: 2,
      non_emergence: 4,
      poor_emergence: 1,
    };
    // available = 100 - 21 = 79; remaining = 79 - 20 = 59
    expect(calculateRemaining(item, 20)).toBe(59);
  });

  it("subtracts emerged_in_transit from remaining inventory", () => {
    const item = {
      ...baseItem,
      number_received: 8,
      emerged_in_transit: 2,
      poor_emergence: 2,
    };

    expect(calculateRemaining(item, 4)).toBe(0);
  });

  it("keeps existing zero-emerged calculations unchanged", () => {
    const item = {
      ...baseItem,
      number_received: 30,
      emerged_in_transit: 0,
      poor_emergence: 2,
    };

    expect(calculateRemaining(item, 20)).toBe(8);
  });

  it("returns 0 when exactly fully released", () => {
    expect(calculateRemaining(baseItem, 100)).toBe(0);
  });

  it("returns negative when over-released (caller enforces the guard)", () => {
    expect(calculateRemaining(baseItem, 110)).toBe(-10);
  });

  it("returns negative when losses exceed number_received", () => {
    const item = { ...baseItem, damaged_in_transit: 110 };
    expect(calculateRemaining(item, 0)).toBe(-10);
  });
});

describe("authoritative aggregate minus the edited event's existing quantity", () => {
  it("preserves a positive baseline outside the edited event", () => {
    const goodEmergence = 50;
    const existingEventQuantity = 20;
    const alreadyReleased = goodEmergence - existingEventQuantity;
    expect(alreadyReleased).toBe(30);
    expect(calculateRemaining({ ...baseItem, number_received: 100 }, alreadyReleased)).toBe(70);
  });

  it("preserves a zero baseline when aggregate and event quantity match", () => {
    const goodEmergence = 20;
    const existingEventQuantity = 20;
    const alreadyReleased = goodEmergence - existingEventQuantity;
    expect(alreadyReleased).toBe(0);
    expect(calculateRemaining(baseItem, alreadyReleased)).toBe(100);
  });

  it("preserves a negative baseline when the event exceeds a manually adjusted aggregate", () => {
    const goodEmergence = 15;
    const existingEventQuantity = 20;
    const alreadyReleased = goodEmergence - existingEventQuantity;
    expect(alreadyReleased).toBe(-5);
    expect(calculateRemaining(baseItem, alreadyReleased)).toBe(105);
  });
});

describe("computeCreateLossDelta", () => {
  const baseLosses = {
    damaged_in_transit: 2,
    diseased_in_transit: 3,
    parasite: 1,
    non_emergence: 4,
    poor_emergence: 5,
  };

  it("returns absolutePatch plus positive attributionDelta for increases", () => {
    const result = computeCreateLossDelta(baseLosses, {
      poor_emergence: 8,
      parasite: 1,
      non_emergence: 6,
    });

    expect(result.absolutePatch).toEqual({
      poor_emergence: 8,
      parasite: 1,
      non_emergence: 6,
    });
    expect(result.attributionDelta).toEqual({
      poor_emergence: 3,
      non_emergence: 2,
    });
  });

  it("returns empty attributionDelta when absolute values are unchanged", () => {
    const result = computeCreateLossDelta(baseLosses, {
      damaged_in_transit: 2,
      diseased_in_transit: 3,
    });

    expect(result.absolutePatch).toEqual({
      damaged_in_transit: 2,
      diseased_in_transit: 3,
    });
    expect(result.attributionDelta).toEqual({});
  });

  it("throws when an absolute loss total decreases in create flow", () => {
    expect(() =>
      computeCreateLossDelta(baseLosses, {
        poor_emergence: 4,
      }),
    ).toThrow(RELEASE_ERRORS.NEGATIVE_LOSS_DELTA);
  });
});

describe("computeDeleteLossRollbackPatch", () => {
  const currentLosses = {
    damaged_in_transit: 5,
    diseased_in_transit: 4,
    parasite: 3,
    non_emergence: 6,
    poor_emergence: 2,
  };

  it("subtracts event-level losses from current shipment loss totals", () => {
    const patch = computeDeleteLossRollbackPatch(currentLosses, {
      damaged_in_transit: 1,
      diseased_in_transit: 2,
      parasite: 0,
      non_emergence: 1,
      poor_emergence: 2,
    });

    expect(patch).toEqual({
      damaged_in_transit: 4,
      diseased_in_transit: 2,
      parasite: 3,
      non_emergence: 5,
      poor_emergence: 0,
    });
  });

  it("throws when rollback would drive any loss column below zero", () => {
    expect(() =>
      computeDeleteLossRollbackPatch(currentLosses, {
        damaged_in_transit: 0,
        diseased_in_transit: 0,
        parasite: 4,
        non_emergence: 0,
        poor_emergence: 0,
      }),
    ).toThrow(RELEASE_ERRORS.LOSS_TOTAL_UNDERFLOW);
  });
});

describe("assertGoodEmergenceTracked", () => {
  it("returns the value unchanged when numeric", () => {
    expect(assertGoodEmergenceTracked(5)).toBe(5);
  });

  it("treats an explicit zero as a tracked, valid value", () => {
    expect(assertGoodEmergenceTracked(0)).toBe(0);
  });

  it("throws GOOD_EMERGENCE_UNTRACKED when the value is null", () => {
    expect(() => assertGoodEmergenceTracked(null)).toThrow(RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED);
  });
});

describe("applyGoodEmergenceDelta", () => {
  it("adds a positive delta", () => {
    expect(applyGoodEmergenceDelta(5, 3)).toBe(8);
  });

  it("subtracts a negative delta down to exactly zero", () => {
    expect(applyGoodEmergenceDelta(5, -5)).toBe(0);
  });

  it("is a no-op for a zero delta", () => {
    expect(applyGoodEmergenceDelta(0, 0)).toBe(0);
  });

  it("throws GOOD_EMERGENCE_UNDERFLOW when the result would go negative", () => {
    expect(() => applyGoodEmergenceDelta(5, -6)).toThrow(RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW);
  });
});

describe("assertGoodEmergenceTracked + applyGoodEmergenceDelta composed (call order every call site uses)", () => {
  it("rejects with GOOD_EMERGENCE_UNTRACKED, never GOOD_EMERGENCE_UNDERFLOW, when current is null", () => {
    // Even though the delta below would also underflow if current were
    // treated as 0, the NULL check must run first and must be the error
    // that surfaces — arithmetic on an untracked row is never attempted.
    expect(() => applyGoodEmergenceDelta(assertGoodEmergenceTracked(null), -1)).toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED,
    );
  });

  it("proceeds to the underflow check once the value is confirmed numeric", () => {
    expect(() => applyGoodEmergenceDelta(assertGoodEmergenceTracked(3), -5)).toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW,
    );
  });
});
