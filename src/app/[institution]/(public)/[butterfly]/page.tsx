import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicInstitution } from "@/lib/queries/institution";
import { getSpeciesDetail } from "@/lib/queries/species-detail";
import { getSpeciesImages } from "@/lib/wingspan/client";
import { SpeciesHero } from "@/components/public/species/species-hero";
import { SpeciesStatsGrid } from "@/components/public/species/species-stats-grid";
import { SpeciesRangeBadges } from "@/components/public/species/species-range-badges";
import { SpeciesDescription } from "@/components/public/species/species-description";
import { SpeciesAccordionSections } from "@/components/public/species/species-accordion-sections";
import { FunFactsDisplay } from "@/components/public/species/fun-facts-display";
import { SpeciesImageGallery } from "@/components/public/species/species-image-gallery";

interface ButterflyPageProps {
  params: Promise<{ institution: string; butterfly: string }>;
}

/** Safely decode the URL param; returns null on malformed percent-encoding. */
function safeDecodeParam(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: ButterflyPageProps): Promise<Metadata> {
  const { institution: slug, butterfly } = await params;
  const scientificName = safeDecodeParam(butterfly);

  if (!scientificName) return { title: "Species Detail" };

  const inst = await getPublicInstitution(slug);
  if (!inst) return { title: "Species Detail" };

  const species = await getSpeciesDetail(inst.id, scientificName);

  return {
    title: species ? `${species.common_name} — ${inst.name}` : "Species Detail",
  };
}

export default async function ButterflyPage({ params }: ButterflyPageProps) {
  const { institution: slug, butterfly } = await params;
  const scientificName = safeDecodeParam(butterfly);

  if (!scientificName) notFound();

  const inst = await getPublicInstitution(slug);
  if (!inst) notFound();
  const species = await getSpeciesDetail(inst.id, scientificName);

  if (!species) {
    notFound();
  }

  const images = await getSpeciesImages(species.scientific_name, species.common_name);

  return (
    <article aria-labelledby="species-heading">
      <SpeciesHero
        slug={slug}
        commonName={species.common_name}
        scientificName={species.scientific_name}
        image={images[0] ?? null}
      />

      {/* Stats grid — overlaps bottom of hero, right-aligned on desktop */}
      <div className="mx-auto flex max-w-3xl justify-end px-4 sm:px-6 lg:px-8">
        <div className="-mt-8 w-full sm:-mt-10 lg:w-auto">
          <SpeciesStatsGrid
            lifespanDays={species.lifespan_days}
            inFlightCount={species.in_flight_count}
            family={species.family}
            subFamily={species.sub_family}
          />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Content sections (30-40% of width) */}
          <div className="space-y-8 lg:col-span-1">
            <SpeciesRangeBadges range={species.range} />

            <SpeciesDescription description={species.description} habitat={species.habitat} />

            <FunFactsDisplay funFacts={species.fun_facts} />

            <SpeciesAccordionSections hostPlant={species.host_plant} />
          </div>

          {/* Right Column: Gallery (60-70% of width) */}
          <div className="lg:col-span-2">
            <SpeciesImageGallery commonName={species.common_name} images={images} />
          </div>
        </div>
      </div>
    </article>
  );
}
