"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PREVIEW_LENGTH = 280;

export interface PublicNewsEntry {
  id: number;
  title: string;
  content: string;
  image_url: string | null;
  created_at: Date;
  show_on_homepage: boolean;
}

export function getPreview(content: string) {
  if (content.length <= PREVIEW_LENGTH) return content;

  const lastSpace = content.lastIndexOf(" ", PREVIEW_LENGTH);
  const end = lastSpace > 0 ? lastSpace : PREVIEW_LENGTH;
  return `${content.slice(0, end).trimEnd()}...`;
}

export function getHomepageNewsEntry(entries: readonly PublicNewsEntry[]) {
  return entries.find((entry) => entry.show_on_homepage) ?? entries[0] ?? null;
}

function formatNewsDate(createdAt: Date) {
  return createdAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface NewsSectionProps {
  entries: PublicNewsEntry[];
}

export function NewsSection({ entries }: NewsSectionProps) {
  const homepageEntry = getHomepageNewsEntry(entries);
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const headingId = useId();
  if (!homepageEntry) return null;

  const dateStr = formatNewsDate(homepageEntry.created_at);

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-lg font-bold">
          {homepageEntry.title}
        </h2>
        {entries.length > 1 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto shrink-0 p-0"
                aria-label="View all active news entries"
              >
                View all
              </Button>
            </DialogTrigger>
            <DialogContent
              aria-describedby={undefined}
              className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
            >
              <DialogHeader>
                <DialogTitle>News</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                {entries.map((entry) => (
                  <article key={entry.id} className="space-y-3 border-b pb-6 last:border-b-0">
                    <div className="space-y-1">
                      <h3 className="font-semibold">{entry.title}</h3>
                      <time
                        dateTime={entry.created_at.toISOString()}
                        className="text-muted-foreground text-xs"
                      >
                        {formatNewsDate(entry.created_at)}
                      </time>
                    </div>
                    {entry.image_url && (
                      <div className="bg-muted relative aspect-video w-full overflow-hidden rounded-md">
                        <Image
                          src={entry.image_url}
                          alt=""
                          fill
                          sizes="(min-width: 640px) 42rem, 100vw"
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    )}
                    <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                      {entry.content}
                    </p>
                  </article>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <Card className="overflow-hidden py-0">
        {homepageEntry.image_url && (
          <div className="bg-muted relative aspect-[4/3] w-full">
            <Image
              src={homepageEntry.image_url}
              alt=""
              fill
              sizes="(min-width: 1024px) 40vw, (min-width: 768px) 80vw, 100vw"
              className="object-contain"
              unoptimized
            />
          </div>
        )}
        <CardHeader className="pt-6 pb-1">
          <time
            dateTime={homepageEntry.created_at.toISOString()}
            className="text-muted-foreground text-xs"
          >
            {dateStr}
          </time>
        </CardHeader>
        <CardContent className="pb-6">
          <p id={contentId} className="text-muted-foreground text-sm leading-relaxed">
            {isExpanded ? homepageEntry.content : getPreview(homepageEntry.content)}
          </p>
          {homepageEntry.content.length > PREVIEW_LENGTH && (
            <Button
              aria-controls={contentId}
              aria-expanded={isExpanded}
              className="mt-2 h-auto p-0"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              variant="link"
            >
              {isExpanded ? "Show less" : "Show more"}
            </Button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
