/**
 * Phase 3D — real PostgreSQL integration tests for the strict historical shipment importer's
 * year-scoped atomic commit (`commitShipmentImportForInstitution`) and its per-institution
 * advisory-lock concurrency guard.
 *
 * Deliberately NOT mocked: every assertion here queries actual rows written (or confirms rows are
 * absent) through a real `flutr_import_test` connection. Phase 3C's existing unit tests
 * (`shipment-import-service.test.ts`) already prove this same logic against a mocked `db`/`tx` —
 * this file exists specifically because a mocked transaction cannot prove real commit, rollback,
 * or advisory-lock behavior, per this phase's explicit authorization.
 *
 * Safety gating (two independent checks, so a routine `pnpm test` run never touches any
 * database):
 *   1. `RUN_SHIPMENT_IMPORT_INTEGRATION_TESTS=1` must be set explicitly — without it, this whole
 *      suite is skipped (not run, not failed), which is the default/safe behavior.
 *   2. Even then, the active `DATABASE_URL` must resolve to a database literally named
 *      `flutr_import_test`. Any other target (including an unset/misconfigured URL) throws loudly
 *      in `beforeAll` rather than silently skipping or silently running — per this workstream's
 *      standing rule that `flutr_import_test` is the only database this work may ever write to.
 *
 * To run: `RUN_SHIPMENT_IMPORT_INTEGRATION_TESTS=1 pnpm exec jest shipment-import-commit.integration`
 *
 * `afterAll` below closes the real `postgres()` connection pool opened by `@/lib/db` so Jest exits
 * on its own — no `--forceExit` needed. `src/lib/db.ts` doesn't export the raw client (and this
 * file intentionally doesn't add one — that would be a production-file change requiring separate
 * approval), so teardown reaches it through drizzle's own internal `db.session.client` reference
 * instead (confirmed directly against this project's installed drizzle-orm: `PgDatabase` stores
 * its session as `this.session`, and `PostgresJsSession` stores the raw client as `this.client`).
 * This is reading an undocumented internal, not a public API, but it's confined entirely to this
 * test file's teardown and touches no production code.
 *
 * Test data hygiene: every row this file creates is tagged with a fixed, greppable prefix
 * (`phase3d-integration-` for institution slugs, `zzz phase3d` for species scientific names,
 * `ZZPH3D` for supplier codes) and removed in `afterAll`. `beforeAll` also clears any leftovers
 * from a previous run that didn't reach its own cleanup (e.g. a killed process), so this suite is
 * safe to re-run without manual database intervention. Nothing here ever touches Reiman Gardens'
 * own rows or any other pre-existing institution/species/supplier.
 *
 * Hardening checkpoint update (review section 15.3): the rollback scenario's deterministic
 * failure mechanism was replaced after the strict parser gained a real upper-bound validation
 * check (its original mechanism — an oversized `No. rec` — is now rejected during validation
 * itself, which does not prove real rollback). It now uses a narrowly-scoped, test-only Postgres
 * trigger/function/guard table (`phase3d_test_*`), installed in `beforeAll` and torn down in
 * `afterAll`, confined entirely to this file and to `flutr_import_test` — see the
 * `installPhase3dTestFailureTrigger`/`setPhase3dTestGuard` helpers below for the full design.
 */

import { and, eq, sql } from "drizzle-orm";

// This file calls the service's institution-agnostic core functions directly
// (`commitShipmentImportForInstitution`/`buildShipmentImportPreviewForInstitution`), never the
// `auth()`-gated platform/tenant wrappers — so `auth()` itself is never invoked at runtime. It
// still must be mocked here, purely so Jest/ts-jest never has to load (and fail to parse) the
// real `next-auth` package that `@/auth` pulls in transitively — the same, pre-existing ESM
// parsing limitation documented in `shipment-import-service.test.ts`. The real `db`, real
// queries, and real schema below are intentionally NOT mocked — this file exists specifically to
// exercise them for real.
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { db } from "@/lib/db";
import {
  institutions,
  butterfly_species,
  suppliers,
  shipments,
  shipment_items,
} from "@/lib/schema";
import {
  buildShipmentImportPreviewForInstitution,
  commitShipmentImportForInstitution,
} from "@/lib/services/shipment-import";
import { CANONICAL_SHIPMENT_IMPORT_HEADERS } from "@/lib/shipment-import-utils";

jest.setTimeout(30000);

const RUN_INTEGRATION = process.env.RUN_SHIPMENT_IMPORT_INTEGRATION_TESTS === "1";

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

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const HEADER_ROW = CANONICAL_SHIPMENT_IMPORT_HEADERS.join("\t");

type RowInput = {
  species: string;
  numberReceived: number | string;
  supplier: string;
  shipDate: string;
  arrivalDate: string;
  released?: number | "";
};

function buildRow({
  species,
  numberReceived,
  supplier,
  shipDate,
  arrivalDate,
  released = "",
}: RowInput): string {
  return [
    species,
    "", // Common name — header required, cell content never validated
    String(numberReceived),
    supplier,
    shipDate,
    arrivalDate,
    "0", // Emerg. in transit
    "0", // Damag in transit
    "0", // No. disea
    "0", // No. parasit
    "0", // No emerg
    "0", // Poor emerg
    released === "" ? "" : String(released),
  ].join("\t");
}

function buildRawText(rows: string[]): string {
  return [HEADER_ROW, ...rows].join("\n");
}

async function cleanupTestData() {
  await db.delete(institutions).where(sql`${institutions.slug} LIKE 'phase3d-integration-%'`);
  await db
    .delete(butterfly_species)
    .where(sql`lower(${butterfly_species.scientific_name}) LIKE 'zzz phase3d%'`);
  await db.delete(suppliers).where(sql`${suppliers.code} LIKE 'ZZPH3D%'`);
}

async function createTestInstitution(slugSuffix: string): Promise<number> {
  const [row] = await db
    .insert(institutions)
    .values({
      slug: `phase3d-integration-${slugSuffix}`,
      name: `Phase 3D Integration Test (${slugSuffix})`,
      street_address: "123 Test St",
      city: "Testville",
      state_province: "TS",
      postal_code: "00000",
      country: "USA",
    })
    .returning({ id: institutions.id });
  return row.id;
}

async function shipmentsForYear(institutionId: number, year: number) {
  return db
    .select({ id: shipments.id, supplierCode: shipments.supplier_code })
    .from(shipments)
    .where(
      and(
        eq(shipments.institution_id, institutionId),
        sql`extract(year from ${shipments.arrival_date})::int = ${year}`,
      ),
    );
}

async function itemsForShipment(shipmentId: number) {
  return db
    .select({
      id: shipment_items.id,
      speciesId: shipment_items.butterfly_species_id,
      numberReceived: shipment_items.number_received,
      goodEmergence: shipment_items.good_emergence,
    })
    .from(shipment_items)
    .where(eq(shipment_items.shipment_id, shipmentId));
}

async function findSpeciesId(scientificName: string): Promise<number | null> {
  const [row] = await db
    .select({ id: butterfly_species.id })
    .from(butterfly_species)
    .where(eq(butterfly_species.scientific_name, scientificName));
  return row?.id ?? null;
}

async function speciesLinkExists(institutionId: number, speciesId: number): Promise<boolean> {
  const [row] = await db.execute(
    sql`SELECT 1 FROM butterfly_species_institution WHERE institution_id = ${institutionId} AND butterfly_species_id = ${speciesId} LIMIT 1`,
  );
  return !!row;
}

async function supplierExists(code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.code, code));
  return !!row;
}

// ---------------------------------------------------------------------------
// Deterministic rollback-failure mechanism (hardening checkpoint, review section 15.3)
//
// Replaces the original Phase 3D mechanism (an oversized `No. rec` that overflowed PostgreSQL's
// `integer` column) — that stopped working once the hardening checkpoint added a real upper-bound
// *validation* check to the parser: an oversized value is now caught during full-workbook
// validation (a blocking `issue`, before any transaction opens), which this workstream's own
// standing rule says is NOT sufficient to prove real rollback.
//
// Replacement: a narrowly-scoped, test-only PostgreSQL trigger + function + single-row guard
// table, installed and torn down entirely within this file, against `flutr_import_test` only.
// Firing requires BOTH:
//   1. the sentinel value (`PHASE3D_TEST_SENTINEL_NUMBER_RECEIVED`, an ordinary, bounds-compliant
//      number that passes every application validation rule, confirmed below by asserting the
//      full-workbook preview reports zero issues before committing it), AND
//   2. the guard row (`phase3d_test_guard`) being explicitly enabled — set `true` immediately
//      before, and reset to `false` immediately after (in a `finally`, so a test failure can't
//      leave it on), the one call meant to trigger it.
// A guard TABLE (not a session-local Postgres GUC) is used deliberately: the production commit's
// own `db.transaction(...)` runs on whichever connection postgres.js's pool happens to hand it,
// not one this test file controls — a session-scoped `SET`/`SET LOCAL` on a side connection would
// not reliably be visible to that pooled connection, while a real table row, once committed, is
// visible to every connection under READ COMMITTED (Postgres's default), regardless of which one
// the pool selects. This also means the mechanism needs no concurrency/timing coordination at all.
// ---------------------------------------------------------------------------

const PHASE3D_TEST_SENTINEL_NUMBER_RECEIVED = 123456789;

async function installPhase3dTestFailureTrigger() {
  // Defensive DROP-IF-EXISTS first (same pattern as the row-cleanup above) so a previous run that
  // was interrupted before its own teardown ran never leaves a stale trigger/function/table behind.
  await teardownPhase3dTestFailureTrigger();

  await db.execute(sql`
    CREATE TABLE phase3d_test_guard (id int PRIMARY KEY, enabled boolean NOT NULL DEFAULT false)
  `);
  await db.execute(sql`INSERT INTO phase3d_test_guard (id, enabled) VALUES (1, false)`);
  // The sentinel is inlined as a raw literal (via `sql.raw`), not a bound `$1` parameter —
  // postgres.js cannot infer a parameter's type inside a dollar-quoted PL/pgSQL function body
  // (confirmed: binding it as a normal `sql` template parameter here fails with "could not
  // determine data type of parameter $1"). Safe here because the value is this file's own fixed,
  // internal constant, never user input.
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION phase3d_test_fail_on_sentinel() RETURNS trigger AS $$
    BEGIN
      IF NEW.number_received = ${sql.raw(String(PHASE3D_TEST_SENTINEL_NUMBER_RECEIVED))}
         AND (SELECT enabled FROM phase3d_test_guard WHERE id = 1) THEN
        RAISE EXCEPTION 'phase3d_test: deterministic injected failure (sentinel number_received + guard enabled)';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await db.execute(sql`
    CREATE TRIGGER phase3d_test_trigger
      BEFORE INSERT ON shipment_items
      FOR EACH ROW EXECUTE FUNCTION phase3d_test_fail_on_sentinel()
  `);
}

async function teardownPhase3dTestFailureTrigger() {
  await db.execute(sql`DROP TRIGGER IF EXISTS phase3d_test_trigger ON shipment_items`);
  await db.execute(sql`DROP FUNCTION IF EXISTS phase3d_test_fail_on_sentinel()`);
  await db.execute(sql`DROP TABLE IF EXISTS phase3d_test_guard`);
}

async function setPhase3dTestGuard(enabled: boolean) {
  await db.execute(sql`UPDATE phase3d_test_guard SET enabled = ${enabled} WHERE id = 1`);
}

/** Non-blocking: holds a real transaction-scoped advisory lock for `institutionId` until
 * `release()` is called, using the exact lock namespace the production code uses. Lets tests
 * deterministically simulate "an import is already running for this institution" without racing
 * real concurrent requests. */
function holdAdvisoryLock(institutionId: number) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('shipment_import'), ${institutionId})`,
    );
    await gate;
  });
  return { release, held };
}

/** Confirms the advisory lock for `institutionId` is NOT held (i.e. was released by an earlier
 * transaction's commit or rollback) by acquiring and immediately releasing it via the non-blocking
 * `try` variant, exactly as the production code does. */
async function expectLockIsReleased(institutionId: number) {
  const acquired = await db.transaction(async (tx) => {
    const [result] = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(hashtext('shipment_import'), ${institutionId}) AS acquired`,
    );
    return (result as unknown as { acquired: boolean }).acquired;
  });
  expect(acquired).toBe(true);
}

describeIntegration("shipment import commit — real PostgreSQL integration (Phase 3D)", () => {
  let institutionA: number;
  let institutionB: number;
  let institutionC: number;

  beforeAll(async () => {
    if (!IS_IMPORT_TEST_DATABASE) {
      throw new Error(
        `Refusing to run: RUN_SHIPMENT_IMPORT_INTEGRATION_TESTS=1 was set, but DATABASE_URL does ` +
          `not resolve to a database named "flutr_import_test" (resolved: "${DATABASE_NAME}"). ` +
          `This suite may only ever run against flutr_import_test.`,
      );
    }

    await cleanupTestData();
    await installPhase3dTestFailureTrigger();

    institutionA = await createTestInstitution("a-success-skip-retry");
    institutionB = await createTestInstitution("b-rollback-preservation-lock");
    institutionC = await createTestInstitution("c-concurrency-independent");

    // Pre-existing species for scenario A, confirming the importer correctly resolves an
    // ALREADY-catalogued species (not every species in this suite needs auto-create).
    await db.insert(butterfly_species).values({
      scientific_name: "Zzz Phase3d Species Alpha",
      common_name: "Zzz Phase3d Species Alpha",
      family: "Unknown",
      sub_family: "Unknown",
      lifespan_days: 1,
      range: ["Unknown"],
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await teardownPhase3dTestFailureTrigger();

    // Close the real connection pool so Jest can exit on its own (see the file-header comment).
    const rawClient = (
      db as unknown as {
        session: { client: { end: (opts?: { timeout?: number }) => Promise<void> } };
      }
    ).session.client;
    await rawClient.end({ timeout: 5 });
  });

  // -------------------------------------------------------------------------
  // Scenario A — successful year import
  // -------------------------------------------------------------------------

  describe("Scenario A: successful year import", () => {
    const rawText = buildRawText([
      // Shipment 1, arrival year 2030 — three items exercising all three good_emergence states.
      buildRow({
        species: "Zzz Phase3d Species Alpha", // pre-existing species
        numberReceived: 10,
        supplier: "ZZPH3DA",
        shipDate: "2030-06-01",
        arrivalDate: "2030-06-10",
        released: 4, // known, non-zero
      }),
      buildRow({
        species: "Zzz Phase3d Species Beta", // auto-create
        numberReceived: 8,
        supplier: "ZZPH3DA",
        shipDate: "2030-06-01",
        arrivalDate: "2030-06-10",
        released: "", // blank -> NULL (historically unknown)
      }),
      buildRow({
        species: "Zzz Phase3d Species Gamma", // auto-create
        numberReceived: 6,
        supplier: "ZZPH3DA",
        shipDate: "2030-06-01",
        arrivalDate: "2030-06-10",
        released: 0, // explicit, known zero — must NOT be stored as NULL
      }),
      // Shipment 2, a DIFFERENT arrival year (2031) — must remain untouched by a year:2030 commit.
      buildRow({
        species: "Zzz Phase3d Species Alpha",
        numberReceived: 3,
        supplier: "ZZPH3DA",
        shipDate: "2031-01-01",
        arrivalDate: "2031-01-05",
        released: "",
      }),
    ]);

    it("validates clean and reports both years", async () => {
      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionA,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      expect(preview.issues).toEqual([]);
      expect(preview.years).toEqual([2030, 2031]);
    });

    it("commits only the requested year, with correct counts and good_emergence values", async () => {
      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionA,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      const result = await commitShipmentImportForInstitution({
        institutionId: institutionA,
        raw_text: rawText,
        preview_hash: preview.preview_hash,
        year: 2030,
        options: { allow_species_autocreate: true },
      });

      expect(result).toEqual({ year: 2030, created: 1, skipped: 0, warnings: expect.any(Array) });

      // Only the requested year was imported.
      const year2030 = await shipmentsForYear(institutionA, 2030);
      const year2031 = await shipmentsForYear(institutionA, 2031);
      expect(year2030).toHaveLength(1);
      expect(year2031).toHaveLength(0);

      // Item counts and exact good_emergence values (the NULL-vs-zero hazard, confirmed for real).
      const items = await itemsForShipment(year2030[0].id);
      expect(items).toHaveLength(3);

      const alphaId = await findSpeciesId("Zzz Phase3d Species Alpha");
      const betaId = await findSpeciesId("zzz phase3d species beta"); // auto-created, stored lowercase
      const gammaId = await findSpeciesId("zzz phase3d species gamma");
      expect(alphaId).not.toBeNull();
      expect(betaId).not.toBeNull();
      expect(gammaId).not.toBeNull();

      const byId = new Map(items.map((item) => [item.speciesId, item]));
      expect(byId.get(alphaId!)?.goodEmergence).toBe(4);
      expect(byId.get(betaId!)?.goodEmergence).toBeNull();
      expect(byId.get(gammaId!)?.goodEmergence).toBe(0);

      // Supplier auto-created, inactive.
      const [supplierRow] = await db
        .select({ isActive: suppliers.is_active })
        .from(suppliers)
        .where(eq(suppliers.code, "ZZPH3DA"));
      expect(supplierRow?.isActive).toBe(false);

      // Species links created for the institution (every species used).
      await expect(speciesLinkExists(institutionA, alphaId!)).resolves.toBe(true);
      await expect(speciesLinkExists(institutionA, betaId!)).resolves.toBe(true);
      await expect(speciesLinkExists(institutionA, gammaId!)).resolves.toBe(true);

      // No synthetic release events or in_flight rows.
      const [releaseCount] = await db.execute(
        sql`SELECT count(*)::int AS count FROM release_events WHERE institution_id = ${institutionA}`,
      );
      const [inFlightCount] = await db.execute(
        sql`SELECT count(*)::int AS count FROM in_flight WHERE institution_id = ${institutionA}`,
      );
      expect((releaseCount as unknown as { count: number }).count).toBe(0);
      expect((inFlightCount as unknown as { count: number }).count).toBe(0);
    });

    it("releases the advisory lock after a successful commit", async () => {
      await expectLockIsReleased(institutionA);
    });

    // -----------------------------------------------------------------------
    // Scenario D — existing shipment skip and retry (reuses institutionA's committed state)
    // -----------------------------------------------------------------------

    it("skips an already-existing shipment by default, with no duplicate and created: 0", async () => {
      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionA,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      const result = await commitShipmentImportForInstitution({
        institutionId: institutionA,
        raw_text: rawText,
        preview_hash: preview.preview_hash,
        year: 2030,
        options: { allow_species_autocreate: true },
      });

      expect(result).toEqual({ year: 2030, created: 0, skipped: 1, warnings: [] });

      const year2030 = await shipmentsForYear(institutionA, 2030);
      expect(year2030).toHaveLength(1); // still exactly one — no duplicate created
    });

    it("the allow_duplicate_headers override creates anyway, inside the same locked transaction", async () => {
      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionA,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      const result = await commitShipmentImportForInstitution({
        institutionId: institutionA,
        raw_text: rawText,
        preview_hash: preview.preview_hash,
        year: 2030,
        options: { allow_species_autocreate: true, allow_duplicate_headers: true },
      });

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);

      const year2030 = await shipmentsForYear(institutionA, 2030);
      expect(year2030).toHaveLength(2); // the override intentionally created a second header
    });
  });

  // -------------------------------------------------------------------------
  // Scenarios B + C — rollback within a year, prior-year preservation, and retry
  // -------------------------------------------------------------------------

  describe("Scenarios B & C: rollback within a year, prior-year preservation, retry", () => {
    /**
     * Deterministic DB-level failure mechanism (hardening checkpoint, review section 15.3 — see
     * the trigger/guard helpers above for the full design rationale): the third row's `No. rec` is
     * the sentinel value `123456789` — an entirely ordinary, bounds-compliant integer that
     * satisfies every parser and accounting rule, including the upper-bound check (confirmed
     * below: the full-workbook preview for this exact raw text reports zero issues) — but, with
     * the test-only guard enabled immediately around the one call meant to fail, causes a real
     * `RAISE EXCEPTION` inside the transaction, after the year's first (valid) shipment has
     * already been inserted. This proves the rollback is real, not merely a validation gate,
     * without relying on any value that the parser's own validation would now reject outright.
     */
    const SENTINEL_NUMBER_RECEIVED = PHASE3D_TEST_SENTINEL_NUMBER_RECEIVED;

    const rawTextFailing = buildRawText([
      // Year 2010 — the "prior year" that must survive a later year's failure.
      buildRow({
        species: "Zzz Phase3d Species Rollback A",
        numberReceived: 5,
        supplier: "ZZPH3DB1",
        shipDate: "2010-01-01",
        arrivalDate: "2010-01-05",
      }),
      // Year 2011, shipment 1 — valid, must be inserted (and then rolled back) before shipment 2 fails.
      buildRow({
        species: "Zzz Phase3d Species Rollback B",
        numberReceived: 5,
        supplier: "ZZPH3DB2",
        shipDate: "2011-02-01",
        arrivalDate: "2011-02-05",
      }),
      // Year 2011, shipment 2 — the engineered-failure shipment (fires only while the guard above
      // is explicitly enabled; retried unchanged, with the guard off, later in this describe block).
      buildRow({
        species: "Zzz Phase3d Species Rollback Overflow",
        numberReceived: SENTINEL_NUMBER_RECEIVED,
        supplier: "ZZPH3DB3",
        shipDate: "2011-03-01",
        arrivalDate: "2011-03-05",
      }),
    ]);

    it("the failing raw text passes full-workbook validation cleanly (proves this is not a pre-validation rejection)", async () => {
      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionB,
        raw_text: rawTextFailing,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });
      expect(preview.issues).toEqual([]);
      expect(preview.years).toEqual([2010, 2011]);
    });

    it("commits year 2010 successfully (the prior year)", async () => {
      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionB,
        raw_text: rawTextFailing,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      const result = await commitShipmentImportForInstitution({
        institutionId: institutionB,
        raw_text: rawTextFailing,
        preview_hash: preview.preview_hash,
        year: 2010,
        options: { allow_species_autocreate: true },
      });

      expect(result).toEqual({ year: 2010, created: 1, skipped: 0, warnings: expect.any(Array) });
      expect(await shipmentsForYear(institutionB, 2010)).toHaveLength(1);
    });

    it("rolls back year 2011 entirely on the engineered DB-level failure, leaving zero shipments for that year", async () => {
      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionB,
        raw_text: rawTextFailing,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      let caught: unknown;
      await setPhase3dTestGuard(true);
      try {
        await commitShipmentImportForInstitution({
          institutionId: institutionB,
          raw_text: rawTextFailing,
          preview_hash: preview.preview_hash,
          year: 2011,
          options: { allow_species_autocreate: true },
        });
      } catch (error) {
        caught = error;
      } finally {
        // Reset immediately, in a finally, so a failure in this test itself can never leave the
        // guard enabled for any later test in this file.
        await setPhase3dTestGuard(false);
      }

      expect(caught).toBeInstanceOf(Error);
      // drizzle-orm wraps the real driver error as `DrizzleQueryError`, whose own `.message` is
      // just "Failed query: ...\nparams: ..." — the actual Postgres error text (our trigger's own
      // `RAISE EXCEPTION` message) lives on `.cause`, not `.message` itself (confirmed directly
      // against this project's installed drizzle-orm: `errors.cjs`'s `DrizzleQueryError`
      // constructor attaches the original error as `this.cause`). Check both so this assertion
      // stays correct whether or not a future drizzle-orm version changes that wrapping.
      const causeMessage = (caught as { cause?: { message?: string } }).cause?.message;
      const combinedMessage = `${(caught as Error).message} ${causeMessage ?? ""}`;
      expect(combinedMessage).toContain("phase3d_test: deterministic injected failure");

      // Neither shipment from year 2011 survives — including the first, VALID one that was
      // genuinely inserted (and rolled back) before the second one's failure.
      expect(await shipmentsForYear(institutionB, 2011)).toHaveLength(0);

      // The full chain of side effects for BOTH year-2011 shipments rolled back too, not just the
      // shipment headers: species auto-create, supplier auto-create, and the institution-species
      // link all happened earlier in this same failed transaction (shipment B2's species/supplier
      // before it successfully inserted; shipment B3's before its items insert overflowed) — every
      // one of them must be gone, proving this is a real, whole-transaction rollback.
      const rollbackBId = await findSpeciesId("zzz phase3d species rollback b");
      const rollbackOverflowId = await findSpeciesId("zzz phase3d species rollback overflow");
      expect(rollbackBId).toBeNull();
      expect(rollbackOverflowId).toBeNull();

      await expect(supplierExists("ZZPH3DB2")).resolves.toBe(false);
      await expect(supplierExists("ZZPH3DB3")).resolves.toBe(false);

      // No shipment_items rows reference either year-2011 species for this institution (there is
      // no shipment left to own them, but confirm the item rows themselves are gone directly too).
      const [itemCount] = await db.execute(
        sql`SELECT count(*)::int AS count FROM shipment_items si
            JOIN butterfly_species bs ON bs.id = si.butterfly_species_id
            WHERE si.institution_id = ${institutionB}
              AND lower(bs.scientific_name) IN ('zzz phase3d species rollback b', 'zzz phase3d species rollback overflow')`,
      );
      expect((itemCount as unknown as { count: number }).count).toBe(0);

      // No institution-species link rows exist for either species (species themselves are gone,
      // so this is also implied, but confirmed directly per this phase's explicit requirement).
      const [linkCount] = await db.execute(
        sql`SELECT count(*)::int AS count FROM butterfly_species_institution bsi
            JOIN butterfly_species bs ON bs.id = bsi.butterfly_species_id
            WHERE bsi.institution_id = ${institutionB}
              AND lower(bs.scientific_name) IN ('zzz phase3d species rollback b', 'zzz phase3d species rollback overflow')`,
      );
      expect((linkCount as unknown as { count: number }).count).toBe(0);
    });

    it("prior year 2010's data remains fully intact after year 2011's rollback", async () => {
      const year2010 = await shipmentsForYear(institutionB, 2010);
      expect(year2010).toHaveLength(1);
      const items = await itemsForShipment(year2010[0].id);
      expect(items).toHaveLength(1);
      expect(items[0].numberReceived).toBe(5);
    });

    it("releases the advisory lock after a rolled-back transaction", async () => {
      await expectLockIsReleased(institutionB);
    });

    it("retrying year 2011 after the engineered failure condition is removed succeeds, without disturbing year 2010", async () => {
      // Deliberately resubmits the exact same `rawTextFailing` unchanged — the data itself was
      // never actually invalid (confirmed above: it validates cleanly). Only the test-only guard
      // made the previous attempt fail, and that guard was reset to `false` in the previous test's
      // `finally` block. This matches a real transient-failure retry more faithfully than
      // "fixing" a data value that was never the real problem.
      const retryPreview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionB,
        raw_text: rawTextFailing,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });
      expect(retryPreview.issues).toEqual([]);

      const result = await commitShipmentImportForInstitution({
        institutionId: institutionB,
        raw_text: rawTextFailing,
        preview_hash: retryPreview.preview_hash,
        year: 2011,
        options: { allow_species_autocreate: true },
      });

      expect(result).toEqual({ year: 2011, created: 2, skipped: 0, warnings: expect.any(Array) });
      expect(await shipmentsForYear(institutionB, 2011)).toHaveLength(2);
      expect(await shipmentsForYear(institutionB, 2010)).toHaveLength(1); // untouched

      // The retry cleanly re-creates everything the failed attempt had rolled back: species,
      // suppliers, and institution-species links for both year-2011 shipments.
      const rollbackBId = await findSpeciesId("zzz phase3d species rollback b");
      const rollbackOverflowId = await findSpeciesId("zzz phase3d species rollback overflow");
      expect(rollbackBId).not.toBeNull();
      expect(rollbackOverflowId).not.toBeNull();

      await expect(supplierExists("ZZPH3DB2")).resolves.toBe(true);
      await expect(supplierExists("ZZPH3DB3")).resolves.toBe(true);

      await expect(speciesLinkExists(institutionB, rollbackBId!)).resolves.toBe(true);
      await expect(speciesLinkExists(institutionB, rollbackOverflowId!)).resolves.toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario E — concurrency (real advisory-lock behavior)
  // -------------------------------------------------------------------------

  describe("Scenario E: concurrency", () => {
    it("a held lock for an institution causes a same-institution commit to fail fast", async () => {
      const rawText = buildRawText([
        buildRow({
          species: "Zzz Phase3d Species Rollback A",
          numberReceived: 5,
          supplier: "ZZPH3DB1",
          shipDate: "2010-01-01",
          arrivalDate: "2010-01-05",
        }),
      ]);

      const holder = holdAdvisoryLock(institutionB);
      // Give the holder's BEGIN + lock-acquire round trip time to actually land before we race it.
      await new Promise((resolve) => setTimeout(resolve, 200));

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionB,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      let caught: unknown;
      try {
        await commitShipmentImportForInstitution({
          institutionId: institutionB,
          raw_text: rawText,
          preview_hash: preview.preview_hash,
          year: 2010,
          options: { allow_species_autocreate: true },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe("IMPORT_ALREADY_RUNNING");

      holder.release();
      await holder.held;
    });

    it("the lock is scoped per-institution: a held lock for one institution does not block a different institution's commit", async () => {
      const rawText = buildRawText([
        buildRow({
          species: "Zzz Phase3d Species Concurrency C",
          numberReceived: 2,
          supplier: "ZZPH3DC1",
          shipDate: "2020-01-01",
          arrivalDate: "2020-01-05",
        }),
      ]);

      const holder = holdAdvisoryLock(institutionB);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionC,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });
      expect(preview.issues).toEqual([]);

      const result = await commitShipmentImportForInstitution({
        institutionId: institutionC,
        raw_text: rawText,
        preview_hash: preview.preview_hash,
        year: 2020,
        options: { allow_species_autocreate: true },
      });

      expect(result).toEqual({ year: 2020, created: 1, skipped: 0, warnings: expect.any(Array) });
      expect(await shipmentsForYear(institutionC, 2020)).toHaveLength(1);

      holder.release();
      await holder.held;
    });

    it("the lock is released after the holder's transaction ends, allowing a normal retry to proceed", async () => {
      const rawText = buildRawText([
        buildRow({
          species: "Zzz Phase3d Species Rollback A",
          numberReceived: 5,
          supplier: "ZZPH3DB1",
          shipDate: "2010-01-01",
          arrivalDate: "2010-01-05",
        }),
      ]);

      const preview = await buildShipmentImportPreviewForInstitution({
        institutionId: institutionB,
        raw_text: rawText,
        source: { kind: "paste" },
        allowSpeciesAutocreate: true,
      });

      // Shipment already exists from the earlier scenario — a successful, idempotent skip proves
      // the lock from the previous test was genuinely released, not just that this call happened
      // to acquire a different lock.
      const result = await commitShipmentImportForInstitution({
        institutionId: institutionB,
        raw_text: rawText,
        preview_hash: preview.preview_hash,
        year: 2010,
        options: { allow_species_autocreate: true },
      });

      expect(result).toEqual({ year: 2010, created: 0, skipped: 1, warnings: [] });
    });
  });
});
