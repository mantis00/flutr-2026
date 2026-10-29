const mockTransaction = jest.fn();
const mockSelect = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    transaction: mockTransaction,
    select: mockSelect,
  },
}));

jest.mock("@/lib/queries/species", () => ({
  ensureSpeciesLinksForInstitution: jest.fn(),
}));

import {
  in_flight,
  release_event_losses,
  release_events,
  shipments,
  shipment_items,
} from "@/lib/schema";
import {
  createShipment,
  deleteShipment,
  listShipmentExportRows,
  SHIPMENT_ERRORS,
  shipmentHeaderExists,
  updateShipment,
} from "@/lib/queries/shipments";
import { ensureSpeciesLinksForInstitution } from "@/lib/queries/species";
import type { UpdateShipmentBody } from "@/lib/validation/shipments";
import { createThenableQuery } from "@/__test__/api/_utils/mockDb";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mockEnsureSpeciesLinksForInstitution = ensureSpeciesLinksForInstitution as jest.Mock;

function buildInsertStub() {
  const shipmentsReturning = jest.fn().mockResolvedValue([{ id: 101 }]);
  const shipmentValues = jest.fn(() => ({ returning: shipmentsReturning }));
  const itemValues = jest.fn().mockResolvedValue(undefined);

  const insert = jest.fn((table) => {
    if (table === shipments) {
      return { values: shipmentValues };
    }

    if (table === shipment_items) {
      return { values: itemValues };
    }

    throw new Error("Unexpected table");
  });

  return {
    insert,
    shipmentValues,
    shipmentsReturning,
    itemValues,
  };
}

function createLockableQuery<T>(rows: T[]) {
  const query = createThenableQuery(rows) as ReturnType<typeof createThenableQuery<T>> & {
    for: jest.Mock;
  };
  query.for = jest.fn(() => query);
  return query;
}

function createDeleteStub() {
  const deleteOrder: unknown[] = [];

  const deleteMock = jest.fn((table) => {
    deleteOrder.push(table);
    type DeleteBuilder = {
      where: jest.Mock<DeleteBuilder, []>;
      returning: jest.Mock<Promise<Array<{ id: number }>>, []>;
    };
    const builder = {} as DeleteBuilder;
    builder.where = jest.fn(() => builder);
    builder.returning = jest.fn().mockResolvedValue(table === shipments ? [{ id: 55 }] : []);
    return builder;
  });

  return { deleteMock, deleteOrder };
}

function updateItemPayload(
  overrides: Partial<NonNullable<UpdateShipmentBody["update_items"]>[number]> = {},
) {
  return {
    id: 7,
    number_received: 10,
    emerged_in_transit: 0,
    damaged_in_transit: 0,
    diseased_in_transit: 0,
    parasite: 0,
    non_emergence: 0,
    poor_emergence: 0,
    ...overrides,
  };
}

function buildItemUpdateTx(goodEmergence: number | null, inFlightTotal: number) {
  const itemUpdateWhere = jest.fn().mockResolvedValue(undefined);
  const itemUpdateSet = jest.fn(() => ({ where: itemUpdateWhere }));
  const tx = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(() => ({ set: itemUpdateSet })),
    delete: jest.fn(),
  };

  tx.select
    .mockImplementationOnce(() => createThenableQuery([{ id: 55 }]))
    .mockImplementationOnce(() => createLockableQuery([{ id: 7, goodEmergence }]))
    .mockImplementationOnce(() => createThenableQuery([{ total: inFlightTotal }]));

  return { tx, itemUpdateSet };
}

describe("shipment queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("formats both exported shipment dates as date-only SQL strings", async () => {
    mockSelect.mockReturnValueOnce(createThenableQuery([]));

    await listShipmentExportRows(77);

    const selection = mockSelect.mock.calls[0][0] as {
      shipmentDate: SQL.Aliased<string>;
      arrivalDate: SQL.Aliased<string>;
    };
    const dialect = new PgDialect();

    expect(dialect.sqlToQuery(selection.shipmentDate.sql).sql).toBe(
      `to_char("shipments"."shipment_date", 'YYYY-MM-DD')`,
    );
    expect(dialect.sqlToQuery(selection.arrivalDate.sql).sql).toBe(
      `to_char("shipments"."arrival_date", 'YYYY-MM-DD')`,
    );
  });

  it("ensures institution-species links before inserting manual shipment items", async () => {
    const insertStub = buildInsertStub();
    const tx = {
      insert: insertStub.insert,
    };

    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    const shipmentId = await createShipment(77, {
      supplier_code: "SUP-1",
      shipment_date: new Date("2026-06-10T00:00:00.000Z"),
      arrival_date: new Date("2026-06-11T00:00:00.000Z"),
      items: [
        {
          butterfly_species_id: 4,
          number_received: 12,
          emerged_in_transit: 1,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
        {
          butterfly_species_id: 9,
          number_received: 6,
          emerged_in_transit: 0,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
    });

    expect(shipmentId).toBe(101);
    expect(mockEnsureSpeciesLinksForInstitution).toHaveBeenCalledWith(77, [4, 9], tx);
    expect(insertStub.itemValues).toHaveBeenCalledWith([
      expect.objectContaining({
        institution_id: 77,
        shipment_id: 101,
        butterfly_species_id: 4,
      }),
      expect.objectContaining({
        institution_id: 77,
        shipment_id: 101,
        butterfly_species_id: 9,
      }),
    ]);
  });

  it("ensures institution-species links before adding manual shipment items on edit", async () => {
    const itemValues = jest.fn().mockResolvedValue(undefined);
    const tx = {
      select: jest.fn(() => createThenableQuery([{ id: 55 }])),
      insert: jest.fn((table) => {
        if (table === shipment_items) {
          return { values: itemValues };
        }

        throw new Error("Unexpected table");
      }),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    const result = await updateShipment(77, 55, {
      add_items: [
        {
          butterfly_species_id: 12,
          number_received: 4,
          emerged_in_transit: 0,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
    });

    expect(result).toBe(true);
    expect(mockEnsureSpeciesLinksForInstitution).toHaveBeenCalledWith(77, [12], tx);
    expect(itemValues).toHaveBeenCalledWith([
      expect.objectContaining({
        institution_id: 77,
        shipment_id: 55,
        butterfly_species_id: 12,
      }),
    ]);
  });

  it("counts emerged_in_transit when preventing inventory reductions below released total", async () => {
    const { tx } = buildItemUpdateTx(0, 5);

    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      updateShipment(77, 55, {
        update_items: [
          updateItemPayload({
            number_received: 8,
            emerged_in_transit: 2,
            poor_emergence: 2,
          }),
        ],
      }),
    ).rejects.toThrow(SHIPMENT_ERRORS.INVALID_INVENTORY_REDUCTION);
  });

  it("rejects an item edit when numeric Good Emergence exceeds post-edit availability", async () => {
    const { tx } = buildItemUpdateTx(6, 4);
    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      updateShipment(77, 55, {
        update_items: [updateItemPayload({ number_received: 5 })],
      }),
    ).rejects.toThrow(SHIPMENT_ERRORS.GOOD_EMERGENCE_EXCEEDS_AVAILABLE);
  });

  it("independently rejects an item edit when event-backed quantity exceeds availability", async () => {
    const { tx } = buildItemUpdateTx(4, 6);
    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      updateShipment(77, 55, {
        update_items: [updateItemPayload({ number_received: 5 })],
      }),
    ).rejects.toThrow(SHIPMENT_ERRORS.INVALID_INVENTORY_REDUCTION);
  });

  it("permits divergent Good Emergence and event totals when post-edit availability covers both", async () => {
    const { tx, itemUpdateSet } = buildItemUpdateTx(8, 5);
    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      updateShipment(77, 55, {
        update_items: [
          updateItemPayload({
            number_received: 10,
            emerged_in_transit: 1,
            damaged_in_transit: 1,
          }),
        ],
      }),
    ).resolves.toBe(true);

    expect(itemUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        number_received: 10,
        emerged_in_transit: 1,
        damaged_in_transit: 1,
      }),
    );
  });

  it("retains the event-backed guard when Good Emergence is NULL", async () => {
    const { tx } = buildItemUpdateTx(null, 6);
    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      updateShipment(77, 55, {
        update_items: [updateItemPayload({ number_received: 5 })],
      }),
    ).rejects.toThrow(SHIPMENT_ERRORS.INVALID_INVENTORY_REDUCTION);
  });

  it("accepts a fully accounted item with known zero Good Emergence", async () => {
    const { tx } = buildItemUpdateTx(0, 0);
    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      updateShipment(77, 55, {
        update_items: [
          updateItemPayload({
            number_received: 6,
            emerged_in_transit: 1,
            damaged_in_transit: 1,
            diseased_in_transit: 1,
            parasite: 1,
            non_emergence: 1,
            poor_emergence: 1,
          }),
        ],
      }),
    ).resolves.toBe(true);
  });

  it("requires an edited legacy-invalid item to become fully valid", async () => {
    const { tx } = buildItemUpdateTx(10, 0);
    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(
      updateShipment(77, 55, {
        update_items: [updateItemPayload({ number_received: 9 })],
      }),
    ).rejects.toThrow(SHIPMENT_ERRORS.GOOD_EMERGENCE_EXCEEDS_AVAILABLE);
  });

  it("allows a header-only update without inspecting unrelated legacy-invalid items", async () => {
    const headerUpdateWhere = jest.fn().mockResolvedValue(undefined);
    const headerUpdateSet = jest.fn(() => ({ where: headerUpdateWhere }));
    const tx = {
      select: jest.fn(() => createThenableQuery([{ id: 55 }])),
      update: jest.fn(() => ({ set: headerUpdateSet })),
    };
    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(updateShipment(77, 55, { supplier_code: "SUP-2" })).resolves.toBe(true);

    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(headerUpdateSet).toHaveBeenCalledWith({ supplier_code: "SUP-2" });
  });

  describe("createShipment: good_emergence and transaction-executor support", () => {
    function buildItem(overrides: Record<string, unknown> = {}) {
      return {
        butterfly_species_id: 4,
        number_received: 12,
        emerged_in_transit: 0,
        damaged_in_transit: 0,
        diseased_in_transit: 0,
        parasite: 0,
        non_emergence: 0,
        poor_emergence: 0,
        ...overrides,
      };
    }

    it("defaults good_emergence to 0 when the field is omitted (manual-create compatibility)", async () => {
      const insertStub = buildInsertStub();
      mockTransaction.mockImplementationOnce(async (callback) =>
        callback({ insert: insertStub.insert }),
      );

      await createShipment(77, {
        supplier_code: "SUP-1",
        shipment_date: new Date("2026-06-10T00:00:00.000Z"),
        arrival_date: new Date("2026-06-11T00:00:00.000Z"),
        items: [buildItem()],
      });

      expect(insertStub.itemValues).toHaveBeenCalledWith([
        expect.objectContaining({ good_emergence: 0 }),
      ]);
    });

    it("writes an explicit null unchanged, never coalesced to 0", async () => {
      const insertStub = buildInsertStub();
      mockTransaction.mockImplementationOnce(async (callback) =>
        callback({ insert: insertStub.insert }),
      );

      await createShipment(77, {
        supplier_code: "SUP-1",
        shipment_date: new Date("2026-06-10T00:00:00.000Z"),
        arrival_date: new Date("2026-06-11T00:00:00.000Z"),
        items: [buildItem({ good_emergence: null })],
      });

      expect(insertStub.itemValues).toHaveBeenCalledWith([
        expect.objectContaining({ good_emergence: null }),
      ]);
    });

    it("writes an explicit numeric zero as a known zero, not defaulted", async () => {
      const insertStub = buildInsertStub();
      mockTransaction.mockImplementationOnce(async (callback) =>
        callback({ insert: insertStub.insert }),
      );

      await createShipment(77, {
        supplier_code: "SUP-1",
        shipment_date: new Date("2026-06-10T00:00:00.000Z"),
        arrival_date: new Date("2026-06-11T00:00:00.000Z"),
        items: [buildItem({ good_emergence: 0 })],
      });

      expect(insertStub.itemValues).toHaveBeenCalledWith([
        expect.objectContaining({ good_emergence: 0 }),
      ]);
    });

    it("writes a positive known value unchanged", async () => {
      const insertStub = buildInsertStub();
      mockTransaction.mockImplementationOnce(async (callback) =>
        callback({ insert: insertStub.insert }),
      );

      await createShipment(77, {
        supplier_code: "SUP-1",
        shipment_date: new Date("2026-06-10T00:00:00.000Z"),
        arrival_date: new Date("2026-06-11T00:00:00.000Z"),
        items: [buildItem({ good_emergence: 9 })],
      });

      expect(insertStub.itemValues).toHaveBeenCalledWith([
        expect.objectContaining({ good_emergence: 9 }),
      ]);
    });

    it("uses a supplied executor directly and does not open a nested transaction", async () => {
      const insertStub = buildInsertStub();

      const shipmentId = await createShipment(
        77,
        {
          supplier_code: "SUP-1",
          shipment_date: new Date("2026-06-10T00:00:00.000Z"),
          arrival_date: new Date("2026-06-11T00:00:00.000Z"),
          items: [buildItem({ good_emergence: null })],
        },
        { insert: insertStub.insert } as unknown as Parameters<typeof createShipment>[2],
      );

      expect(shipmentId).toBe(101);
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockEnsureSpeciesLinksForInstitution).toHaveBeenCalledWith(
        77,
        [4],
        expect.objectContaining({ insert: insertStub.insert }),
      );
      expect(insertStub.itemValues).toHaveBeenCalledWith([
        expect.objectContaining({ good_emergence: null }),
      ]);
    });

    it("still opens its own transaction when no executor is supplied", async () => {
      const insertStub = buildInsertStub();
      mockTransaction.mockImplementationOnce(async (callback) =>
        callback({ insert: insertStub.insert }),
      );

      await createShipment(77, {
        supplier_code: "SUP-1",
        shipment_date: new Date("2026-06-10T00:00:00.000Z"),
        arrival_date: new Date("2026-06-11T00:00:00.000Z"),
        items: [buildItem()],
      });

      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe("shipmentHeaderExists", () => {
    it("uses the plain db client by default", async () => {
      mockSelect.mockReturnValueOnce(createThenableQuery([{ id: 1 }]));

      const exists = await shipmentHeaderExists(
        77,
        "LPS",
        new Date("2026-06-10T00:00:00.000Z"),
        new Date("2026-06-11T00:00:00.000Z"),
      );

      expect(exists).toBe(true);
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("uses a supplied executor instead of the plain db client", async () => {
      const txSelect = jest.fn(() => createThenableQuery([]));

      const exists = await shipmentHeaderExists(
        77,
        "LPS",
        new Date("2026-06-10T00:00:00.000Z"),
        new Date("2026-06-11T00:00:00.000Z"),
        { select: txSelect } as unknown as Parameters<typeof shipmentHeaderExists>[4],
      );

      expect(exists).toBe(false);
      expect(txSelect).toHaveBeenCalledTimes(1);
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });

  it("does not delete anything when the shipment is not in the tenant", async () => {
    const deleteStub = createDeleteStub();
    const tx = {
      select: jest.fn().mockImplementationOnce(() => createThenableQuery([])),
      delete: deleteStub.deleteMock,
    };

    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(deleteShipment(77, 55)).resolves.toBe(false);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(deleteStub.deleteMock).not.toHaveBeenCalled();
  });

  it("deletes shipment-owned dependent rows before deleting the shipment", async () => {
    const deleteStub = createDeleteStub();
    const tx = {
      select: jest.fn(),
      delete: deleteStub.deleteMock,
    };

    tx.select
      .mockImplementationOnce(() => createThenableQuery([{ id: 55 }]))
      .mockImplementationOnce(() => createThenableQuery([{ id: 7 }, { id: 8 }]));

    mockTransaction.mockImplementationOnce(async (callback) => callback(tx));

    await expect(deleteShipment(77, 55)).resolves.toBe(true);

    expect(deleteStub.deleteOrder).toEqual([
      in_flight,
      release_event_losses,
      release_events,
      shipment_items,
      shipments,
    ]);
  });
});
