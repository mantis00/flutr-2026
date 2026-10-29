import { and, asc, eq, ne } from "drizzle-orm";

import { db, type DbExecutor } from "@/lib/db";
import { suppliers } from "@/lib/schema";

import type { CreateSupplierBody, UpdateSupplierBody } from "@/lib/validation/suppliers";

export const SUPPLIER_ERRORS = {
  REFERENCED_BY_SHIPMENTS: "Supplier is referenced by existing shipments",
} as const;

const supplierSelect = {
  id: suppliers.id,
  name: suppliers.name,
  code: suppliers.code,
  country: suppliers.country,
  websiteUrl: suppliers.website_url,
  isActive: suppliers.is_active,
  createdAt: suppliers.created_at,
};

/**
 * GLOBAL QUERY
 *
 * List all global supplier rows ordered alphabetically by code.
 */
export async function listSuppliersGlobal() {
  return db.select(supplierSelect).from(suppliers).orderBy(asc(suppliers.code));
}

/**
 * Fetch a single supplier by ID.
 */
export async function getSupplierById(supplierId: number) {
  const [row] = await db
    .select(supplierSelect)
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  return row ?? null;
}

/**
 * Check if a supplier code already exists globally.
 * Optionally exclude a supplier ID (for update uniqueness checks).
 */
export async function supplierCodeExists(code: string, excludeId?: number) {
  const condition = excludeId
    ? and(eq(suppliers.code, code), ne(suppliers.id, excludeId))
    : eq(suppliers.code, code);

  const [row] = await db.select({ id: suppliers.id }).from(suppliers).where(condition).limit(1);

  return !!row;
}

/**
 * PLATFORM QUERY
 *
 * Create a new global supplier.
 */
export async function createSupplier(input: CreateSupplierBody) {
  try {
    const [row] = await db
      .insert(suppliers)
      .values({
        name: input.name,
        code: input.code,
        country: input.country,
        website_url: input.website_url ?? null,
        is_active: input.is_active ?? true,
      })
      .returning(supplierSelect);

    return row;
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new Error("CONFLICT");
    throw error;
  }
}

/**
 * PLATFORM QUERY
 *
 * Update a supplier by ID.
 */
export async function updateSupplier(supplierId: number, input: UpdateSupplierBody) {
  const updateData: Record<string, unknown> = { updated_at: new Date() };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.code !== undefined) updateData.code = input.code;
  if (input.country !== undefined) updateData.country = input.country;
  if (input.website_url !== undefined) updateData.website_url = input.website_url;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  try {
    const [row] = await db
      .update(suppliers)
      .set(updateData)
      .where(eq(suppliers.id, supplierId))
      .returning(supplierSelect);

    return row ?? null;
  } catch (error: unknown) {
    if (isUniqueViolation(error)) throw new Error("CONFLICT");
    if (isForeignKeyViolation(error)) throw new Error(SUPPLIER_ERRORS.REFERENCED_BY_SHIPMENTS);
    throw error;
  }
}

/**
 * PLATFORM QUERY
 *
 * Delete a supplier by ID.
 * Throws SUPPLIER_ERRORS.REFERENCED_BY_SHIPMENTS if FK constraint prevents deletion.
 */
export async function deleteSupplier(supplierId: number) {
  try {
    const result = await db
      .delete(suppliers)
      .where(eq(suppliers.id, supplierId))
      .returning({ id: suppliers.id });

    return result.length > 0;
  } catch (error: unknown) {
    if (isForeignKeyViolation(error)) {
      throw new Error(SUPPLIER_ERRORS.REFERENCED_BY_SHIPMENTS);
    }
    throw error;
  }
}

/**
 * Detect PostgreSQL foreign key violation (error code 23503).
 */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: unknown }).code === "23503"
  );
}

/**
 * Detect PostgreSQL unique constraint violation (error code 23505).
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

/**
 * GLOBAL QUERY
 *
 * Ensure a global supplier code exists for import commit, creating missing
 * codes as inactive for later platform review.
 *
 * Accepts an optional `executor` (a `db.transaction` callback's `tx`) so this can participate
 * in a caller-owned transaction instead of writing outside it — used by the historical
 * importer's year-scoped atomic commit (a later phase), so an auto-created supplier never
 * persists if that transaction later rolls back. Defaults to the plain `db` client, identical
 * to today's behavior, for every existing caller.
 */
export async function ensureSupplierExistsForGlobalImport(
  code: string,
  fallbackData?: {
    name?: string;
    country?: string;
    websiteUrl?: string | null;
  },
  executor: DbExecutor = db,
) {
  const supplierCode = code.trim();

  const [globalMatch] = await executor
    .select({
      id: suppliers.id,
      code: suppliers.code,
    })
    .from(suppliers)
    .where(eq(suppliers.code, supplierCode))
    .limit(1);

  if (globalMatch) {
    return {
      ...globalMatch,
      wasGloballyMissing: false,
    };
  }

  const [created] = await executor
    .insert(suppliers)
    .values({
      code: supplierCode,
      name: fallbackData?.name ?? supplierCode,
      country: fallbackData?.country ?? "Unknown",
      website_url: fallbackData?.websiteUrl ?? null,
      is_active: false,
    })
    .onConflictDoNothing()
    .returning({
      id: suppliers.id,
      code: suppliers.code,
    });

  if (created) {
    return { ...created, wasGloballyMissing: true };
  }

  // Race: another process inserted first — re-select the winning row.
  const [existing] = await executor
    .select({ id: suppliers.id, code: suppliers.code })
    .from(suppliers)
    .where(eq(suppliers.code, supplierCode))
    .limit(1);

  return { ...existing!, wasGloballyMissing: true };
}
