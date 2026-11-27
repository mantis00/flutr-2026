import { cache } from "react";
import { eq, and, sql, desc, asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { butterfly_species, butterfly_species_institution, institution_news } from "@/lib/schema";
import {
  currentInFlightBySpeciesSubquery,
  getCurrentInFlightSummary,
} from "@/lib/queries/inflight";

export interface FeaturedSpeciesRow {
  scientific_name: string;
  common_name: string;
  family: string;
  range: string[];
  lifespan_days: number;
  host_plant: string | null;
  in_flight_count: number;
}

/** Featured species list for rendering Butterfly of the Day (lighter than getInstitutionHomeData). */
export const getFeaturedSpeciesList = cache(async (institutionId: number) => {
  const currentInFlight = currentInFlightBySpeciesSubquery(institutionId);

  const rows = await db
    .select({
      scientific_name: butterfly_species.scientific_name,
      common_name:
        sql<string>`coalesce(${butterfly_species_institution.common_name_override}, ${butterfly_species.common_name})`.as(
          "common_name",
        ),
      family: butterfly_species.family,
      range: butterfly_species.range,
      lifespan_days:
        sql<number>`coalesce(${butterfly_species_institution.lifespan_override}, ${butterfly_species.lifespan_days})`.as(
          "lifespan_days",
        ),
      host_plant: butterfly_species.host_plant,
      in_flight_count: sql<number>`${currentInFlight.quantity}`.as("in_flight_count"),
    })
    .from(currentInFlight)
    .innerJoin(butterfly_species, eq(currentInFlight.butterfly_species_id, butterfly_species.id))
    .leftJoin(
      butterfly_species_institution,
      and(
        eq(butterfly_species_institution.butterfly_species_id, butterfly_species.id),
        eq(butterfly_species_institution.institution_id, institutionId),
      ),
    )
    .orderBy(asc(butterfly_species.scientific_name));

  return rows as FeaturedSpeciesRow[];
});

/** In-flight headline stats for the institution home page. */
export const getInstitutionHomeData = cache(async (institutionId: number) => {
  const inFlightSummary = await getCurrentInFlightSummary(institutionId);

  return {
    totalButterflies: inFlightSummary.totalButterflies,
    totalSpecies: inFlightSummary.totalSpecies,
  };
});

/** Latest active news entry for the institution home page. */
export const getPublicNewsPreview = cache(async (institutionId: number) => {
  const [row] = await db
    .select({
      id: institution_news.id,
      title: institution_news.title,
      content: institution_news.content,
      image_url: institution_news.image_url,
      created_at: institution_news.created_at,
    })
    .from(institution_news)
    .where(
      and(eq(institution_news.institution_id, institutionId), eq(institution_news.is_active, true)),
    )
    .orderBy(desc(institution_news.show_on_homepage), desc(institution_news.created_at))
    .limit(1);
  return row ?? null;
});

/** All active news entries for the institution homepage, newest first. */
export const getPublicNewsEntries = cache(async (institutionId: number) => {
  return db
    .select({
      id: institution_news.id,
      title: institution_news.title,
      content: institution_news.content,
      image_url: institution_news.image_url,
      created_at: institution_news.created_at,
      show_on_homepage: institution_news.show_on_homepage,
    })
    .from(institution_news)
    .where(
      and(eq(institution_news.institution_id, institutionId), eq(institution_news.is_active, true)),
    )
    .orderBy(desc(institution_news.created_at));
});
