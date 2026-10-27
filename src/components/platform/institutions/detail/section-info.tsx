"use client";

import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SpeciesImageLightbox } from "@/components/public/species/species-image-lightbox";

/** Section heading with an "i" button that opens an explanatory modal. */
export function SectionHeading({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-primary size-6 rounded-full"
            aria-label={`What does ${title} do?`}
          >
            <Info className="size-4" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 text-sm">{children}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** One explained use of a field: where it shows up, plus an annotated shot. */
export function InfoUse({
  heading,
  children,
  src,
  alt,
}: {
  heading: string;
  children: React.ReactNode;
  /** Annotated screenshot under `public/docs/field-guide/`. */
  src: string;
  alt: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">{heading}</p>
      <p className="text-muted-foreground">{children}</p>
      <SpeciesImageLightbox
        commonName={heading}
        // One still per use, so the lightbox renders it with `alt` as its caption.
        images={[{ id: 0, label: alt, thumb: src, card: src, full: src }]}
      >
        {(openAt) => (
          <button
            type="button"
            onClick={() => openAt(0)}
            aria-label={`${alt} — enlarge`}
            className="focus-visible:ring-ring block w-full cursor-zoom-in overflow-hidden rounded-md border focus-visible:ring-2 focus-visible:outline-none"
          >
            {/* Plain img: documentation stills of unknown intrinsic size, and
                next/image would buy nothing inside a dialog. The button's
                aria-label carries the description, so this is decorative. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" className="bg-muted w-full" />
          </button>
        )}
      </SpeciesImageLightbox>
    </div>
  );
}
