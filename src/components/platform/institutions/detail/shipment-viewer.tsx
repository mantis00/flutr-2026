"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import {
  extractYear,
  formatShipmentDate,
  type ShipmentSummaryRow,
} from "@/lib/shipment-import-utils";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShipmentViewerProps = {
  shipmentRows: ShipmentSummaryRow[] | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ShipmentViewer({
  shipmentRows,
  isLoading,
  error,
  onRefresh,
}: ShipmentViewerProps) {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  function toggleYear(year: number) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  }

  const groupedByYear = useMemo(() => {
    if (!shipmentRows || shipmentRows.length === 0) return [];
    const map = new Map<number, ShipmentSummaryRow[]>();
    for (const row of shipmentRows) {
      const year = extractYear(row.shipmentDate);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(row);
    }
    return Array.from(map.entries()).map(([year, rows]) => ({ year, rows }));
  }, [shipmentRows]);

  const totalShipments = shipmentRows?.length ?? 0;
  const totalYears = groupedByYear.length;

  return (
    <section aria-labelledby="shipment-viewer-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="shipment-viewer-heading" className="text-sm font-semibold">
            Existing Shipment Records
          </h2>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh shipment records"
            className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
        {shipmentRows !== null && !isLoading && (
          <div className="flex items-center gap-3">
            {groupedByYear.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (expandedYears.size === groupedByYear.length) {
                    setExpandedYears(new Set());
                  } else {
                    setExpandedYears(new Set(groupedByYear.map((g) => g.year)));
                  }
                }}
                className="text-muted-foreground text-xs underline-offset-2 hover:underline"
              >
                {expandedYears.size === groupedByYear.length ? "Collapse all" : "Expand all"}
              </button>
            )}
            <span className="text-muted-foreground text-xs" aria-live="polite">
              {totalShipments === 0
                ? "No records"
                : `${totalShipments.toLocaleString()} shipment${totalShipments !== 1 ? "s" : ""} across ${totalYears} year${totalYears !== 1 ? "s" : ""}`}
            </span>
          </div>
        )}
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-sm" role="status" aria-live="polite">
          Loading shipment records…
        </p>
      )}

      {!isLoading && error && (
        <div className="flex items-center gap-3">
          <p className="text-destructive text-sm" role="status" aria-live="polite">
            {error}
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="text-muted-foreground shrink-0 text-xs underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {!isLoading && shipmentRows !== null && shipmentRows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No shipment records found. Import historical data above to get started.
        </p>
      )}

      {!isLoading && groupedByYear.length > 0 && (
        <div className="divide-y overflow-x-auto rounded-md border">
          {groupedByYear.map(({ year, rows }) => {
            const isOpen = expandedYears.has(year);
            const panelId = `shipments-year-${year}`;
            return (
              <div key={year}>
                <button
                  type="button"
                  onClick={() => toggleYear(year)}
                  aria-expanded={isOpen}
                  // The panel only renders while open, so the reference would otherwise dangle.
                  aria-controls={isOpen ? panelId : undefined}
                  className="hover:bg-accent flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium"
                >
                  <span>
                    {year}{" "}
                    <span className="text-muted-foreground font-normal">
                      — {rows.length} shipment{rows.length !== 1 ? "s" : ""}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground size-3.5 shrink-0 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <div id={panelId} className="overflow-x-auto px-4 pb-3">
                    <table className="w-full text-sm" aria-label={`Shipments for ${year}`}>
                      <thead>
                        <tr className="border-b">
                          <th scope="col" className="pr-4 pb-2 text-left font-medium">
                            Supplier
                          </th>
                          <th scope="col" className="pr-4 pb-2 text-left font-medium">
                            Shipment Date
                          </th>
                          <th scope="col" className="pr-4 pb-2 text-left font-medium">
                            Arrival Date
                          </th>
                          <th scope="col" className="pr-4 pb-2 text-right font-medium">
                            Species count
                          </th>
                          <th scope="col" className="pb-2 text-right font-medium">
                            Total Received
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-mono text-xs">{row.supplierCode}</td>
                            <td className="py-2 pr-4">{formatShipmentDate(row.shipmentDate)}</td>
                            <td className="py-2 pr-4">{formatShipmentDate(row.arrivalDate)}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">{row.itemCount}</td>
                            <td className="py-2 text-right tabular-nums">
                              {row.totalReceived.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
