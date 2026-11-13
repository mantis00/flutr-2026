import {
  GuideHeader,
  GuideNote,
  GuideShot,
  GuideStep,
  GuideSteps,
} from "@/components/tenant/guides/guide-step";
import { SpreadsheetExample } from "@/components/tenant/guides/guide-spreadsheet-example";
import { canReadGuides } from "@/lib/guides-access";

export default async function ImportGuidePage({
  params,
}: {
  params: Promise<{ institution: string }>;
}) {
  const { institution } = await params;
  if (!(await canReadGuides(institution))) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <GuideHeader
        title="Importing historical data"
        lead="Bringing shipment records from before Flutr into your institution's history."
      />

      <GuideSteps>
        <GuideStep title="Open the Data tab" adminOnly>
          <p>
            Click <strong>Organization</strong> in the sidebar, then the <strong>Data</strong> tab.
            Importing and exporting historical records is an Admin-only capability — Employees
            don&apos;t see this tab at all.
          </p>
          <GuideNote>
            <p>
              Platform superusers have a similar import/export capability in the platform admin
              panel. The overall workflow matches what&apos;s described in this guide, with a few
              additional platform-only options — including the ability to auto-create a brand-new
              species during import, which institution staff cannot do. This guide focuses on the
              institution Admin workflow and doesn&apos;t walk through those extra options
              separately.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep title="Prepare your spreadsheet">
          <p>
            Your file needs exactly these 13 columns: <strong>Species</strong>,{" "}
            <strong>Common name</strong>, <strong>No. rec</strong>, <strong>Supplier</strong>,{" "}
            <strong>Ship date</strong>, <strong>Arrival date</strong>,{" "}
            <strong>Emerg. in transit</strong>, <strong>Damag in transit</strong>,{" "}
            <strong>No. disea</strong>, <strong>No. parasit</strong>, <strong>No emerg</strong>,{" "}
            <strong>Poor emerg</strong>, and <strong>Released</strong>. Column names must match
            exactly — capitalization and spacing don&apos;t matter, but nothing may be missing,
            duplicated, renamed, or added. They don&apos;t need to be in any particular order: Flutr
            recognizes each column by its name, not its position. The easiest way to start is the{" "}
            <strong>Download Blank Template</strong> button on the Data tab, which gives you a file
            with these headers already in place, in the order shown below.
          </p>
          <SpreadsheetExample
            kind="complete"
            label="Example shipment import workbook"
            headers={[
              "Species",
              "Common name",
              "No. rec",
              "Supplier",
              "Ship date",
              "Arrival date",
              "Emerg. in transit",
              "Damag in transit",
              "No. disea",
              "No. parasit",
              "No emerg",
              "Poor emerg",
              "Released",
            ]}
            rows={[
              [
                "Morpho peleides",
                "Blue Morpho",
                50,
                "EBN",
                "2025-03-01",
                "2025-03-04",
                1,
                0,
                0,
                0,
                2,
                1,
                40,
              ],
              [
                "Idea leuconoe",
                "Paper Kite",
                30,
                "EBN",
                "2025-03-01",
                "2025-03-04",
                0,
                1,
                0,
                0,
                0,
                0,
                null,
              ],
              ["Dryas iulia", "Julia", 25, "LPS", "2025-03-10", "2025-03-13", 0, 0, 1, 0, 1, 0, 0],
            ]}
            caption={
              <>
                A complete, import-ready example (synthetic data), shown in the blank
                template&apos;s recommended column order — the 13 required columns can appear in any
                order, but this is the easiest one to start from. Row 1 shows a typical mix of
                losses with a known Released count. Row 2 leaves Released <strong>blank</strong> —
                historically unknown, not zero. Row 3 shows Released as a confirmed{" "}
                <strong>0</strong>. See the next step for why that distinction matters.
              </>
            }
          />
          <GuideShot
            src="/docs/guides/import-xlsx-example.webp"
            alt="The same three example rows open in a real spreadsheet application, showing all 13 columns across one header row and three data rows"
            caption="The same example (synthetic data) opened as a real .xlsx file — this is what Download Blank Template gives you once filled in, not an illustration."
          />
          <GuideNote>
            <p>
              Species and suppliers are shared across every institution. A supplier not already on
              file is added automatically (inactive, until reviewed) — but an unrecognized species
              blocks the import. If a species you need isn&apos;t in the catalog, ask a Flutr
              platform superuser to add it before importing.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep title="Understand Released: blank vs. zero">
          <p>
            <strong>Released</strong> means butterflies actually released from this shipment. Leave
            the cell <strong>blank</strong> when that number was never recorded historically — it
            imports as &ldquo;unknown,&rdquo; not zero. Enter <strong>0</strong> only when you know
            for certain that none were released; that is kept as a real, tracked zero, and is never
            treated the same as blank.
          </p>
          <SpreadsheetExample
            kind="excerpt"
            label="Released column shown as blank, zero, and a positive count"
            headers={["Species", "No. rec", "Released", "What this means"]}
            rows={[
              ["Morpho peleides", 50, null, "Never recorded historically — imports as unknown"],
              ["Morpho peleides", 50, 0, "Confirmed: zero were released"],
              ["Morpho peleides", 50, 40, "40 confirmed released"],
            ]}
            caption={
              <>
                Three illustrative variations of one row (synthetic data) — not three rows from the
                same real shipment. Blank and 0 both mean something specific, and importing the
                wrong one changes what Flutr believes happened historically.
              </>
            }
          />
        </GuideStep>

        <GuideStep title="Upload or paste your data">
          <p>
            Go back to the Data tab and either drag your file onto the drop zone or click to select
            it, or choose <strong>paste text instead</strong> if you don&apos;t have a file handy.
            Flutr accepts <strong>.xlsx</strong>, .xls, .csv, .tsv, and .txt — this guide focuses on
            Excel (.xlsx), since that&apos;s the primary, most reliable workflow and what the blank
            template downloads as.
          </p>
        </GuideStep>

        <GuideStep title="Review validation before importing anything">
          <p>
            After uploading, Flutr checks the whole file before anything imports — every row, not
            just the part you&apos;re looking at — and lists every problem it finds in that pass
            together, with a downloadable validation report (CSV) showing each row, the problem, and
            a suggested fix. Fix everything listed and validate again; if a row had more than one
            problem, or the header row itself needed fixing first, a later pass can turn up
            something that an earlier pass couldn&apos;t see yet. Keep validating until the preview
            comes back clean — that&apos;s the normal way to work through a file, not a sign
            something is wrong.
          </p>
          <GuideNote>
            <p>Three of the most common blocking problems:</p>
          </GuideNote>
          <div className="space-y-2">
            <h3 className="text-foreground text-sm font-semibold">Unknown species</h3>
            <SpreadsheetExample
              kind="excerpt"
              label="Example row with an unrecognized species name"
              headers={["Species", "Common name", "No. rec", "Supplier", "...", "Released"]}
              rows={[["Danaus plexipus", "Monarch", 40, "EBN", "...", 0]]}
              caption={
                <>
                  &ldquo;Danaus plexipus&rdquo; is misspelled — the catalog has &ldquo;Danaus
                  plexippus.&rdquo; Matching is exact, so this row is rejected rather than guessed
                  at or created automatically. Ask a platform superuser to add a species if it
                  genuinely isn&apos;t in the catalog yet.
                </>
              }
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-foreground text-sm font-semibold">Incorrect column header</h3>
            <SpreadsheetExample
              kind="excerpt"
              label="Example header row with incorrect column names"
              headers={["Species", "Common Name", "Qty Received", "Supplier", "..."]}
              rows={[]}
              caption={
                <>
                  &ldquo;Common Name&rdquo; and &ldquo;Qty Received&rdquo; don&apos;t match the
                  required &ldquo;Common name&rdquo; / &ldquo;No. rec&rdquo; exactly. Capitalization
                  and spacing are forgiving, and column order doesn&apos;t matter, but every column
                  must exist with the right name — this file is rejected before any row is even
                  checked, so fixing the header is always the first step.
                </>
              }
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-foreground text-sm font-semibold">Released exceeds received</h3>
            <SpreadsheetExample
              kind="excerpt"
              label="Example row where Released plus losses exceeds the received count"
              headers={["Species", "No. rec", "Damag in transit", "No. disea", "Released"]}
              rows={[["Idea leuconoe", 20, 5, 5, 15]]}
              caption={
                <>
                  5 + 5 + 15 = 25, more than the 20 received. Released plus every loss column can
                  never exceed No. rec — this row is a blocking error.
                </>
              }
            />
          </div>
          <GuideNote>
            <p>
              Unknown suppliers are handled differently from unknown species: an otherwise valid,
              unrecognized supplier doesn&apos;t block validation. Flutr creates the supplier
              automatically, marked inactive until someone reviews it.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep title="Import year by year">
          <p>
            Once there are zero row errors, <strong>Commit Import</strong> becomes available.
            Shipments are grouped by arrival year and imported one year at a time, in chronological
            order — each year either fully completes or fully fails.
          </p>
          <GuideNote>
            <p>
              <strong>Keep this browser tab open until the import finishes.</strong> The import
              doesn&apos;t run in the background, so closing or refreshing the page stops it. If a
              year fails partway through, every year that already completed successfully stays saved
              — nothing already imported is undone, but no later year proceeds until you fix the
              problem and try again.
            </p>
            <p>
              Re-running the same file is safe as long as the <strong>Duplicate headers</strong>{" "}
              setting on the Data tab is left on its default, <strong>Skip duplicates</strong>: a
              shipment Flutr already has on record (matched by Supplier, Ship date, and Arrival date
              together) is skipped automatically — never duplicated, and never overwritten or merged
              with new data. If you fixed a mistake and re-import the same file with that default
              setting, the shipments that already succeeded are skipped and only the rest are added.
              Switching that setting to <strong>Allow duplicates</strong> turns this protection off:
              re-importing a file you&apos;ve already imported will create duplicate shipments with
              matching Supplier and dates, so only use it when you specifically need a shipment
              created again.
            </p>
          </GuideNote>
        </GuideStep>

        <GuideStep title="Export your institution's records">
          <p>
            The <strong>Export</strong> section on the same Data tab produces an{" "}
            <strong>.xlsx</strong> file of your institution&apos;s shipment records, optionally
            limited to a date range. It uses the same 13 columns as import, in the same order, so an
            exported file can be re-imported elsewhere without edits.
          </p>
        </GuideStep>
      </GuideSteps>

      <GuideNote>
        <p>
          Still stuck? Email Nathan at{" "}
          <a className="text-primary underline" href="mailto:mantisnb@iastate.edu">
            mantisnb@iastate.edu
          </a>
          .
        </p>
      </GuideNote>
    </div>
  );
}
