"use client";

import { ArrowLeft, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Link } from "@/components/ui/link";
import { SpeciesImageLightbox } from "@/components/public/species/species-image-lightbox";
import { useInstitution } from "@/hooks/use-institution";
import { ROUTES } from "@/lib/routes";

/** Title block for a single guide, with a link back to the guide index. */
export function GuideHeader({ title, lead }: { title: string; lead: string }) {
  const { slug } = useInstitution();

  return (
    <div className="space-y-3">
      <Link
        href={ROUTES.tenant.guides(slug)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm text-sm focus-visible:ring-2 focus-visible:outline-none"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All guides
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{lead}</p>
    </div>
  );
}

/** Ordered list of steps. Numbering comes from the native `<ol>` marker. */
export function GuideSteps({ children }: { children: React.ReactNode }) {
  return (
    <ol className="marker:text-muted-foreground list-decimal space-y-10 pl-6 marker:font-semibold">
      {children}
    </ol>
  );
}

export function GuideStep({
  title,
  adminOnly,
  shot,
  children,
}: {
  title: string;
  adminOnly?: boolean;
  shot?: GuideShotProps;
  children: React.ReactNode;
}) {
  return (
    <li className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {adminOnly && <Badge variant="secondary">Admin only</Badge>}
      </div>
      <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">{children}</div>
      {shot && <GuideShot {...shot} />}
    </li>
  );
}

/**
 * Static callout for something easy to get wrong. Deliberately not `ui/alert`,
 * which carries `role="alert"` — these are read in page order, not announced.
 */
export function GuideNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-muted/50 text-foreground flex gap-2.5 rounded-md border p-3 text-sm">
      <Info className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export interface GuideShotProps {
  /** Annotated screenshot under `public/docs/guides/` or `public/docs/field-guide/`. */
  src: string;
  /** Describes what the screenshot shows, for screen readers and the lightbox caption. */
  alt: string;
  /** Visible caption. Repeat any text baked into the annotations here. */
  caption: string;
}

/**
 * Annotated screenshot with click-to-enlarge. Annotation labels are baked into the
 * image, so they are invisible to screen readers — the caption must repeat them.
 */
export function GuideShot({ src, alt, caption }: GuideShotProps) {
  return (
    <figure className="space-y-2">
      <SpeciesImageLightbox
        commonName={caption}
        images={[{ id: 0, label: alt, thumb: src, card: src, full: src }]}
      >
        {(openAt) => (
          <button
            type="button"
            onClick={() => openAt(0)}
            aria-label={`${alt} — enlarge`}
            className="focus-visible:ring-ring block w-full cursor-zoom-in overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
          >
            {/* Plain img: documentation stills of unknown intrinsic size, and the
                lightbox already handles the full-size render. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} loading="lazy" className="bg-muted w-full" />
          </button>
        )}
      </SpeciesImageLightbox>
      <figcaption className="text-muted-foreground text-xs">{caption}</figcaption>
    </figure>
  );
}
