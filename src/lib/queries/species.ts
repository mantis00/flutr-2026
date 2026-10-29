import { and, asc, eq } from "drizzle-orm";

import { db, type DbExecutor } from "@/lib/db";
import { butterfly_species, butterfly_species_institution } from "@/lib/schema";

import type {
  CreateSpeciesBody,
  UpdateSpeciesBody,
  UpdateSpeciesOverrideBody,
} from "@/lib/validation/species";

/**
 * TENANT QUERY
 *
 * List species for an institution with overrides applied.
 */
export async function listSpeciesForTenant(institutionId: number) {
  return db
    .select({
      id: butterfly_species.id,
      scientificName: butterfly_species.scientific_name,

      /** Null when the institution does not carry this species (no link row). */
      linkId: butterfly_species_institution.id,

      commonName: butterfly_species.common_name,
      commonNameOverride: butterfly_species_institution.common_name_override,

      lifespanDays: butterfly_species.lifespan_days,
      lifespanOverride: butterfly_species_institution.lifespan_override,

      family: butterfly_species.family,
      subFamily: butterfly_species.sub_family,
      range: butterfly_species.range,

      description: butterfly_species.description,
      hostPlant: butterfly_species.host_plant,
      habitat: butterfly_species.habitat,
      funFacts: butterfly_species.fun_facts,
    })
    .from(butterfly_species)
    .leftJoin(
      butterfly_species_institution,
      and(
        eq(butterfly_species_institution.butterfly_species_id, butterfly_species.id),
        eq(butterfly_species_institution.institution_id, institutionId),
      ),
    )
    .orderBy(asc(butterfly_species.scientific_name));
}

/**
 * TENANT QUERY
 *
 * Upsert override for a species.
 */
export async function upsertSpeciesOverride(
  institutionId: number,
  speciesId: number,
  input: UpdateSpeciesOverrideBody,
) {
  const hasCommonNameOverride = Object.prototype.hasOwnProperty.call(input, "common_name_override");
  const hasLifespanOverride = Object.prototype.hasOwnProperty.call(input, "lifespan_override");

  const updateData: Record<string, unknown> = {
    updated_at: new Date(),
  };

  if (hasCommonNameOverride) {
    updateData.common_name_override = input.common_name_override ?? null;
  }

  if (hasLifespanOverride) {
    updateData.lifespan_override = input.lifespan_override ?? null;
  }

  const [row] = await db
    .insert(butterfly_species_institution)
    .values({
      institution_id: institutionId,
      butterfly_species_id: speciesId,
      common_name_override: hasCommonNameOverride ? (input.common_name_override ?? null) : null,
      lifespan_override: hasLifespanOverride ? (input.lifespan_override ?? null) : null,
    })
    .onConflictDoUpdate({
      target: [
        butterfly_species_institution.butterfly_species_id,
        butterfly_species_institution.institution_id,
      ],
      set: updateData,
    })
    .returning({
      id: butterfly_species_institution.id,
      speciesId: butterfly_species_institution.butterfly_species_id,
      institutionId: butterfly_species_institution.institution_id,
      commonNameOverride: butterfly_species_institution.common_name_override,
      lifespanOverride: butterfly_species_institution.lifespan_override,
    });

  return row;
}

/**
 * TENANT QUERY
 *
 * Ensure species are linked/enabled for an institution.
 * Creates missing rows in butterfly_species_institution and ignores existing links.
 */
export async function ensureSpeciesLinksForInstitution(
  institutionId: number,
  speciesIds: number[],
  executor: Pick<typeof db, "insert"> = db,
) {
  const uniqueSpeciesIds = Array.from(new Set(speciesIds));
  if (uniqueSpeciesIds.length === 0) return;

  await executor
    .insert(butterfly_species_institution)
    .values(
      uniqueSpeciesIds.map((speciesId) => ({
        institution_id: institutionId,
        butterfly_species_id: speciesId,
      })),
    )
    .onConflictDoNothing({
      target: [
        butterfly_species_institution.butterfly_species_id,
        butterfly_species_institution.institution_id,
      ],
    });
}

/**
 * PLATFORM QUERY
 *
 * List all global species.
 */
export async function listSpeciesGlobal() {
  return db
    .select({
      id: butterfly_species.id,
      scientificName: butterfly_species.scientific_name,
      commonName: butterfly_species.common_name,
      family: butterfly_species.family,
      subFamily: butterfly_species.sub_family,
      lifespanDays: butterfly_species.lifespan_days,
      range: butterfly_species.range,
      createdAt: butterfly_species.created_at,
    })
    .from(butterfly_species)
    .orderBy(asc(butterfly_species.scientific_name));
}

/**
 * Fetch species by ID.
 */
export async function getSpeciesById(speciesId: number) {
  // Projected explicitly so the dormant img_* columns stay off the API.
  const [row] = await db
    .select({
      id: butterfly_species.id,
      scientific_name: butterfly_species.scientific_name,
      common_name: butterfly_species.common_name,
      family: butterfly_species.family,
      sub_family: butterfly_species.sub_family,
      lifespan_days: butterfly_species.lifespan_days,
      range: butterfly_species.range,
      description: butterfly_species.description,
      host_plant: butterfly_species.host_plant,
      habitat: butterfly_species.habitat,
      fun_facts: butterfly_species.fun_facts,
      created_at: butterfly_species.created_at,
      updated_at: butterfly_species.updated_at,
    })
    .from(butterfly_species)
    .where(eq(butterfly_species.id, speciesId))
    .limit(1);

  return row ?? null;
}

/**
 * PLATFORM QUERY
 *
 * Create species.
 *
 * Accepts an optional `executor` (a `db.transaction` callback's `tx`) so this can participate
 * in a caller-owned transaction instead of writing outside it — used by the historical
 * importer's year-scoped atomic commit (a later phase), so an auto-created species never
 * persists if that transaction later rolls back. Defaults to the plain `db` client, identical
 * to today's behavior, for every existing caller (including the platform species admin route).
 */
export async function createSpecies(input: CreateSpeciesBody, executor: DbExecutor = db) {
  const [row] = await executor.insert(butterfly_species).values(input).returning();

  return row;
}

/**
 * PLATFORM QUERY
 *
 * Update species.
 */
export async function updateSpecies(speciesId: number, input: UpdateSpeciesBody) {
  const updateData: Record<string, unknown> = {
    updated_at: new Date(),
  };

  Object.assign(updateData, input);

  const [row] = await db
    .update(butterfly_species)
    .set(updateData)
    .where(eq(butterfly_species.id, speciesId))
    .returning();

  return row ?? null;
}

/**
 * PLATFORM QUERY
 *
 * Delete species by ID. Returns the deleted row, or undefined if not found.
 */
export async function deleteSpecies(speciesId: number) {
  const [row] = await db
    .delete(butterfly_species)
    .where(eq(butterfly_species.id, speciesId))
    .returning();

  return row ?? undefined;
}
