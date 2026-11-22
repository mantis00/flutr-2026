import {
  createInFlightBodySchema,
  createReleaseFromShipmentSchema,
  listReleasesQuerySchema,
  updateInFlightQuantitySchema,
  updateReleaseEventItemsSchema,
} from "@/lib/validation/releases";

describe("createReleaseFromShipmentSchema", () => {
  const validBase = () => ({
    released_at: "2026-03-13T12:00:00.000Z",
    items: [
      { shipment_item_id: 1, quantity: 5 },
      { shipment_item_id: 2, quantity: 3 },
    ],
  });

  it("accepts a minimal valid payload (no loss_updates)", () => {
    const result = createReleaseFromShipmentSchema.safeParse(validBase());
    expect(result.success).toBe(true);
    if (result.success) {
      // loss_updates defaults to an empty array so downstream code never has
      // to null-check it.
      expect(result.data.loss_updates).toEqual([]);
    }
  });

  it("accepts a payload with loss_updates", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      loss_updates: [
        { shipment_item_id: 1, damaged_in_transit: 2, parasite: 1 },
        { shipment_item_id: 2, non_emergence: 4 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with no release items and no loss updates", () => {
    const result = createReleaseFromShipmentSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it("accepts a losses-only payload with empty items", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      items: [],
      loss_updates: [{ shipment_item_id: 1, poor_emergence: 2 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a losses-only payload when loss_updates rows are no-op", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      items: [],
      loss_updates: [{ shipment_item_id: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate shipment_item_id values in items", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      items: [
        { shipment_item_id: 1, quantity: 5 },
        { shipment_item_id: 1, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "items")).toBe(true);
    }
  });

  it("rejects duplicate shipment_item_id values in loss_updates", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      loss_updates: [
        { shipment_item_id: 1, damaged_in_transit: 1 },
        { shipment_item_id: 1, parasite: 2 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "loss_updates")).toBe(true);
    }
  });

  it("rejects non-positive quantities", () => {
    expect(
      createReleaseFromShipmentSchema.safeParse({
        items: [{ shipment_item_id: 1, quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      createReleaseFromShipmentSchema.safeParse({
        items: [{ shipment_item_id: 1, quantity: -3 }],
      }).success,
    ).toBe(false);
    expect(
      createReleaseFromShipmentSchema.safeParse({
        items: [{ shipment_item_id: 1, quantity: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects non-positive shipment_item_id", () => {
    expect(
      createReleaseFromShipmentSchema.safeParse({
        items: [{ shipment_item_id: 0, quantity: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects negative loss_updates values", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      loss_updates: [{ shipment_item_id: 1, damaged_in_transit: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("allows a loss_updates row with only the shipment_item_id (no-op row)", () => {
    // The schema permits this; the service applies no UPDATE for empty rows.
    // Keeping this permissive avoids forcing the client to filter empty rows
    // before sending.
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      loss_updates: [{ shipment_item_id: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level keys (strict mode)", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      sneaky: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys inside loss_updates rows (strict mode)", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      loss_updates: [{ shipment_item_id: 1, mystery_column: 2 }],
    });
    expect(result.success).toBe(false);
  });

  it("coerces stringified numbers in items and loss_updates", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      items: [{ shipment_item_id: "1", quantity: "5" }],
      loss_updates: [{ shipment_item_id: "1", parasite: "2" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0].quantity).toBe(5);
      expect(result.data.loss_updates?.[0]?.parasite).toBe(2);
    }
  });

  it("coerces released_at to a Date when provided", () => {
    const result = createReleaseFromShipmentSchema.safeParse(validBase());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.released_at).toBeInstanceOf(Date);
    }
  });

  it("accepts a plain YYYY-MM-DD released_at and normalizes it to UTC midnight", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      released_at: "2026-11-05",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.released_at?.toISOString()).toBe("2026-11-05T00:00:00.000Z");
    }
  });

  it("leaves released_at undefined when omitted", () => {
    const result = createReleaseFromShipmentSchema.safeParse({ items: validBase().items });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.released_at).toBeUndefined();
    }
  });

  it("rejects unparseable released_at strings", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      ...validBase(),
      released_at: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric strings inside coerced quantity fields", () => {
    const result = createReleaseFromShipmentSchema.safeParse({
      released_at: "2026-03-13T12:00:00.000Z",
      items: [{ shipment_item_id: "abc", quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateReleaseEventItemsSchema", () => {
  it("accepts a valid payload", () => {
    const result = updateReleaseEventItemsSchema.safeParse({
      items: [
        { shipment_item_id: 1, quantity: 9 },
        { shipment_item_id: 2, quantity: 4 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts event-level losses payload", () => {
    const result = updateReleaseEventItemsSchema.safeParse({
      items: [],
      losses: [
        {
          shipment_item_id: 1,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 2,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("allows zero quantities in items (edit can clear rows)", () => {
    const result = updateReleaseEventItemsSchema.safeParse({
      items: [{ shipment_item_id: 1, quantity: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects payloads with no items and no losses", () => {
    expect(updateReleaseEventItemsSchema.safeParse({ items: [] }).success).toBe(false);
  });

  it("rejects duplicate shipment_item_id values", () => {
    const result = updateReleaseEventItemsSchema.safeParse({
      items: [
        { shipment_item_id: 1, quantity: 1 },
        { shipment_item_id: 1, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate shipment_item_id values in losses", () => {
    const result = updateReleaseEventItemsSchema.safeParse({
      items: [{ shipment_item_id: 1, quantity: 1 }],
      losses: [
        {
          shipment_item_id: 2,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 1,
        },
        {
          shipment_item_id: 2,
          damaged_in_transit: 1,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys inside losses rows", () => {
    const result = updateReleaseEventItemsSchema.safeParse({
      items: [{ shipment_item_id: 1, quantity: 1 }],
      losses: [
        {
          shipment_item_id: 2,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 1,
          extra: 1,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level keys (strict mode)", () => {
    const result = updateReleaseEventItemsSchema.safeParse({
      items: [{ shipment_item_id: 1, quantity: 1 }],
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("createInFlightBodySchema", () => {
  it("accepts a valid payload", () => {
    expect(createInFlightBodySchema.safeParse({ shipment_item_id: 1, quantity: 3 }).success).toBe(
      true,
    );
  });

  it("rejects zero or negative quantities", () => {
    expect(createInFlightBodySchema.safeParse({ shipment_item_id: 1, quantity: 0 }).success).toBe(
      false,
    );
    expect(createInFlightBodySchema.safeParse({ shipment_item_id: 1, quantity: -1 }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys", () => {
    expect(
      createInFlightBodySchema.safeParse({ shipment_item_id: 1, quantity: 1, extra: 1 }).success,
    ).toBe(false);
  });
});

describe("updateInFlightQuantitySchema", () => {
  it("accepts positive integer quantities", () => {
    expect(updateInFlightQuantitySchema.safeParse({ quantity: 1 }).success).toBe(true);
    expect(updateInFlightQuantitySchema.safeParse({ quantity: 100 }).success).toBe(true);
  });

  it("rejects zero, negative, and fractional quantities", () => {
    expect(updateInFlightQuantitySchema.safeParse({ quantity: 0 }).success).toBe(false);
    expect(updateInFlightQuantitySchema.safeParse({ quantity: -2 }).success).toBe(false);
    expect(updateInFlightQuantitySchema.safeParse({ quantity: 1.5 }).success).toBe(false);
  });
});

describe("listReleasesQuerySchema", () => {
  it("defaults page=1 and limit=50 when no params provided", () => {
    const result = listReleasesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ page: 1, limit: 50 });
    }
  });

  it("coerces stringified numbers", () => {
    const result = listReleasesQuerySchema.safeParse({ page: "3", limit: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ page: 3, limit: 25 });
    }
  });

  it("rejects non-numeric strings", () => {
    expect(listReleasesQuerySchema.safeParse({ page: "abc" }).success).toBe(false);
    expect(listReleasesQuerySchema.safeParse({ limit: "xx" }).success).toBe(false);
  });

  it("rejects zero or negative page/limit", () => {
    expect(listReleasesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listReleasesQuerySchema.safeParse({ page: -1 }).success).toBe(false);
    expect(listReleasesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(listReleasesQuerySchema.safeParse({ limit: -10 }).success).toBe(false);
  });

  it("rejects fractional page/limit", () => {
    expect(listReleasesQuerySchema.safeParse({ page: 1.5 }).success).toBe(false);
    expect(listReleasesQuerySchema.safeParse({ limit: 50.5 }).success).toBe(false);
  });

  it("caps limit at 200", () => {
    expect(listReleasesQuerySchema.safeParse({ limit: 200 }).success).toBe(true);
    expect(listReleasesQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(listReleasesQuerySchema.safeParse({ limit: 9999 }).success).toBe(false);
  });

  it("rejects unknown keys (strict mode)", () => {
    expect(listReleasesQuerySchema.safeParse({ page: 1, sort: "asc" }).success).toBe(false);
  });
});
