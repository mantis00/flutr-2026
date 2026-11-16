"use client";

import { useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { Info, Maximize2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "@/components/ui/link";
import { splitName } from "@/lib/utils";
import { getChartColor } from "@/components/shared/stats/chart-colors";
import type { SpeciesBreakdownItem } from "@/lib/queries/stats";

interface SpeciesBreakdownChartProps {
  data: SpeciesBreakdownItem[];
  slug: string;
}

interface TreemapCellProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  name: string;
  quantity: number;
}

export function TreemapCell({ x, y, width, height, index, name, quantity }: TreemapCellProps) {
  const fill = getChartColor(index);
  const showLabel = width > 50 && height > 30;
  const showQuantity = width > 40 && height > 45;
  const clipId = `sm-clip-${index}`;
  const fontSize = Math.max(10, Math.min(14, width / 9));
  const maxChars = Math.max(3, Math.floor(width / 8));
  const canMultiline = height > 55;
  const lines = showLabel
    ? canMultiline
      ? splitName(name, maxChars)
      : [name.length > maxChars ? name.slice(0, maxChars - 1) + "…" : name]
    : [];
  const lineHeight = fontSize + 2;
  const totalTextHeight = lines.length * lineHeight + (showQuantity ? lineHeight : 0);
  const textStartY = y + height / 2 - totalTextHeight / 2 + fontSize / 2;

  const clipPadding = 4;
  const innerWidth = Math.max(0, width - clipPadding * 2);
  const innerHeight = Math.max(0, height - clipPadding * 2);

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={x + clipPadding} y={y + clipPadding} width={innerWidth} height={innerHeight} />
        </clipPath>
      </defs>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={fill}
        stroke="var(--background)"
        strokeWidth={2}
      />
      <g clipPath={`url(#${clipId})`}>
        {lines.map((line, i) => (
          <text
            key={i}
            x={x + width / 2}
            y={textStartY + i * lineHeight}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-white text-xs font-medium drop-shadow-sm"
            style={{ fontSize }}
          >
            {line}
          </text>
        ))}
        {showQuantity && (
          <text
            x={x + width / 2}
            y={textStartY + lines.length * lineHeight}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-white/80 text-[10px] drop-shadow-sm"
          >
            {quantity.toLocaleString()}
          </text>
        )}
      </g>
    </g>
  );
}

function TreemapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { name: string; quantity: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const { name, quantity } = payload[0].payload;
  return (
    <div className="border-border/50 bg-background rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">{quantity.toLocaleString()} in flight</p>
    </div>
  );
}

export function SpeciesBreakdownChart({ data, slug }: SpeciesBreakdownChartProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <section aria-labelledby="treemap-heading">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="treemap-heading" className="text-lg font-bold">
          Treemap
        </h2>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-full p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="What is a treemap?"
        >
          <Info className="size-4" />
        </button>
      </div>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>What is a treemap?</DialogTitle>
            <DialogDescription>
              A treemap shows all butterfly species currently in flight. Each rectangle represents a
              species — the bigger the rectangle, the more butterflies of that species are flying
              today. Tap any species to explore it in the interactive view.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Card className="min-w-0">
        <CardContent className="space-y-3 pt-4">
          <Link
            href={`/${slug}/stats/species`}
            aria-label="Species distribution by quantity in flight — open the interactive treemap"
            className="group focus-visible:ring-ring relative block h-[320px] w-full cursor-pointer overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2 sm:h-[400px]"
          >
            {/* The cell labels are the link's visible text, so an aria-label could never
                contain them (WCAG 2.5.3); the data itself lives on the linked page. */}
            <div aria-hidden="true" className="size-full">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={data}
                  dataKey="quantity"
                  nameKey="name"
                  content={
                    <TreemapCell x={0} y={0} width={0} height={0} index={0} name="" quantity={0} />
                  }
                  isAnimationActive={false}
                >
                  <Tooltip content={<TreemapTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </Link>
          <Link
            href={`/${slug}/stats/species`}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <Maximize2 className="size-4" aria-hidden="true" />
            Explore interactive view
          </Link>
        </CardContent>
      </Card>
    </section>
  );
}
