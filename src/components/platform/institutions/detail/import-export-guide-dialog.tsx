"use client";

import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * In-app Import & Export guide content (Phase 5B) — explains the historical shipment import
 * contract in plain language for institution staff. Deliberately avoids implementation terms
 * (Zod, Drizzle, advisory locks, raw-text hashes) — those are correct but meaningless to the
 * audience this guide is for. Kept as plain data (not JSX) so a test can check its content stays
 * consistent with the actual validation rules without needing to render the dialog.
 */
export const IMPORT_EXPORT_GUIDE_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "Required columns",
    body:
      "Your file must have exactly these 13 columns, in this order: Species, Common name, No. rec, " +
      "Supplier, Ship date, Arrival date, Emerg. in transit, Damag in transit, No. disea, No. " +
      "parasit, No emerg, Poor emerg, and Released. Column names must match exactly " +
      "(capitalization and spacing don't matter, but nothing may be missing, duplicated, renamed, " +
      'or extra). Use the "Download Blank Template" button to start from a file with exactly ' +
      "these headers already in place.",
  },
  {
    heading: "Required values",
    body:
      "Species, Supplier, Ship date, Arrival date, and No. rec must be filled in on every row — a " +
      "blank cell in any of these is a blocking error. Arrival date must be on or after Ship date. " +
      "Common name may be left blank.",
  },
  {
    heading: "Released: blank vs. zero",
    body:
      "Released means butterflies actually released from this shipment. Leave the Released cell " +
      'blank when that number was never recorded historically — this imports as "unknown," not ' +
      "zero. Enter 0 only when you know for certain that zero were released; that is kept as a " +
      "real, tracked zero, not treated the same as blank. A row with a known (non-blank) Released " +
      "value can still show Remaining greater than zero if not everything received was released — " +
      "that's expected for tracked rows.",
  },
  {
    heading: "The six loss columns and accounting limits",
    body:
      "Emerg. in transit, Damag in transit, No. disea, No. parasit, No emerg, and Poor emerg may be " +
      "left blank (treated as 0). Their total can never exceed No. rec for that row, and — when " +
      "Released is filled in — Released plus the loss total can never exceed No. rec either. A row " +
      "that violates either limit is a blocking error.",
  },
  {
    heading: "Same species, same shipment, multiple rows",
    body:
      "If one shipment lists the same species on more than one row, those rows are combined into a " +
      "single line item. If every one of those rows has a known Released value, the values are " +
      "added together; if every row is blank, the combined value stays unknown. Mixing known and " +
      "blank Released values for the same species within one shipment is a blocking error — make " +
      "them all blank or all known before importing.",
  },
  {
    heading: "Existing shipments",
    body:
      "A shipment already on record (same supplier, ship date, and arrival date) is skipped by " +
      'default — it is never overwritten, and skipping it is not an error. The "Allow duplicates" ' +
      "setting changes this to create it again anyway, if you specifically need that.",
  },
  {
    heading: "New suppliers and species",
    body:
      "A supplier code not already on file is added automatically (marked inactive until " +
      "reviewed). A species not already in the shared catalog is only added automatically when " +
      '"Auto-create species" is turned on — available to platform superusers only. Institution ' +
      "staff importing their own data cannot add new species; an unrecognized species blocks the " +
      "import until it's corrected or added to the catalog separately.",
  },
  {
    heading: "Validation happens before anything imports",
    body:
      "The whole file is checked first. If anything in it has a blocking problem — anywhere in the " +
      "file, not just the part you're about to import — nothing can be imported until it's fixed. " +
      "Download the validation report (CSV) to see every issue with its row, the problem, and a " +
      "suggested fix.",
  },
  {
    heading: "Importing year by year",
    body:
      "Shipments are grouped by Arrival year and imported one year at a time, in chronological " +
      "order. Each year either fully completes or fully fails — there is no partially-imported " +
      "year. If a year fails, every year that already finished stays imported exactly as it was; " +
      "later years are not attempted. This does not run in the background — closing or refreshing " +
      "the page stops the sequence where it is. To finish or retry, re-validate the file and " +
      "import again: years already on record are detected and skipped automatically, so " +
      "re-running is safe and will not create duplicates. If your connection drops partway " +
      "through a year, that year may or may not have finished on the server — re-validating and " +
      "retrying is always the right next step either way.",
  },
  {
    heading: "Report, template, and export",
    body:
      '"Download Validation Report" gives a CSV of every issue found, even when the whole file is ' +
      'blocked. "Download Blank Template" gives an empty file with the correct headers already in ' +
      'place. "Export" downloads your institution\'s current shipment data (optionally limited to ' +
      "a date range) as an Excel file in the same 13-column format, so it can be reviewed or " +
      "re-imported elsewhere later.",
  },
];

export default function ImportExportGuideDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs">
          <HelpCircle className="size-3.5" aria-hidden="true" />
          Import &amp; Export Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import &amp; Export Guide</DialogTitle>
          <DialogDescription>
            How historical shipment import and export work, and what to check before importing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 text-sm">
          {IMPORT_EXPORT_GUIDE_SECTIONS.map(({ heading, body }) => (
            <section key={heading} className="space-y-1.5">
              <h3 className="font-medium">{heading}</h3>
              <p className="text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
