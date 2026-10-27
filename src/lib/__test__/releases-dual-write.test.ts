/**
 * Transaction-level dual-write tests for shipment_items.good_emergence.
 *
 * Uses the mockTx harness (createMockTx / createChainable) to stub the exact
 * sequence of tx.select/.insert/.update/.delete calls each function under
 * test is known to issue, matching this codebase's existing convention of
 * ordered canned responses rather than generic WHERE-clause evaluation.
 */

import {
  createChainable,
  createMockTx,
  type Chainable,
  type MockTx,
} from "@/__test__/api/_utils/mockTx";

jest.mock("@/lib/db", () => ({
  db: { transaction: jest.fn() },
}));

import { db } from "@/lib/db";
import { in_flight } from "@/lib/schema";
import {
  createInFlightForRelease,
  createReleaseFromShipment,
  deleteInFlightRow,
  deleteReleaseEvent,
  RELEASE_ERRORS,
  updateInFlightQuantity,
  updateReleaseEventItems,
} from "@/lib/queries/releases";

const mockTransaction = db.transaction as jest.Mock;

function setupTx(): MockTx {
  const tx = createMockTx();
  mockTransaction.mockImplementation((cb: (tx: MockTx) => unknown) => cb(tx));
  return tx;
}

/** Stubs `mockFn` to resolve each `results` entry in order; returns the chains for inspection. */
function mockSequence<T>(mockFn: jest.Mock, results: T[]): Chainable<T>[] {
  const chains = results.map((result) => createChainable(result));
  for (const chain of chains) {
    mockFn.mockReturnValueOnce(chain);
  }
  return chains;
}

const INSTITUTION_ID = 1;
const SHIPMENT_ID = 55;
const RELEASE_EVENT_ID = 500;

function baseShipmentItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    shipment_id: SHIPMENT_ID,
    number_received: 100,
    emerged_in_transit: 0,
    damaged_in_transit: 0,
    diseased_in_transit: 0,
    parasite: 0,
    non_emergence: 0,
    poor_emergence: 0,
    good_emergence: 20,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createReleaseFromShipment — good_emergence dual-write", () => {
  it("increments good_emergence by each item's release quantity (happy path, no loss_updates)", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: SHIPMENT_ID }], // shipment existence check
      [
        baseShipmentItemRow({ id: 101, good_emergence: 20 }),
        baseShipmentItemRow({ id: 102, good_emergence: 5 }),
      ], // lockedItems
    ]);
    mockSequence(tx.insert, [
      [
        {
          id: RELEASE_EVENT_ID,
          shipmentId: SHIPMENT_ID,
          releaseDate: new Date(),
          releasedBy: "Tester",
        },
      ], // release_events
      [
        { id: 1, releaseEventId: RELEASE_EVENT_ID, shipmentItemId: 101, quantity: 20 },
        { id: 2, releaseEventId: RELEASE_EVENT_ID, shipmentItemId: 102, quantity: 5 },
      ], // in_flight
    ]);
    const [updateItem101, updateItem102] = mockSequence(tx.update, [undefined, undefined]);

    await createReleaseFromShipment(INSTITUTION_ID, SHIPMENT_ID, "Tester", {
      items: [
        { shipment_item_id: 101, quantity: 20 },
        { shipment_item_id: 102, quantity: 5 },
      ],
      loss_updates: [],
    });

    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(updateItem101.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 40 }));
    expect(updateItem102.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 10 }));
  });

  it("rejects the entire create when any released item's good_emergence is NULL, before any write", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: SHIPMENT_ID }],
      [
        baseShipmentItemRow({ id: 101, good_emergence: null }),
        baseShipmentItemRow({ id: 102, good_emergence: 5 }),
      ],
    ]);

    await expect(
      createReleaseFromShipment(INSTITUTION_ID, SHIPMENT_ID, "Tester", {
        items: [
          { shipment_item_id: 101, quantity: 20 },
          { shipment_item_id: 102, quantity: 5 },
        ],
        loss_updates: [],
      }),
    ).rejects.toThrow(RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED);

    // Neither item was written — including item 102, which was otherwise valid.
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("never NULL-checks an item that only appears in loss_updates (no release quantity)", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: SHIPMENT_ID }],
      [baseShipmentItemRow({ id: 101, good_emergence: null, poor_emergence: 0 })], // untouched for good_emergence
    ]);
    const [lossPatchChain] = mockSequence(tx.update, [undefined]);
    mockSequence(tx.insert, [
      [
        {
          id: RELEASE_EVENT_ID,
          shipmentId: SHIPMENT_ID,
          releaseDate: new Date(),
          releasedBy: "Tester",
        },
      ],
      undefined, // release_event_losses insert (no .returning() used)
    ]);

    const result = await createReleaseFromShipment(INSTITUTION_ID, SHIPMENT_ID, "Tester", {
      items: [],
      loss_updates: [{ shipment_item_id: 101, poor_emergence: 2 }],
    });

    expect(result.event.id).toBe(RELEASE_EVENT_ID);
    // Only the loss patch was written; good_emergence was never touched.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(lossPatchChain.set).toHaveBeenCalledWith(expect.objectContaining({ poor_emergence: 2 }));
    expect(lossPatchChain.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ good_emergence: expect.anything() }),
    );
  });
});

describe("updateReleaseEventItems — good_emergence dual-write", () => {
  const releaseEventRow = { id: RELEASE_EVENT_ID, shipmentId: SHIPMENT_ID };

  it("edit increase: applies the same positive delta to good_emergence", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ id: 9, shipmentItemId: 101, quantity: 10 }], // existingInFlightRows
      [], // existingLossRows
      [baseShipmentItemRow({ id: 101, good_emergence: 20 })], // lockedItems
    ]);
    const [shipmentChain, inFlightChain] = mockSequence(tx.update, [undefined, undefined]);

    await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [{ shipment_item_id: 101, quantity: 15 }],
    });

    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 25 }));
    expect(inFlightChain.set).toHaveBeenCalledWith(expect.objectContaining({ quantity: 15 }));
  });

  it("preserves a zero baseline when aggregate Released initially equals the event quantity", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ id: 9, shipmentItemId: 101, quantity: 10 }],
      [],
      [baseShipmentItemRow({ id: 101, good_emergence: 10 })],
    ]);
    const [shipmentChain, inFlightChain] = mockSequence(tx.update, [undefined, undefined]);

    await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [{ shipment_item_id: 101, quantity: 15 }],
    });

    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 15 }));
    expect(inFlightChain.set).toHaveBeenCalledWith(expect.objectContaining({ quantity: 15 }));
  });

  it("preserves a negative baseline when the event exceeds aggregate Released", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ id: 9, shipmentItemId: 101, quantity: 10 }],
      [],
      [baseShipmentItemRow({ id: 101, good_emergence: 8 })],
    ]);
    const [shipmentChain, inFlightChain] = mockSequence(tx.update, [undefined, undefined]);

    await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [{ shipment_item_id: 101, quantity: 5 }],
    });

    // Baseline remains -2: 8 aggregate - 10 event before, 3 - 5 after.
    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 3 }));
    expect(inFlightChain.set).toHaveBeenCalledWith(expect.objectContaining({ quantity: 5 }));
  });

  it("edit decrease: applies the same negative delta to good_emergence", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ id: 9, shipmentItemId: 101, quantity: 15 }],
      [],
      [baseShipmentItemRow({ id: 101, good_emergence: 30 })],
    ]);
    const [shipmentChain, inFlightChain] = mockSequence(tx.update, [undefined, undefined]);

    await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [{ shipment_item_id: 101, quantity: 10 }],
    });

    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 25 }));
    expect(inFlightChain.set).toHaveBeenCalledWith(expect.objectContaining({ quantity: 10 }));
  });

  it("edit to zero/remove: good_emergence still decremented even though the in_flight row is deleted", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [
        { id: 9, shipmentItemId: 101, quantity: 10 },
        { id: 10, shipmentItemId: 102, quantity: 5 },
      ],
      [],
      [
        baseShipmentItemRow({ id: 101, good_emergence: 30, number_received: 50 }),
        baseShipmentItemRow({ id: 102, good_emergence: 8, number_received: 50 }),
      ],
    ]);
    const [shipmentChain] = mockSequence(tx.update, [undefined]);
    const [deleteChain] = mockSequence(tx.delete, [undefined]);

    await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [
        { shipment_item_id: 101, quantity: 0 },
        { shipment_item_id: 102, quantity: 5 },
      ],
    });

    // Only item 101 changed (removed): good_emergence -10, in_flight row deleted.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 20 }));
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(deleteChain.where).toHaveBeenCalled();
  });

  it("add new item during edit: good_emergence incremented for an item with no prior in_flight row", async () => {
    const tx = setupTx();

    const [releaseEventChain] = mockSequence(tx.select, [
      [releaseEventRow],
      [], // no existing in-flight rows at all
      [], // no existing loss rows
      [baseShipmentItemRow({ id: 103, good_emergence: 0 })],
    ]);
    const [shipmentChain] = mockSequence(tx.update, [undefined]);
    const [insertChain] = mockSequence(tx.insert, [undefined]);

    await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [{ shipment_item_id: 103, quantity: 7 }],
    });

    expect(releaseEventChain.for).toHaveBeenCalledWith("update");
    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 7 }));
    expect(insertChain.values).toHaveBeenCalledWith([
      expect.objectContaining({ shipment_item_id: 103, quantity: 7 }),
    ]);
  });

  it("an untouched NULL item (loss-only change on a different field) does not block the edit", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [], // no in-flight rows for item 101 at all — this call is for a loss-only correction
      [
        {
          id: 5,
          shipmentItemId: 101,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
      [baseShipmentItemRow({ id: 101, good_emergence: null, damaged_in_transit: 0 })], // NULL good_emergence, never touched
    ]);
    // Two updates: the shipment_items absolute-loss-total patch, and the
    // separate release_event_losses event-attribution row update.
    const [shipmentChain, eventLossChain] = mockSequence(tx.update, [undefined, undefined]);

    const result = await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [],
      losses: [
        {
          shipment_item_id: 101,
          damaged_in_transit: 2,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
    });

    expect(eventLossChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ damaged_in_transit: 2 }),
    );

    expect(result).toEqual({ updated: true });
    expect(shipmentChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ damaged_in_transit: 2 }),
    );
    expect(shipmentChain.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ good_emergence: expect.anything() }),
    );
  });

  it("rejects the entire edit when a touched item's good_emergence is NULL, even if another item in the same payload is valid", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [
        { id: 9, shipmentItemId: 101, quantity: 10 },
        { id: 10, shipmentItemId: 102, quantity: 5 },
      ],
      [],
      [
        baseShipmentItemRow({ id: 101, good_emergence: null }),
        baseShipmentItemRow({ id: 102, good_emergence: 20 }),
      ],
    ]);

    await expect(
      updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
        items: [
          { shipment_item_id: 101, quantity: 15 },
          { shipment_item_id: 102, quantity: 8 },
        ],
      }),
    ).rejects.toThrow(RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED);

    // The per-item loop throws before releasedTotalsRows is ever queried, and
    // before any write for either item.
    expect(tx.select).toHaveBeenCalledTimes(4);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("rejects the edit with GOOD_EMERGENCE_UNDERFLOW when the decrease would drive good_emergence below zero", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ id: 9, shipmentItemId: 101, quantity: 15 }],
      [],
      [baseShipmentItemRow({ id: 101, good_emergence: 3 })], // numeric, but less than the decrease
    ]);

    await expect(
      updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
        items: [{ shipment_item_id: 101, quantity: 5 }],
      }),
    ).rejects.toThrow(RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW);

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("combined increase + loss change on the same item: a single write carries both", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ id: 9, shipmentItemId: 101, quantity: 10 }],
      [
        {
          id: 5,
          shipmentItemId: 101,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
      [baseShipmentItemRow({ id: 101, good_emergence: 20, damaged_in_transit: 0 })],
    ]);
    // Three updates: shipment_items combined patch, in_flight quantity, and
    // the separate release_event_losses event-attribution row.
    const [shipmentChain, inFlightChain, eventLossChain] = mockSequence(tx.update, [
      undefined,
      undefined,
      undefined,
    ]);

    await updateReleaseEventItems(INSTITUTION_ID, RELEASE_EVENT_ID, {
      items: [{ shipment_item_id: 101, quantity: 15 }],
      losses: [
        {
          shipment_item_id: 101,
          damaged_in_transit: 2,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
    });

    expect(tx.update).toHaveBeenCalledTimes(3);
    expect(shipmentChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ damaged_in_transit: 2, good_emergence: 25 }),
    );
    expect(inFlightChain.set).toHaveBeenCalledWith(expect.objectContaining({ quantity: 15 }));
    expect(eventLossChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ damaged_in_transit: 2 }),
    );
  });
});

describe("deleteReleaseEvent — good_emergence dual-write", () => {
  const releaseEventRow = { id: RELEASE_EVENT_ID };

  it("locks the related in_flight rows with FOR UPDATE before computing rollback deltas (concurrency regression guard)", async () => {
    const tx = setupTx();

    const [releaseEventChain, relatedInFlightChain] = mockSequence(tx.select, [
      [releaseEventRow],
      [{ shipmentItemId: 101, quantity: 10 }],
      [], // no loss rows
      [
        {
          id: 101,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 30,
        },
      ],
    ]);
    mockSequence(tx.update, [undefined]);
    mockSequence(tx.delete, [[{ id: RELEASE_EVENT_ID }]]);

    await deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID);

    // Serializes deletion with any request that can add a new child row to
    // this event, so the rollback scan cannot miss a concurrent insert.
    expect(releaseEventChain.for).toHaveBeenCalledWith("update");

    // This select reads the quantities of every in_flight row this event's
    // cascade-delete is about to remove, which the good_emergence rollback
    // is computed from — must be locked. See
    // sessions/2026-10-01/2026-10-01-good-emergence-dual-write-concurrency-review.md.
    expect(relatedInFlightChain.for).toHaveBeenCalledWith("update");
  });

  it("decrements good_emergence for release-quantity-only items (no losses at all)", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [
        { shipmentItemId: 101, quantity: 10 },
        { shipmentItemId: 102, quantity: 5 },
      ],
      [], // no loss rows
      [
        {
          id: 101,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 30,
        },
        {
          id: 102,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 12,
        },
      ],
    ]);
    const [chain101, chain102] = mockSequence(tx.update, [undefined, undefined]);
    mockSequence(tx.delete, [[{ id: RELEASE_EVENT_ID }]]);

    await deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID);

    expect(chain101.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 20 }));
    expect(chain101.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ damaged_in_transit: expect.anything() }),
    );
    expect(chain102.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 7 }));
  });

  it("combines loss rollback and good_emergence rollback into a single write for the same item", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ shipmentItemId: 101, quantity: 10 }],
      [
        {
          shipmentItemId: 101,
          damaged_in_transit: 2,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
      [
        {
          id: 101,
          damaged_in_transit: 2,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 30,
        },
      ],
    ]);
    const [chain101] = mockSequence(tx.update, [undefined]);
    mockSequence(tx.delete, [[{ id: RELEASE_EVENT_ID }]]);

    await deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID);

    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(chain101.set).toHaveBeenCalledWith(
      expect.objectContaining({ damaged_in_transit: 0, good_emergence: 20 }),
    );
  });

  it("writes two separate single-purpose patches when losses and release quantity are on different items", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ shipmentItemId: 202, quantity: 4 }],
      [
        {
          shipmentItemId: 201,
          damaged_in_transit: 1,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
      [
        {
          id: 201,
          damaged_in_transit: 1,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 50,
        },
        {
          id: 202,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 9,
        },
      ],
    ]);
    const [chain201, chain202] = mockSequence(tx.update, [undefined, undefined]);
    mockSequence(tx.delete, [[{ id: RELEASE_EVENT_ID }]]);

    await deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID);

    expect(chain201.set).toHaveBeenCalledWith(expect.objectContaining({ damaged_in_transit: 0 }));
    expect(chain201.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ good_emergence: expect.anything() }),
    );
    expect(chain202.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 5 }));
    expect(chain202.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ damaged_in_transit: expect.anything() }),
    );
  });

  it("rejects the entire delete when an in-flight-bearing item's good_emergence is NULL, blocking an otherwise-valid loss rollback on a different item", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ shipmentItemId: 101, quantity: 10 }],
      [
        {
          shipmentItemId: 201,
          damaged_in_transit: 1,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
      [
        {
          id: 101,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: null,
        },
        {
          id: 201,
          damaged_in_transit: 1,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 5,
        },
      ],
    ]);

    await expect(deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID)).rejects.toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED,
    );

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("succeeds for a loss-only item with NULL good_emergence when it has no in-flight contribution in this event", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [], // no in-flight rows in this event at all — pure loss correction
      [
        {
          shipmentItemId: 301,
          damaged_in_transit: 1,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
      [
        {
          id: 301,
          damaged_in_transit: 1,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: null,
        },
      ],
    ]);
    const [chain301] = mockSequence(tx.update, [undefined]);
    mockSequence(tx.delete, [[{ id: RELEASE_EVENT_ID }]]);

    const result = await deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID);

    expect(result).toEqual({ deleted: true });
    expect(chain301.set).toHaveBeenCalledWith(expect.objectContaining({ damaged_in_transit: 0 }));
    expect(chain301.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ good_emergence: expect.anything() }),
    );
  });

  it("deletes a fully backfilled release and rolls good_emergence exactly to zero", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ shipmentItemId: 101, quantity: 10 }],
      [], // no loss rows
      [baseShipmentItemRow({ id: 101, good_emergence: 10 })],
    ]);
    const [shipmentChain] = mockSequence(tx.update, [undefined]);
    const [deleteChain] = mockSequence(tx.delete, [[{ id: RELEASE_EVENT_ID }]]);

    const result = await deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID);

    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 0 }));
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(deleteChain.where).toHaveBeenCalled();
    expect(result).toEqual({ deleted: true });
  });

  it("rejects with GOOD_EMERGENCE_UNDERFLOW when the rollback would drive good_emergence below zero", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [{ shipmentItemId: 101, quantity: 10 }],
      [],
      [
        {
          id: 101,
          damaged_in_transit: 0,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 3,
        },
      ],
    ]);

    await expect(deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID)).rejects.toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW,
    );

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("still enforces LOSS_TOTAL_UNDERFLOW independently of the good_emergence guard", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [releaseEventRow],
      [], // no in-flight rows
      [
        {
          shipmentItemId: 201,
          damaged_in_transit: 10,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
        },
      ],
      [
        {
          id: 201,
          damaged_in_transit: 5,
          diseased_in_transit: 0,
          parasite: 0,
          non_emergence: 0,
          poor_emergence: 0,
          good_emergence: 0,
        },
      ],
    ]);

    await expect(deleteReleaseEvent(INSTITUTION_ID, RELEASE_EVENT_ID)).rejects.toThrow(
      RELEASE_ERRORS.LOSS_TOTAL_UNDERFLOW,
    );

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });
});

describe("createInFlightForRelease — good_emergence dual-write", () => {
  it("increments good_emergence by the new row's quantity", async () => {
    const tx = setupTx();

    const [releaseEventChain] = mockSequence(tx.select, [
      [{ id: RELEASE_EVENT_ID, shipmentId: SHIPMENT_ID }],
      [baseShipmentItemRow({ id: 101, shipment_id: SHIPMENT_ID, good_emergence: 10 })],
      [], // no existing in_flight row for this release/item
    ]);
    const [inFlightChain] = mockSequence(tx.insert, [
      [{ id: 1, releaseEventId: RELEASE_EVENT_ID, shipmentItemId: 101, quantity: 5 }],
    ]);
    const [shipmentChain] = mockSequence(tx.update, [undefined]);

    const result = await createInFlightForRelease(INSTITUTION_ID, RELEASE_EVENT_ID, {
      shipment_item_id: 101,
      quantity: 5,
    });

    expect(releaseEventChain.for).toHaveBeenCalledWith("update");
    expect(inFlightChain.values).toHaveBeenCalledWith({
      institution_id: INSTITUTION_ID,
      release_event_id: RELEASE_EVENT_ID,
      shipment_item_id: 101,
      quantity: 5,
    });
    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 15 }));
    expect(result).toEqual(
      expect.objectContaining({
        releaseEventId: RELEASE_EVENT_ID,
        shipmentItemId: 101,
        quantity: 5,
      }),
    );
  });

  it("rejects with GOOD_EMERGENCE_UNTRACKED before inserting, when good_emergence is NULL", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: RELEASE_EVENT_ID, shipmentId: SHIPMENT_ID }],
      [baseShipmentItemRow({ id: 101, shipment_id: SHIPMENT_ID, good_emergence: null })],
      [],
    ]);

    await expect(
      createInFlightForRelease(INSTITUTION_ID, RELEASE_EVENT_ID, {
        shipment_item_id: 101,
        quantity: 5,
      }),
    ).rejects.toThrow(RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED);

    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe("updateInFlightQuantity — good_emergence dual-write", () => {
  it("locks the in_flight row with FOR UPDATE before computing the delta (concurrency regression guard)", async () => {
    const tx = setupTx();

    const [targetChain] = mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 5 }],
      [baseShipmentItemRow({ id: 101, good_emergence: 20 })],
    ]);
    const inFlightChain = createChainable([
      { id: 9, releaseEventId: RELEASE_EVENT_ID, shipmentItemId: 101, quantity: 9 },
    ]);
    const shipmentChain = createChainable(undefined);
    tx.update.mockReturnValueOnce(inFlightChain).mockReturnValueOnce(shipmentChain);

    await updateInFlightQuantity(INSTITUTION_ID, 9, { quantity: 9 });

    // This select reads the in_flight row's *current* quantity, which the
    // good_emergence delta is computed from — it must be locked so a
    // concurrent mutation of the same row can't be read stale. See
    // sessions/2026-10-01/2026-10-01-good-emergence-dual-write-concurrency-review.md.
    expect(targetChain.for).toHaveBeenCalledWith("update");
  });

  it("increase: applies the same positive delta to good_emergence", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 5 }],
      [baseShipmentItemRow({ id: 101, good_emergence: 20 })],
    ]);
    const inFlightChain = createChainable([
      { id: 9, releaseEventId: RELEASE_EVENT_ID, shipmentItemId: 101, quantity: 9 },
    ]);
    const shipmentChain = createChainable(undefined);
    tx.update.mockReturnValueOnce(inFlightChain).mockReturnValueOnce(shipmentChain);

    await updateInFlightQuantity(INSTITUTION_ID, 9, { quantity: 9 });

    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 24 }));
  });

  it("decrease: applies the same negative delta to good_emergence", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 9 }],
      [baseShipmentItemRow({ id: 101, good_emergence: 24 })],
    ]);
    const inFlightChain = createChainable([
      { id: 9, releaseEventId: RELEASE_EVENT_ID, shipmentItemId: 101, quantity: 5 },
    ]);
    const shipmentChain = createChainable(undefined);
    tx.update.mockReturnValueOnce(inFlightChain).mockReturnValueOnce(shipmentChain);

    await updateInFlightQuantity(INSTITUTION_ID, 9, { quantity: 5 });

    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 20 }));
  });

  it("rejects with GOOD_EMERGENCE_UNDERFLOW before updating in_flight", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 9 }],
      [baseShipmentItemRow({ id: 101, good_emergence: 2 })], // numeric, but too low for a -4 delta
    ]);

    await expect(updateInFlightQuantity(INSTITUTION_ID, 9, { quantity: 5 })).rejects.toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW,
    );

    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects with GOOD_EMERGENCE_UNTRACKED before updating in_flight, when good_emergence is NULL", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 9 }],
      [baseShipmentItemRow({ id: 101, good_emergence: null })],
    ]);

    await expect(updateInFlightQuantity(INSTITUTION_ID, 9, { quantity: 5 })).rejects.toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED,
    );

    expect(tx.update).not.toHaveBeenCalled();
  });

  it("no-op quantity (requested === existing): does not touch good_emergence even when it is NULL", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 10 }],
      [baseShipmentItemRow({ id: 101, good_emergence: null })],
    ]);
    const inFlightChain = createChainable([
      { id: 9, releaseEventId: RELEASE_EVENT_ID, shipmentItemId: 101, quantity: 10 },
    ]);
    tx.update.mockReturnValueOnce(inFlightChain);

    await expect(updateInFlightQuantity(INSTITUTION_ID, 9, { quantity: 10 })).resolves.toEqual(
      expect.objectContaining({ quantity: 10 }),
    );

    // The in_flight update still runs (existing behavior, unconditional),
    // but good_emergence is never inspected or written since delta === 0.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(in_flight);
  });
});

describe("deleteInFlightRow — good_emergence dual-write", () => {
  it("locks the in_flight row with FOR UPDATE before computing the delta (concurrency regression guard)", async () => {
    const tx = setupTx();

    const [existingChain] = mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 6 }],
      [{ id: 101, good_emergence: 10 }],
    ]);
    mockSequence(tx.delete, [[{ id: 9 }]]);
    mockSequence(tx.update, [undefined]);

    await deleteInFlightRow(INSTITUTION_ID, 9);

    // This select reads the quantity of the row about to be deleted, which
    // the good_emergence rollback is computed from — must be locked. See
    // sessions/2026-10-01/2026-10-01-good-emergence-dual-write-concurrency-review.md.
    expect(existingChain.for).toHaveBeenCalledWith("update");
  });

  it("decrements good_emergence by the deleted row's quantity", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 6 }],
      [{ id: 101, good_emergence: 10 }],
    ]);
    const [deleteChain] = mockSequence(tx.delete, [[{ id: 9 }]]);
    const [shipmentChain] = mockSequence(tx.update, [undefined]);

    await deleteInFlightRow(INSTITUTION_ID, 9);

    expect(deleteChain.where).toHaveBeenCalled();
    expect(shipmentChain.set).toHaveBeenCalledWith(expect.objectContaining({ good_emergence: 4 }));
  });

  it("rejects with GOOD_EMERGENCE_UNDERFLOW before deleting the in_flight row", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 6 }],
      [{ id: 101, good_emergence: 2 }], // numeric, but too low for a -6 delta
    ]);

    await expect(deleteInFlightRow(INSTITUTION_ID, 9)).rejects.toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNDERFLOW,
    );

    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects with GOOD_EMERGENCE_UNTRACKED before deleting the in_flight row, when good_emergence is NULL", async () => {
    const tx = setupTx();

    mockSequence(tx.select, [
      [{ id: 9, shipmentItemId: 101, quantity: 6 }],
      [{ id: 101, good_emergence: null }],
    ]);

    await expect(deleteInFlightRow(INSTITUTION_ID, 9)).rejects.toThrow(
      RELEASE_ERRORS.GOOD_EMERGENCE_UNTRACKED,
    );

    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
