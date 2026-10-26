"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PREVIEW_LENGTH = 280;

function getPreview(content: string) {
  if (content.length <= PREVIEW_LENGTH) return content;

  const lastSpace = content.lastIndexOf(" ", PREVIEW_LENGTH);
  const end = lastSpace > 0 ? lastSpace : PREVIEW_LENGTH;
  return `${content.slice(0, end).trimEnd()}...`;
}

interface NewsSectionProps {
  title: string;
  content: string;
  image_url: string | null;
  created_at: Date;
}

export function NewsSection({ title, content, image_url, created_at }: NewsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const dateStr = created_at.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <section aria-labelledby="news-heading">
      <h2 id="news-heading" className="mb-4 text-lg font-bold">
        {title}
      </h2>
      <Card className="overflow-hidden py-0">
        {image_url && (
          <div className="bg-muted relative aspect-[4/3] w-full">
            <Image
              src={image_url}
              alt=""
              fill
              sizes="(min-width: 1024px) 40vw, (min-width: 768px) 80vw, 100vw"
              className="object-contain"
              unoptimized
            />
          </div>
        )}
        <CardHeader className="pt-6 pb-1">
          <time dateTime={created_at.toISOString()} className="text-muted-foreground text-xs">
            {dateStr}
          </time>
        </CardHeader>
        <CardContent className="pb-6">
          <p
            id={contentId}
            aria-live="polite"
            className="text-muted-foreground text-sm leading-relaxed"
          >
            {isExpanded ? content : getPreview(content)}
          </p>
          {content.length > PREVIEW_LENGTH && (
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
