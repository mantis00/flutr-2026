"use client";

import { useId } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ReleaseQuantityControlsProps {
  value: number;
  cap: number;
  ariaLabel: string;
  onChange: (next: number) => void;
}

/**
 * Mouse/tap-friendly quantity controls used by the release composers.
 * Includes a Clear button, − / + steppers, a numeric input, and an
 * "All (N)" button that snaps to the per-row cap. Designed for one-handed
 * operation per the outline.
 */
export function ReleaseQuantityControls({
  value,
  cap,
  ariaLabel,
  onChange,
}: ReleaseQuantityControlsProps) {
  // Stable id for the visually-hidden cap hint so screen readers can announce
  // the per-row maximum alongside the input via aria-describedby.
  // useId() yields stable, hydration-safe ids across server and client.
  const hintId = useId();
  const clamp = (next: number) => {
    if (!Number.isFinite(next)) return 0;
    return Math.max(0, Math.min(cap, Math.floor(next)));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange(0)}
        aria-label={`Clear ${ariaLabel}`}
      >
        Clear
      </Button>
      <div className="inline-flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-10"
          onClick={() => onChange(clamp(value + 1))}
          aria-label={`Increase ${ariaLabel}`}
        >
          <Plus className="size-4" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={cap}
          step={1}
          value={value}
          aria-label={ariaLabel}
          aria-describedby={hintId}
          className={cn(
            "h-10 w-20 text-center text-base font-semibold",
            value > 0 && "border-primary",
          )}
          onChange={(event) => onChange(clamp(Number(event.target.value)))}
        />
        <span id={hintId} className="sr-only">
          Maximum {cap}.
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-10"
          onClick={() => onChange(clamp(value - 1))}
          aria-label={`Decrease ${ariaLabel}`}
        >
          <Minus className="size-4" />
        </Button>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onChange(cap)}
        aria-label={`Set ${ariaLabel} to maximum`}
      >
        All ({cap})
      </Button>
    </div>
  );
}
