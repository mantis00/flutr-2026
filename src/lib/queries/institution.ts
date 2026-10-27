import { cache } from "react";
import { eq, and, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { institutions } from "@/lib/schema";
import { PlatformCreateInstitutionInput } from "../validation/institution";

/**
 * Cached institution lookup by slug.
 * React's `cache()` deduplicates calls within a single server request,
 * so the layout and page share the same result without hitting the DB twice.
 */
export const getPublicInstitution = cache(async (slug: string) => {
  const [row] = await db
    .select({
      id: institutions.id,
      name: institutions.name,
      main_header: institutions.main_header,
      description: institutions.description,
      street_address: institutions.street_address,
      extended_address: institutions.extended_address,
      city: institutions.city,
      state_province: institutions.state_province,
      postal_code: institutions.postal_code,
      country: institutions.country,
      email_address: institutions.email_address,
      phone_number: institutions.phone_number,
      website_url: institutions.website_url,
      volunteer_url: institutions.volunteer_url,
      donation_url: institutions.donation_url,
      logo_url: institutions.logo_url,
      facility_image_url: institutions.facility_image_url,
      theme_colors: institutions.theme_colors,
      social_links: institutions.social_links,
    })
    .from(institutions)
    .where(and(eq(institutions.slug, slug), eq(institutions.stats_active, true)))
    .limit(1);

  return row ?? null;
});

/**
 * TENANT QUERY
 *
 * Fetch the institution belonging to the current tenant.
 */
export async function getTenantInstitution(tenantId: number) {
  const [row] = await db.select().from(institutions).where(eq(institutions.id, tenantId)).limit(1);

  return row ?? null;
}

/**
 * TENANT QUERY
 *
 * Update the institution belonging to the current tenant.
 */
export async function updateTenantInstitution(
  tenantId: number,
  data: Partial<typeof institutions.$inferInsert>,
) {
  const [row] = await db
    .update(institutions)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(institutions.id, tenantId))
    .returning();

  return row ?? null;
}

/**
 * PLATFORM QUERY
 *
 * Create a new institution (platform-level access).
 * Accepts an optional transaction for use within onboard operations.
 */
export async function createInstitution(data: PlatformCreateInstitutionInput, tx?: typeof db) {
  const database = tx ?? db;

  const [row] = await database
    .insert(institutions)
    .values({
      ...data,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning();

  return row ?? null;
}

/**
 * PLATFORM QUERY
 *
 * Fetch any institution by ID (platform-level access).
 */
export async function getInstitutionById(id: number) {
  const [row] = await db.select().from(institutions).where(eq(institutions.id, id)).limit(1);

  return row ?? null;
}

/**
 * PLATFORM QUERY
 *
 * Update any institution by ID.
 */
export async function updateInstitutionById(
  id: number,
  data: Partial<typeof institutions.$inferInsert>,
) {
  const [row] = await db
    .update(institutions)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(institutions.id, id))
    .returning();

  return row ?? null;
}

/**
 * PLATFORM QUERY
 *
 * Fetch all institutions (for platform admin listing).
 */
export async function getAllInstitutions() {
  return db.select().from(institutions);
}

/**
 * PLATFORM VALIDATION
 *
 * Check if a slug already exists (excluding a specific institution).
 */
export async function institutionSlugExists(slug: string, excludeId?: number) {
  const conditions = excludeId
    ? and(eq(institutions.slug, slug), ne(institutions.id, excludeId))
    : eq(institutions.slug, slug);

  const [row] = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(conditions)
    .limit(1);

  return !!row;
}

/**
 * PLATFORM QUERY
 *
 * Delete any institution by ID.
 */
export async function deleteInstitution(id: number) {
  await db.delete(institutions).where(eq(institutions.id, id));
}
