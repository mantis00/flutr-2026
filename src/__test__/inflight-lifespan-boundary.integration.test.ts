/**
 * Real PostgreSQL integration tests proving the current-in-flight lifespan window
 * (`currentInFlightBySpeciesSubquery` / `getCurrentInFlightSummary` in
 * `src/lib/queries/inflight.ts`) behaves correctly for a backdated release — the assumption
 * the retroactive-release-date feature (`sessions/2026-11-21/2026-11-21-retroactive-butterfly-releases-plan.md`,
 * Step 4) relies on instead of changing that query.
 *
 * The "alive" condition (`release_events.release_date + (lifespan_days * interval '1 day') >
 * now()`) is evaluated entirely in Postgres — `now()` and interval arithmetic can't be
 * exercised meaningfully against a mocked `db`, which is why the existing unit suite
 * (`src/__test__/inflight-queries.test.ts`) only proves the query's SQL shape, not its real
 * boundary arithmetic. This file proves the arithmetic itself, against a real connection.
 *
 * Safety gating (same two-tier pattern as `shipment-import-commit.integration.test.ts`):
 *   1. `RUN_INFLIGHT_INTEGRATION_TESTS=1` must be set explicitly, or this whole suite is skipped.
 *   2. Even then, `DATABASE_URL` must resolve to a database literally named `flutr_import_test`;
 *      any other target throws loudly in `beforeAll` instead of silently running.
 *
 * To run: `RUN_INFLIGHT_INTEGRATION_TESTS=1 pnpm exec jest inflight-lifespan-boundary.integration`
 *
 * Test data hygiene: every row is tagged with a fixed, greppable prefix
 * (`zzz-inflight-boundary-` for the institution slug, `Zzz Inflight Boundary` for species
 * scientific names, `ZZINFLB` for the supplier code) and removed in `afterAll`; `beforeAll` also
 * clears any leftovers from a previous killed run. Nothing here touches any pre-existing
 * institution, species, or supplier row.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  butterfly_species,
  in_flight,
  institutions,
  release_events,
  shipment_items,
  shipments,
  suppliers,
} from "@/lib/schema";
import {
  currentInFlightBySpeciesSubquery,
  getCurrentInFlightSummary,
} from "@/lib/queries/inflight";

jest.setTimeout(30000);

const RUN_INTEGRATION = process.env.RUN_INFLIGHT_INTEGRATION_TESTS === "1";

function resolveDatabaseName(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}

const DATABASE_NAME = resolveDatabaseName(process.env.DATABASE_URL);
const IS_IMPORT_TEST_DATABASE = DATABASE_NAME === "flutr_import_test";

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

const SUPPLIER_CODE = "ZZINFLB";
const INSTITUTION_SLUG = "zzz-inflight-boundary-test";
const SPECIES_PREFIX = "Zzz Inflight Boundary";
const LIFESPAN_DAYS = 14;

async function cleanupTestData() {
  await db.delete(institutions).where(eq(institutions.slug, INSTITUTION_SLUG));
  await db
    .delete(butterfly_species)
    .where(sql`${butterfly_species.scientific_name} LIKE ${SPECIES_PREFIX + "%"}`);
  await db.delete(suppliers).where(eq(suppliers.code, SUPPLIER_CODE));
}

describeIntegration("current in-flight lifespan window (real DB)", () => {
  let institutionId: number;
  let shipmentId: number;
  const speciesIdByScenario = new Map<string, number>();

  beforeAll(async () => {
    if (!IS_IMPORT_TEST_DATABASE) {
      throw new Error(
        `Refusing to run: RUN_INFLIGHT_INTEGRATION_TESTS=1 was set, but DATABASE_URL does not ` +
          `resolve to a database named "flutr_import_test" (resolved: "${DATABASE_NAME}"). This ` +
          `suite may only ever run against flutr_import_test.`,
      );
    }

    await cleanupTestData();

    await db.insert(suppliers).values({
      name: "Zzz Inflight Boundary Supplier",
      code: SUPPLIER_CODE,
      country: "USA",
    });

    const [institution] = await db
      .insert(institutions)
      .values({
        slug: INSTITUTION_SLUG,
        name: "Zzz Inflight Boundary Institution",
        street_address: "123 Test St",
        city: "Testville",
        state_province: "TS",
        postal_code: "00000",
        country: "USA",
      })
      .returning({ id: institutions.id });
    institutionId = institution.id;

    for (const scenario of ["within", "beyond", "just-inside", "just-outside"]) {
      const [species] = await db
        .insert(butterfly_species)
        .values({
          scientific_name: `${SPECIES_PREFIX} ${scenario}`,
          common_name: `${SPECIES_PREFIX} ${scenario}`,
          family: "Unknown",
          sub_family: "Unknown",
          lifespan_days: LIFESPAN_DAYS,
          range: ["Unknown"],
        })
        .returning({ id: butterfly_species.id });
      speciesIdByScenario.set(scenario, species.id);
    }

    const [shipment] = await db
      .insert(shipments)
      .values({
        institution_id: institutionId,
        supplier_code: SUPPLIER_CODE,
        shipment_date: new Date("2026-01-01T00:00:00.000Z"),
        arrival_date: new Date("2026-01-05T00:00:00.000Z"),
      })
      .returning({ id: shipments.id });
    shipmentId = shipment.id;
  });

  afterAll(async () => {
    await cleanupTestData();

    const rawClient = (
      db as unknown as {
        session: { client: { end: (opts?: { timeout?: number }) => Promise<void> } };
      }
    ).session.client;
    await rawClient.end({ timeout: 5 });
  });

  /**
   * Creates a shipment_item + release_event + in_flight row for one scenario, with
   * `release_date` offset from "now" so that `release_date + LIFESPAN_DAYS days` lands at
   * `now() + cutoffOffsetMs` — positive puts the cutoff in the future (still alive by the time
   * the query runs a moment later), negative puts it in the past (no longer alive).
   */
  async function seedScenario(scenario: string, cutoffOffsetMs: number, quantity: number) {
    const speciesId = speciesIdByScenario.get(scenario);
    if (!speciesId) throw new Error(`Unknown scenario: ${scenario}`);

    const [item] = await db
      .insert(shipment_items)
      .values({
        institution_id: institutionId,
        shipment_id: shipmentId,
        butterfly_species_id: speciesId,
        number_received: quantity,
        good_emergence: quantity,
      })
      .returning({ id: shipment_items.id });

    const releaseDate = new Date(Date.now() + cutoffOffsetMs - LIFESPAN_DAYS * 24 * 60 * 60 * 1000);

    const [event] = await db
      .insert(release_events)
      .values({
        institution_id: institutionId,
        shipment_id: shipmentId,
        release_date: releaseDate,
        released_by: "Integration Test",
      })
      .returning({ id: release_events.id });

    await db.insert(in_flight).values({
      institution_id: institutionId,
      release_event_id: event.id,
      shipment_item_id: item.id,
      quantity,
    });

    return speciesId;
  }

  async function currentQuantityForSpecies(speciesId: number): Promise<number | undefined> {
    const rows = await db.select().from(currentInFlightBySpeciesSubquery(institutionId));
    return rows.find((row) => row.butterfly_species_id === speciesId)?.quantity;
  }

  it("counts a release well within its species' lifespan window as currently alive", async () => {
    const speciesId = await seedScenario("within", 9 * 24 * 60 * 60 * 1000, 7);
    await expect(currentQuantityForSpecies(speciesId)).resolves.toBe(7);
  });

  it("does not count a release whose lifespan window has already closed", async () => {
    const speciesId = await seedScenario("beyond", -6 * 24 * 60 * 60 * 1000, 11);
    await expect(currentQuantityForSpecies(speciesId)).resolves.toBeUndefined();
  });

  it("counts a release landing a few seconds inside the lifespan cutoff as still alive", async () => {
    const speciesId = await seedScenario("just-inside", 5000, 3);
    await expect(currentQuantityForSpecies(speciesId)).resolves.toBe(3);
  });

  it("does not count a release landing exactly at (or just past) the lifespan cutoff, proving the strict > boundary", async () => {
    const speciesId = await seedScenario("just-outside", 0, 5);
    await expect(currentQuantityForSpecies(speciesId)).resolves.toBeUndefined();
  });

  it("sums only the alive scenarios into the institution-wide current in-flight total", async () => {
    const summary = await getCurrentInFlightSummary(institutionId);
    // within (7) + just-inside (3) = 10; beyond and just-outside contribute 0.
    expect(summary.totalButterflies).toBe(10);
    expect(summary.totalSpecies).toBe(2);
  });
});
