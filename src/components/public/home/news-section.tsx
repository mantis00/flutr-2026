"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface NewsSectionProps {
  title: string;
  content: string;
  image_url: string | null;
  created_at: Date;
}

export function NewsSection({ title, content, image_url, created_at }: NewsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const updateOverflow = () => {
      if (!expanded) {
        setHasOverflow(element.scrollHeight > element.clientHeight);
      }
    };

    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content, expanded]);

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
            ref={contentRef}
            id="news-content"
            className={`text-muted-foreground text-sm leading-relaxed ${expanded ? "" : "line-clamp-4"}`}
          >
            {content}
          </p>
          {hasOverflow && (
            <button
              type="button"
              aria-controls="news-content"
              aria-expanded={expanded}
              className="text-primary focus-visible:outline-ring mt-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
