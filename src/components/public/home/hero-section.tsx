import Image from "next/image";
import { LiveStats } from "@/components/public/home/live-stats";
import { readableAccentOnDark } from "@/lib/theme-color";

interface HeroSectionProps {
  mainHeader: string | null;
  description: string | null;
  facility_image_url: string | null;
  totalButterflies: number;
  totalSpecies: number;
  primaryColor?: string;
}

/** Split a heading so the final word can carry the institution's accent color. */
function splitAccent(heading: string): [string, string] {
  const trimmed = heading.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) return ["", trimmed];
  return [trimmed.slice(0, lastSpace + 1), trimmed.slice(lastSpace + 1)];
}

export function HeroSection({
  mainHeader,
  description,
  facility_image_url,
  totalButterflies,
  totalSpecies,
  primaryColor = "#a78bfa",
}: HeroSectionProps) {
  const [headingLead, headingAccent] = mainHeader
    ? splitAccent(mainHeader)
    : ["A World of ", "Natural Wonder."];
  // A one-word header has no plain white lead to fall back on, so the accent
  // has to carry the whole heading over the dark hero on its own.
  const accentColor = readableAccentOnDark(primaryColor);

  return (
    <section aria-labelledby="hero-heading" className="relative w-full">
      {/* Full-width background image */}
      <div className="relative min-h-[420px] w-full sm:min-h-[460px] lg:min-h-[500px]">
        {facility_image_url ? (
          <Image
            src={facility_image_url}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            priority
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-emerald-950 via-teal-900 to-green-950">
            {/* Butterfly SVG decorations */}
            <svg
              viewBox="0 0 100 80"
              className="absolute top-6 left-8 w-20 rotate-12 text-white/10"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M50 40 C30 10, 5 10, 5 35 C5 55, 30 65, 50 40Z" />
              <path d="M50 40 C70 10, 95 10, 95 35 C95 55, 70 65, 50 40Z" />
              <path d="M50 40 C35 50, 15 70, 25 75 C35 80, 45 60, 50 40Z" />
              <path d="M50 40 C65 50, 85 70, 75 75 C65 80, 55 60, 50 40Z" />
            </svg>
            <svg
              viewBox="0 0 100 80"
              className="absolute top-1/3 right-16 w-32 -rotate-6 text-white/[0.07]"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M50 40 C30 10, 5 10, 5 35 C5 55, 30 65, 50 40Z" />
              <path d="M50 40 C70 10, 95 10, 95 35 C95 55, 70 65, 50 40Z" />
              <path d="M50 40 C35 50, 15 70, 25 75 C35 80, 45 60, 50 40Z" />
              <path d="M50 40 C65 50, 85 70, 75 75 C65 80, 55 60, 50 40Z" />
            </svg>
            <svg
              viewBox="0 0 100 80"
              className="absolute bottom-10 left-1/3 w-16 rotate-45 text-white/10"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M50 40 C30 10, 5 10, 5 35 C5 55, 30 65, 50 40Z" />
              <path d="M50 40 C70 10, 95 10, 95 35 C95 55, 70 65, 50 40Z" />
              <path d="M50 40 C35 50, 15 70, 25 75 C35 80, 45 60, 50 40Z" />
              <path d="M50 40 C65 50, 85 70, 75 75 C65 80, 55 60, 50 40Z" />
            </svg>
            <svg
              viewBox="0 0 100 80"
              className="absolute right-8 -bottom-2 w-28 -rotate-12 text-white/[0.06]"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M50 40 C30 10, 5 10, 5 35 C5 55, 30 65, 50 40Z" />
              <path d="M50 40 C70 10, 95 10, 95 35 C95 55, 70 65, 50 40Z" />
              <path d="M50 40 C35 50, 15 70, 25 75 C35 80, 45 60, 50 40Z" />
              <path d="M50 40 C65 50, 85 70, 75 75 C65 80, 55 60, 50 40Z" />
            </svg>
          </div>
        )}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/50 to-black/30" />

        {/* Text overlay — bottom left */}
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-12">
          <h1
            id="hero-heading"
            className="max-w-lg text-3xl leading-tight font-bold text-white sm:text-4xl lg:text-6xl"
          >
            {headingLead}
            <span className="font-bold italic" style={{ color: accentColor }}>
              {headingAccent}
            </span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
            {description ??
              "Explore the delicate beauty of over 45 tropical species in our climate-controlled sanctuary."}
          </p>
        </div>
      </div>

      {/* Live Stats — overlaps bottom of hero, right-aligned on desktop */}
      <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
        <div className="w-full pt-4 lg:-mt-16 lg:w-auto lg:pt-0">
          <LiveStats
            totalButterflies={totalButterflies}
            totalSpecies={totalSpecies}
            primaryColor={primaryColor}
          />
        </div>
      </div>
    </section>
  );
}
