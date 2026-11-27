import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicInstitution } from "@/lib/queries/institution";
import { getStatsData, transformStatsData } from "@/lib/queries/stats";
import { attachImages } from "@/lib/wingspan/client";
import { FullscreenTreemap } from "@/components/shared/stats/fullscreen-treemap";

export const dynamic = "force-dynamic";

interface SpeciesTreemapPageProps {
  params: Promise<{ institution: string }>;
}

export async function generateMetadata({ params }: SpeciesTreemapPageProps): Promise<Metadata> {
  const { institution: slug } = await params;
  const inst = await getPublicInstitution(slug);
  return {
    title: inst ? `Species in Flight — ${inst.name}` : "Species in Flight",
  };
}

export default async function SpeciesTreemapPage({ params }: SpeciesTreemapPageProps) {
  const { institution: slug } = await params;

  const inst = await getPublicInstitution(slug);
  if (!inst) notFound();

  const rows = await attachImages(await getStatsData(inst.id));
  const stats = transformStatsData(rows);

  if (stats.speciesBreakdown.length === 0) notFound();

  return <FullscreenTreemap data={stats.speciesBreakdown} slug={slug} />;
}
