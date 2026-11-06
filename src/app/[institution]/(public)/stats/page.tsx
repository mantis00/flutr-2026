import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getPublicInstitution } from "@/lib/queries/institution";
import { getStatsData, transformStatsData } from "@/lib/queries/stats";
import { getButterflyOfTheDay } from "@/lib/services/butterfly-of-the-day";
import { attachImages } from "@/lib/wingspan/client";
import { StatsHeader } from "@/components/shared/stats/stats-header";
import { StatsOverviewCards } from "@/components/shared/stats/stats-overview-cards";
import { StatsHighlightCards } from "@/components/shared/stats/stats-highlight-cards";
import { SpeciesBreakdownChart } from "@/components/shared/stats/species-breakdown-chart";
import { FamilyDistributionChart } from "@/components/shared/stats/family-distribution-chart";
import { RegionDistributionPanel } from "@/components/shared/stats/region-distribution-panel";
import { FeaturedButterfly } from "@/components/public/home/featured-butterfly";

export const dynamic = "force-dynamic";

interface StatsPageProps {
  params: Promise<{ institution: string }>;
}

export async function generateMetadata({ params }: StatsPageProps): Promise<Metadata> {
  const { institution: slug } = await params;
  const inst = await getPublicInstitution(slug);
  return {
    title: inst ? `Live Statistics — ${inst.name}` : "Live Statistics",
  };
}

export default async function StatsPage({ params }: StatsPageProps) {
  const { institution: slug } = await params;

  const inst = await getPublicInstitution(slug);
  if (!inst) notFound();

  const [rows, featured] = await Promise.all([
    getStatsData(inst.id).then(attachImages),
    getButterflyOfTheDay(inst.id),
  ]);
  const stats = transformStatsData(rows);
  const dailyHighlight = featured
    ? {
        name: featured.common_name,
        quantity: Number(featured.in_flight_count),
        scientific_name: featured.scientific_name,
        family: featured.family,
        range: featured.range,
        images: featured.images,
      }
    : null;

  if (stats.totalButterflies === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <StatsHeader />
        <div className="bg-card rounded-2xl border px-6 py-12 text-center shadow-sm">
          <p className="text-muted-foreground text-lg">
            No butterflies are currently in flight. Check back soon!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl min-w-0 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <StatsHeader />

      {featured && (
        <div className="mb-6">
          <FeaturedButterfly
            slug={slug}
            scientific_name={featured.scientific_name}
            common_name={featured.common_name}
            image={featured.images[0] ?? null}
            range={featured.range}
            lifespan_days={featured.lifespan_days}
            host_plant={featured.host_plant}
            in_flight_count={Number(featured.in_flight_count)}
          />
        </div>
      )}

      {/*
        Mobile: stats, species, treemap, distro, geo (single column, ordered)
        Desktop: two-column masonry (left: stats + treemap, right: species + distro)
      */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2">
        <div className="order-1 lg:order-0 lg:row-span-1">
          <StatsOverviewCards
            totalButterflies={stats.totalButterflies}
            totalSpecies={stats.totalSpecies}
            uniqueFamilies={stats.uniqueFamilies}
            averageLifespan={stats.averageLifespan}
          />
        </div>

        {stats.speciesBreakdown.length > 0 && (
          <div className="order-2 lg:order-0 lg:row-span-2">
            <div className="space-y-4">
              {stats.speciesBreakdown.length > 0 && dailyHighlight && (
                <StatsHighlightCards
                  slug={slug}
                  mostCommon={stats.speciesBreakdown[0]}
                  mostRare={stats.speciesBreakdown[stats.speciesBreakdown.length - 1]}
                  daily={dailyHighlight}
                />
              )}
              <FamilyDistributionChart data={stats.familyDistribution} />
            </div>
          </div>
        )}

        <div className="order-3 lg:order-0">
          <SpeciesBreakdownChart data={stats.speciesBreakdown} slug={slug} />
        </div>

        <div className="order-4 lg:order-0 lg:col-span-2">
          <RegionDistributionPanel
            data={stats.regionDistribution}
            speciesData={stats.speciesBreakdown}
            slug={slug}
          />
        </div>
      </div>
    </div>
  );
}
