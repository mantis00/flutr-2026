/**
 * Phase 6 — real end-to-end verification for the historical shipment import/export feature.
 *
 * Distinct from the Phase 3D integration suite (`shipment-import-commit.integration.test.ts`),
 * which proves the core commit/rollback/concurrency transactional guarantees by calling the
 * service's institution-agnostic functions directly. This file instead calls the actual, real
 * route handlers (`POST`/`GET` exported from `src/app/api/.../route.ts`) — the one layer the
 * Phase 3D suite deliberately bypasses — against a real `flutr_import_test` connection, to prove:
 *
 *   1. A commit → export → re-validate → re-import round trip genuinely works (the exact
 *      guarantee the Phase 5B in-app guide promises users).
 *   2. A payload near the measured real historical workbook's size (~1.76 MB) actually posts
 *      through a real route without being rejected or truncated by anything in the stack.
 *   3. The platform and tenant commit paths' authorization/species-autocreate behavior holds at
 *      the real route + real database level, not only in Phase 4's mocked unit tests.
 *
 * Same safety gating, cleanup, and `db.session.client` teardown as the Phase 3D suite — see that
 * file's header comment for the full rationale, not repeated here.
 */

import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  institutions,
  butterfly_species,
  suppliers,
  shipments,
  shipment_items,
} from "@/lib/schema";
import {
  CANONICAL_SHIPMENT_IMPORT_HEADERS,
  rowsToTabDelimitedText,
} from "@/lib/shipment-import-utils";
import { POST as platformPreview } from "@/app/api/platform/institutions/[id]/shipments/import/preview/route";
import { POST as platformCommit } from "@/app/api/platform/institutions/[id]/shipments/import/commit/route";
import { GET as platformExport } from "@/app/api/platform/institutions/[id]/shipments/export/route";
import { POST as tenantPreview } from "@/app/api/tenant/shipments/import/preview/route";
import { POST as tenantCommit } from "@/app/api/tenant/shipments/import/commit/route";

const mockAuth = auth as jest.Mock;

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
// Fixture helpers (mirrors shipment-import-commit.integration.test.ts's conventions)
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
    "",
    String(numberReceived),
    supplier,
    shipDate,
    arrivalDate,
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    released === "" ? "" : String(released),
  ].join("\t");
}

function buildRawText(rows: string[]): string {
  return [HEADER_ROW, ...rows].join("\n");
}

async function cleanupTestData() {
  await db.delete(institutions).where(sql`${institutions.slug} LIKE 'phase6-integration-%'`);
  await db
    .delete(butterfly_species)
    .where(sql`lower(${butterfly_species.scientific_name}) LIKE 'zzz phase6%'`);
  await db.delete(suppliers).where(sql`${suppliers.code} LIKE 'ZZPH6%'`);
}

async function createTestInstitution(slugSuffix: string): Promise<{ id: number; slug: string }> {
  const slug = `phase6-integration-${slugSuffix}`;
  const [row] = await db
    .insert(institutions)
    .values({
      slug,
      name: `Phase 6 Integration Test (${slugSuffix})`,
      street_address: "123 Test St",
      city: "Testville",
      state_province: "TS",
      postal_code: "00000",
      country: "USA",
    })
    .returning({ id: institutions.id });
  return { id: row.id, slug };
}

function platformSession() {
  return { user: { id: "1", role: "SUPERUSER", institutionId: null } };
}

function tenantSession(institutionId: number) {
  return { user: { id: "2", role: "ADMIN", institutionId } };
}

function routeContext(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function makePlatformRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeTenantRequest(path: string, body: Record<string, unknown>, slug: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tenant-slug": slug },
    body: JSON.stringify(body),
  });
}

async function findSpeciesId(scientificName: string): Promise<number | null> {
  const [row] = await db
    .select({ id: butterfly_species.id })
    .from(butterfly_species)
    .where(eq(butterfly_species.scientific_name, scientificName));
  return row?.id ?? null;
}

async function itemsForInstitutionYear(institutionId: number, year: number) {
  return db
    .select({
      scientificName: butterfly_species.scientific_name,
      numberReceived: shipment_items.number_received,
      goodEmergence: shipment_items.good_emergence,
    })
    .from(shipment_items)
    .innerJoin(shipments, eq(shipments.id, shipment_items.shipment_id))
    .innerJoin(butterfly_species, eq(butterfly_species.id, shipment_items.butterfly_species_id))
    .where(
      and(
        eq(shipment_items.institution_id, institutionId),
        sql`extract(year from ${shipments.arrival_date})::int = ${year}`,
      ),
    )
    .orderBy(butterfly_species.scientific_name);
}

describeIntegration("shipment import — Phase 6 real end-to-end verification", () => {
  beforeAll(async () => {
    if (!IS_IMPORT_TEST_DATABASE) {
      throw new Error(
        `Refusing to run: RUN_SHIPMENT_IMPORT_INTEGRATION_TESTS=1 was set, but DATABASE_URL does ` +
          `not resolve to a database named "flutr_import_test" (resolved: "${DATABASE_NAME}"). ` +
          `This suite may only ever run against flutr_import_test.`,
      );
    }
    await cleanupTestData();
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

  beforeEach(() => {
    mockAuth.mockReset();
  });

  // -------------------------------------------------------------------------
  // 1. Export → re-import round trip (real routes, real database)
  // -------------------------------------------------------------------------

  describe("export → re-import round trip", () => {
    it("committing data, exporting it, and re-importing the export into a fresh institution reproduces it exactly", async () => {
      const source = await createTestInstitution("roundtrip-source");
      const target = await createTestInstitution("roundtrip-target");

      await db.insert(butterfly_species).values({
        scientific_name: "Zzz Phase6 Roundtrip Alpha",
        common_name: "Zzz Phase6 Roundtrip Alpha",
        family: "Unknown",
        sub_family: "Unknown",
        lifespan_days: 1,
        range: ["Unknown"],
      });

      mockAuth.mockResolvedValue(platformSession());

      const originalRawText = buildRawText([
        buildRow({
          species: "Zzz Phase6 Roundtrip Alpha", // pre-existing
          numberReceived: 10,
          supplier: "ZZPH6RT",
          shipDate: "2040-05-01",
          arrivalDate: "2040-05-10",
          released: 4, // known positive
        }),
        buildRow({
          species: "Zzz Phase6 Roundtrip Beta", // auto-created
          numberReceived: 8,
          supplier: "ZZPH6RT",
          shipDate: "2040-05-01",
          arrivalDate: "2040-05-10",
          released: "", // unknown
        }),
        buildRow({
          species: "Zzz Phase6 Roundtrip Gamma", // auto-created
          numberReceived: 6,
          supplier: "ZZPH6RT",
          shipDate: "2040-05-01",
          arrivalDate: "2040-05-10",
          released: 0, // known zero
        }),
      ]);

      // Commit the original workbook into the source institution via the real platform routes.
      // Two of the three species are unresolved and will be auto-created below — preview must be
      // told the same `allow_species_autocreate: true` intent, or it now blocks (manual QA
      // finding 1 fix: preview follows the real per-request toggle, not role eligibility).
      const previewResponse = await platformPreview(
        makePlatformRequest(`/api/platform/institutions/${source.id}/shipments/import/preview`, {
          raw_text: originalRawText,
          source: { kind: "paste" },
          allow_species_autocreate: true,
        }),
        routeContext(source.id),
      );
      expect(previewResponse!.status).toBe(200);
      const preview = await previewResponse!.json();
      expect(preview.issues).toEqual([]);

      const commitResponse = await platformCommit(
        makePlatformRequest(`/api/platform/institutions/${source.id}/shipments/import/commit`, {
          raw_text: originalRawText,
          preview_hash: preview.preview_hash,
          year: 2040,
          options: { allow_species_autocreate: true },
        }),
        routeContext(source.id),
      );
      expect(commitResponse!.status).toBe(200);
      const commitResult = await commitResponse!.json();
      expect(commitResult).toEqual({
        year: 2040,
        created: 1,
        skipped: 0,
        warnings: expect.any(Array),
      });

      // Export the source institution's real data via the real export route.
      const exportResponse = await platformExport(
        new NextRequest(
          `http://localhost/api/platform/institutions/${source.id}/shipments/export?format=xlsx`,
          { method: "GET" },
        ),
        routeContext(source.id),
      );
      expect(exportResponse!.status).toBe(200);
      const exportedBuffer = Buffer.from(await exportResponse!.arrayBuffer());

      // Convert the real exported workbook back to raw text exactly as the client-side upload
      // path does (`readUploadFileAsText`'s own xlsx branch), proving the export is genuinely
      // re-importable, not merely "looks right" in isolation.
      const xlsx = await import("xlsx");
      const exportedWorkbook = xlsx.read(exportedBuffer, { type: "buffer" });
      const exportedSheet = exportedWorkbook.Sheets[exportedWorkbook.SheetNames[0]];
      const exportedRows = xlsx.utils.sheet_to_json<Array<string | number | boolean | null>>(
        exportedSheet,
        { header: 1, raw: false, defval: "" },
      );
      const reimportRawText = rowsToTabDelimitedText(exportedRows);

      // Re-validate the export against the real strict importer — this is the exact guarantee
      // the Phase 5B guide promises: "Export... so it can be reviewed or re-imported elsewhere
      // later." A header mismatch here (the original, confirmed Released-export gap) would show
      // up as a blocking issue.
      const reimportPreviewResponse = await platformPreview(
        makePlatformRequest(`/api/platform/institutions/${target.id}/shipments/import/preview`, {
          raw_text: reimportRawText,
          source: { kind: "paste" },
        }),
        routeContext(target.id),
      );
      expect(reimportPreviewResponse!.status).toBe(200);
      const reimportPreview = await reimportPreviewResponse!.json();
      expect(reimportPreview.issues).toEqual([]);
      expect(reimportPreview.years).toEqual([2040]);

      // Commit the re-imported export into the fresh target institution.
      const reimportCommitResponse = await platformCommit(
        makePlatformRequest(`/api/platform/institutions/${target.id}/shipments/import/commit`, {
          raw_text: reimportRawText,
          preview_hash: reimportPreview.preview_hash,
          year: 2040,
          options: { allow_species_autocreate: true },
        }),
        routeContext(target.id),
      );
      expect(reimportCommitResponse!.status).toBe(200);
      const reimportCommitResult = await reimportCommitResponse!.json();
      expect(reimportCommitResult).toEqual({
        year: 2040,
        created: 1,
        skipped: 0,
        warnings: expect.any(Array),
      });

      // The target institution's real data matches the source's exactly — including the
      // NULL-vs-zero-vs-positive Released distinction, preserved all the way through export and
      // back.
      const sourceItems = await itemsForInstitutionYear(source.id, 2040);
      const targetItems = await itemsForInstitutionYear(target.id, 2040);
      expect(targetItems).toHaveLength(3);
      expect(targetItems).toEqual(sourceItems);

      // Case note: "Alpha" is the pre-existing species, stored with its original title case
      // (never rewritten by import); "Beta"/"Gamma" are auto-created, which always stores the
      // normalized (lowercase) name — confirmed, not assumed, by reading the actual rows below.
      const byName = new Map(targetItems.map((item) => [item.scientificName.toLowerCase(), item]));
      expect(byName.get("zzz phase6 roundtrip alpha")?.goodEmergence).toBe(4);
      expect(byName.get("zzz phase6 roundtrip beta")?.goodEmergence).toBeNull();
      expect(byName.get("zzz phase6 roundtrip gamma")?.goodEmergence).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. HTTP request-size verification (real route, payload near the measured real-workbook size)
  // -------------------------------------------------------------------------

  describe("HTTP request-size handling", () => {
    it("a preview request near the measured real historical workbook's size (~1.76 MB) posts and parses successfully through the real route", async () => {
      const institution = await createTestInstitution("http-size");
      mockAuth.mockResolvedValue(platformSession());

      const rows: string[] = [];
      let rawText = buildRawText(rows);
      let year = 2050;
      let dayOfYear = 1;
      // Keep growing until the raw_text is within the same order of magnitude as the real
      // consolidated fixture (1.76 MB measured in the original review) — comfortably under the
      // schema's 2,000,000-character cap, so this proves normal headroom, not the exact boundary.
      while (rawText.length < 1_700_000) {
        const index = rows.length;
        const month = String((Math.floor(dayOfYear / 28) % 12) + 1).padStart(2, "0");
        const day = String((dayOfYear % 28) + 1).padStart(2, "0");
        rows.push(
          buildRow({
            species: `Zzz Phase6 HttpSize Species ${index}`,
            numberReceived: 10,
            supplier: `ZZPH6H${index % 25}`,
            shipDate: `${year}-${month}-${day}`,
            arrivalDate: `${year}-${month}-${day}`,
            released: "",
          }),
        );
        dayOfYear += 1;
        if (dayOfYear > 336) {
          dayOfYear = 1;
          year += 1;
        }
        rawText = buildRawText(rows);
      }

      expect(rawText.length).toBeGreaterThan(1_700_000);
      expect(rawText.length).toBeLessThan(2_000_000); // still under the schema's max

      const response = await platformPreview(
        makePlatformRequest(
          `/api/platform/institutions/${institution.id}/shipments/import/preview`,
          {
            raw_text: rawText,
            source: { kind: "paste" },
            // Every generated species here is intentionally unresolved; this test is about
            // request-size handling, not species resolution, so opt into auto-create so the huge
            // payload's own validity isn't gated on an unrelated option (manual QA finding 1 fix).
            allow_species_autocreate: true,
          },
        ),
        routeContext(institution.id),
      );

      expect(response!.status).toBe(200);
      const body = await response!.json();
      expect(body.issues).toEqual([]);
      expect(body.summary.total_rows).toBe(rows.length);
      expect(body.summary.shipments_detected).toBe(rows.length); // every row is its own shipment here
    });
  });

  // -------------------------------------------------------------------------
  // 3. Platform and tenant workflow checks (real routes, real database, real authorization)
  // -------------------------------------------------------------------------

  describe("platform workflow: species auto-create succeeds end-to-end", () => {
    it("a platform commit with allow_species_autocreate: true really creates the species and links it", async () => {
      const institution = await createTestInstitution("platform-workflow");
      mockAuth.mockResolvedValue(platformSession());

      const rawText = buildRawText([
        buildRow({
          species: "Zzz Phase6 Platform New Species",
          numberReceived: 5,
          supplier: "ZZPH6PLAT",
          shipDate: "2041-01-01",
          arrivalDate: "2041-01-05",
          released: "",
        }),
      ]);

      const previewResponse = await platformPreview(
        makePlatformRequest(
          `/api/platform/institutions/${institution.id}/shipments/import/preview`,
          {
            raw_text: rawText,
            source: { kind: "paste" },
            // Manual QA finding 1 fix: preview's blocking decision now follows the actual,
            // per-request toggle value, not a static role-eligibility flag — so a platform
            // request intending to auto-create must say so at preview time too, matching what
            // it will request at commit below.
            allow_species_autocreate: true,
          },
        ),
        routeContext(institution.id),
      );
      const preview = await previewResponse!.json();
      expect(previewResponse!.status).toBe(200);
      // With allow_species_autocreate: true, an unresolved species stays informational only.
      expect(preview.issues).toEqual([]);

      const commitResponse = await platformCommit(
        makePlatformRequest(
          `/api/platform/institutions/${institution.id}/shipments/import/commit`,
          {
            raw_text: rawText,
            preview_hash: preview.preview_hash,
            year: 2041,
            options: { allow_species_autocreate: true },
          },
        ),
        routeContext(institution.id),
      );
      expect(commitResponse!.status).toBe(200);
      const commit = await commitResponse!.json();
      expect(commit.created).toBe(1);

      const speciesId = await findSpeciesId("zzz phase6 platform new species");
      expect(speciesId).not.toBeNull();

      const [link] = await db.execute(
        sql`SELECT 1 FROM butterfly_species_institution WHERE institution_id = ${institution.id} AND butterfly_species_id = ${speciesId} LIMIT 1`,
      );
      expect(!!link).toBe(true);
    });
  });

  describe("tenant workflow: species auto-create is force-disabled even when explicitly requested", () => {
    it("a tenant commit requesting allow_species_autocreate: true is rejected and creates nothing, confirmed against the real database", async () => {
      const institution = await createTestInstitution("tenant-workflow");
      mockAuth.mockResolvedValue(tenantSession(institution.id));

      const rawText = buildRawText([
        buildRow({
          species: "Zzz Phase6 Tenant Forbidden Species",
          numberReceived: 5,
          supplier: "ZZPH6TEN",
          shipDate: "2042-01-01",
          arrivalDate: "2042-01-05",
          released: "",
        }),
      ]);

      const previewResponse = await tenantPreview(
        makeTenantRequest(
          "/api/tenant/shipments/import/preview",
          { raw_text: rawText, source: { kind: "paste" } },
          institution.slug,
        ),
      );
      const preview = await previewResponse!.json();
      expect(previewResponse!.status).toBe(200);
      // Tenant preview DOES block on an unresolved species — it can never legally auto-create.
      expect(preview.issues.length).toBeGreaterThan(0);
      expect(preview.issues[0].message).toContain("cannot be auto-created");

      // Attempt to commit anyway, explicitly requesting autocreate in the request body.
      const commitResponse = await tenantCommit(
        makeTenantRequest(
          "/api/tenant/shipments/import/commit",
          {
            raw_text: rawText,
            preview_hash: preview.preview_hash,
            year: 2042,
            options: { allow_species_autocreate: true },
          },
          institution.slug,
        ),
      );

      // Rejected — the force-override happens server-side regardless of what the request asked
      // for, so the unresolved species is still a blocking validation error, not a successful
      // auto-create.
      expect(commitResponse!.status).toBe(400);
      const commitBody = await commitResponse!.json();
      expect(commitBody.error.code).toBe("INVALID_REQUEST");

      // Confirmed against the real database: nothing was created.
      const speciesId = await findSpeciesId("zzz phase6 tenant forbidden species");
      expect(speciesId).toBeNull();
      const [shipmentRow] = await db
        .select({ id: shipments.id })
        .from(shipments)
        .where(eq(shipments.institution_id, institution.id));
      expect(shipmentRow).toBeUndefined();
    });
  });
});
