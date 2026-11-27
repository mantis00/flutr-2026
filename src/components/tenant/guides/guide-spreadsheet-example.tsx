import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type SpreadsheetCell = string | number | null;

export interface SpreadsheetExampleProps {
  /** "complete" = a reader could use this as a starting point. "excerpt" = illustrates one concept only. */
  kind: "complete" | "excerpt";
  /** Accessible label for the table itself, read by screen readers before its contents. */
  label: string;
  headers: readonly string[];
  /** `null` renders as a visible, explicit "(blank)" cell — never an empty cell with no signal. */
  rows: readonly (readonly SpreadsheetCell[])[];
  /** Visible explanation shown under the table, same role as `GuideShot`'s caption. */
  caption: React.ReactNode;
}

/**
 * Stands in for a screenshot of an Excel workbook: a real, semantic, responsive HTML table rather
 * than an image. Used for every spreadsheet example in the historical-import guide — both the
 * complete template example and the focused excerpts — so the structure is actually navigable and
 * resizable, not a flat image.
 *
 * Renders its own `<table>` (reusing `ui/table`'s row/cell/header pieces, but not the shared
 * `Table` wrapper) rather than nesting inside `ui/table`'s own `overflow-x-auto` div, which has no
 * `tabIndex` and so can't be reached by keyboard. The wrapping `div` here is the one real
 * horizontal-scroll container, and it is itself focusable with a descriptive `aria-label`, so a
 * keyboard-only reader can tab to it and scroll with arrow keys to reach any column the viewport
 * can't fit.
 */
export function SpreadsheetExample({
  kind,
  label,
  headers,
  rows,
  caption,
}: SpreadsheetExampleProps) {
  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {kind === "complete" ? "Complete example" : "Illustrative excerpt"}
        </Badge>
      </div>

      <p className="text-muted-foreground text-xs">
        This table scrolls horizontally if it doesn&apos;t fit your screen.
      </p>

      <div
        role="region"
        aria-label={`${label} (scroll to see more columns)`}
        tabIndex={0}
        className="focus-visible:ring-ring relative w-full overflow-x-auto rounded-md border focus-visible:ring-2 focus-visible:outline-none"
      >
        <table aria-label={label} className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              // Example data has no stable id of its own; row order is fixed and never reordered.
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>
                    {cell === null ? (
                      <span className="text-muted-foreground italic">(blank)</span>
                    ) : (
                      String(cell)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </table>
      </div>

      <figcaption className="text-muted-foreground text-xs">{caption}</figcaption>
    </figure>
  );
}
