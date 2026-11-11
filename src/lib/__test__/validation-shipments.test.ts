import { createShipmentBodySchema, updateShipmentBodySchema } from "@/lib/validation/shipments";

const createPayload = {
  supplier_code: "SUP-1",
  shipment_date: "2026-01-10",
  arrival_date: "2026-01-11",
  items: [
    {
      butterfly_species_id: 1,
      number_received: 10,
      emerged_in_transit: 0,
      damaged_in_transit: 0,
      diseased_in_transit: 0,
      parasite: 3,
      parasite_details: [
        { type: "wasp", count: 2 },
        { type: "fly", count: 1, description: "Small fly" },
      ],
      non_emergence: 0,
      poor_emergence: 0,
    },
  ],
};

describe("shipment parasite details validation", () => {
  it("accepts multiple parasite types whose counts match the parasite total", () => {
    expect(createShipmentBodySchema.safeParse(createPayload).success).toBe(true);
  });

  it("requires a description when Other has a positive count", () => {
    const result = createShipmentBodySchema.safeParse({
      ...createPayload,
      items: [
        {
          ...createPayload.items[0],
          parasite: 1,
          parasite_details: [{ type: "other", count: 1 }],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ message: "A description is required for Other" }),
      );
    }
  });

  it("rejects parasite detail totals that differ from the entered parasite total", () => {
    const result = createShipmentBodySchema.safeParse({
      ...createPayload,
      items: [
        {
          ...createPayload.items[0],
          parasite: 3,
          parasite_details: [{ type: "wasp", count: 2 }],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          message: "Parasite count must equal the classified and unclassified counts",
        }),
      );
    }
  });

  it("allows unclassified counts for legacy-compatible updates while preserving totals", () => {
    const result = updateShipmentBodySchema.safeParse({
      update_items: [
        {
          id: 1,
          number_received: 10,
          emerged_in_transit: 0,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 3,
          parasite_unclassified: 2,
          parasite_details: [{ type: "wasp", count: 1 }],
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
