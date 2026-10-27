import type { Metadata } from "next";

import { getPublicInstitution } from "@/lib/queries/institution";
import { attachImages } from "@/lib/wingspan/client";
import { getGalleryData, getGalleryGlobalSpecies } from "@/lib/queries/gallery";
import { GalleryHeader } from "@/components/public/gallery/gallery-header";
import { GalleryContent } from "@/components/public/gallery/gallery-content";

interface GalleryPageProps {
  params: Promise<{ institution: string }>;
}

export async function generateMetadata({ params }: GalleryPageProps): Promise<Metadata> {
  const { institution: slug } = await params;
  const inst = await getPublicInstitution(slug);
  return {
    title: inst ? `Species Gallery — ${inst.name}` : "Species Gallery",
  };
}

export default async function GalleryPage({ params }: GalleryPageProps) {
  const { institution: slug } = await params;

  const inst = (await getPublicInstitution(slug))!;

  const [{ species }, globalSpecies] = await Promise.all([
    getGalleryData(inst.id),
    getGalleryGlobalSpecies(inst.id),
  ]);

  const [speciesWithImages, globalWithImages] = await Promise.all([
    attachImages(species),
    attachImages(globalSpecies),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <GalleryHeader />
      <GalleryContent slug={slug} species={speciesWithImages} globalSpecies={globalWithImages} />
    </div>
  );
}
