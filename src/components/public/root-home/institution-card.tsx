import Image from "next/image";
import Link from "next/link";
import { Bug, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface InstitutionCardProps {
  slug: string;
  name: string;
  city: string;
  state_province: string;
  country: string;
  facility_image_url: string | null;
  logo_url: string | null;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function InstitutionCard({
  slug,
  name,
  city,
  state_province,
  country,
  facility_image_url,
  logo_url,
}: InstitutionCardProps) {
  const initials = getInitials(name);

  return (
    <article>
      <Link
        href={`/${slug}`}
        className="group focus-visible:ring-ring block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Card className="gap-0 overflow-hidden py-0 transition-shadow group-hover:shadow-md">
          {/* Facility image or placeholder */}
          <div className="relative aspect-video overflow-hidden">
            {facility_image_url ? (
              <Image
                src={facility_image_url}
                alt={`${name} facility`}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform group-hover:scale-105"
                unoptimized
              />
            ) : (
              <div className="bg-muted flex size-full items-center justify-center">
                <Bug className="text-muted-foreground/30 size-12" aria-hidden="true" />
              </div>
            )}
          </div>

          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              {/* Logo or initials */}
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  logo_url ? "bg-background" : "bg-muted",
                )}
              >
                {logo_url ? (
                  <Image
                    src={logo_url}
                    alt=""
                    width={40}
                    height={40}
                    className="rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="text-muted-foreground text-xs font-semibold">{initials}</span>
                )}
              </div>

              <div className="min-w-0">
                <h3 className="truncate font-semibold">{name}</h3>
                <p className="text-muted-foreground flex items-center gap-1 text-sm">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {city}, {state_province}, {country}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </article>
  );
}
