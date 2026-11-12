import Image from "next/image";
import Link from "next/link";
import { Globe, Clock, Leaf, Activity, Wind } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SpeciesImage } from "@/lib/wingspan/images";

interface FeaturedButterflyProps {
  slug: string;
  scientific_name: string;
  common_name: string;
  image: SpeciesImage | null;
  range: string[];
  lifespan_days: number;
  host_plant: string | null;
  in_flight_count: number;
}

export function FeaturedButterfly({
  slug,
  scientific_name,
  common_name,
  image,
  range,
  lifespan_days,
  host_plant,
  in_flight_count,
}: FeaturedButterflyProps) {
  return (
    <section aria-labelledby="featured-heading">
      <h2 id="featured-heading" className="mb-4 text-lg font-bold">
        Butterfly of the Day
      </h2>

      <Card className="gap-0 overflow-hidden py-0 lg:flex lg:flex-row">
        {/* Image — fills card height on desktop */}
        {image ? (
          <div className="relative aspect-4/3 lg:aspect-auto lg:w-2/5 lg:shrink-0">
            <Image
              src={image.card}
              alt={`${common_name} (${scientific_name})`}
              fill
              sizes="(min-width: 1024px) 40%, 100vw"
              // ponytail: temporary — optimizer off while Vercel transformations are capped
              unoptimized
              className="object-cover"
            />
            {/* Scrim stays >=60% black behind the text: white on a pale photo is otherwise
                unreadable, and the institution supplies the image. */}
            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 to-black/60 p-4">
              <h3 className="text-lg font-bold text-white">{common_name}</h3>
              <p className="text-sm text-white/80 italic">{scientific_name}</p>
            </div>
          </div>
        ) : (
          <CardContent>
            <h3 className="text-lg font-bold">{common_name}</h3>
            <p className="text-muted-foreground text-sm italic">{scientific_name}</p>
          </CardContent>
        )}

        {/* Content */}
        <div className="flex flex-1 flex-col py-6">
          <CardContent className="flex-1">
            <div className="grid grid-cols-2 gap-3">
              {/* Left column — 2 items */}
              <DetailItem
                icon={<Globe className="size-4" aria-hidden="true" />}
                label="Origin"
                value={range.length > 0 ? range[0] : "Unknown"}
              />
              {/* Right column — 3 items */}
              <div className="row-span-3 flex flex-col gap-3">
                <DetailItem
                  icon={<Clock className="size-4" aria-hidden="true" />}
                  label="Lifespan"
                  value={`${lifespan_days} Days`}
                />
                <DetailItem
                  icon={<Activity className="size-4" aria-hidden="true" />}
                  label="Status"
                  value={in_flight_count > 0 ? "Active Flight" : "In Collection"}
                />
                <DetailItem
                  icon={<Wind className="size-4" aria-hidden="true" />}
                  label="In Flight"
                  value={String(in_flight_count)}
                />
              </div>
              <HostPlantItem host_plant={host_plant} />
            </div>
          </CardContent>

          <CardFooter className="mt-auto pt-4">
            <Button asChild className="w-full">
              <Link href={`/${slug}/${encodeURIComponent(scientific_name)}`}>
                View Full Profile
              </Link>
            </Button>
          </CardFooter>
        </div>
      </Card>
    </section>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-muted-foreground text-xs tracking-wide uppercase">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

const MAX_VISIBLE_PLANTS = 2;

function HostPlantItem({ host_plant }: { host_plant: string | null }) {
  const plants = host_plant
    ? host_plant
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  const visible = plants.slice(0, MAX_VISIBLE_PLANTS);
  const remaining = plants.length - MAX_VISIBLE_PLANTS;

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">
        <Leaf className="size-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-muted-foreground text-xs tracking-wide uppercase">Host Plant</p>
        {plants.length === 0 ? (
          <p className="text-sm font-medium">Unknown</p>
        ) : (
          <p className="text-sm font-medium">
            {visible.join(", ")}
            {remaining > 0 && (
              <span className="text-muted-foreground ml-1 text-xs">+{remaining} more</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
