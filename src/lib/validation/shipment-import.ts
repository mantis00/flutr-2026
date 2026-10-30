import { z } from "zod";

export const importSourceSchema = z
  .object({
    kind: z.enum(["xlsx", "xls", "csv", "tsv", "txt", "paste"]),
    file_name: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export const shipmentImportPreviewRequestSchema = z
  .object({
    raw_text: z.string().min(1).max(2_000_000),
    source: importSourceSchema,
    /** The caller's actual intent for this validation pass — not a role-eligibility flag. Omitted
     * (or a tenant request, which force-disables this server-side regardless of what's sent)
     * defaults to `false`, matching commit's own conservative default
     * (`options?.allow_species_autocreate ?? false`), so a preview with this field omitted never
     * disagrees with a commit that also omits it. */
    allow_species_autocreate: z.boolean().optional(),
  })
  .strict();

/**
 * Mirrors `ShipmentImportIssue` from `shipment-import-parser.ts` — structured validation
 * problems, suitable for a future downloadable report, distinct from the derived flat
 * `row_errors` strings kept below for backward compatibility with the existing UI.
 */
export const shipmentImportIssueSchema = z
  .object({
    rowNumber: z.number().int().positive().nullable(),
    rowNumbers: z.array(z.number().int().positive()).optional(),
    field: z.string().nullable(),
    value: z.string().nullable(),
    message: z.string().min(1),
  })
  .strict();

export const shipmentImportPreviewResponseSchema = z
  .object({
    summary: z
      .object({
        total_rows: z.number().int().min(0),
        shipments_detected: z.number().int().min(0),
        row_errors: z.number().int().min(0),
        warnings: z.number().int().min(0),
        unknown_species: z.number().int().min(0),
        unknown_suppliers: z.number().int().min(0),
      })
      .strict(),
    row_errors: z.array(z.string().min(1)),
    warnings: z.array(z.string().min(1)),
    unknown_species: z.array(z.string().min(1)),
    unknown_suppliers: z.array(z.string().min(1)),
    /** Structured validation problems (headers, rows, duplicate-species groups, and — for a
     * tenant request, where species auto-create can never legally happen — unresolved species).
     * `row_errors` above is `issues.map(formatShipmentImportIssue)`, not a second source of
     * truth. */
    issues: z.array(shipmentImportIssueSchema),
    /** Non-blocking: shipment labels that already exist for this institution and would be
     * skipped by default on commit (not a validation error). */
    existing_shipments: z.array(z.string().min(1)),
    /** Sorted, distinct Arrival-date years across every valid (non-excluded) shipment — for the
     * year-by-year progress UI (Phase 5) and for selecting a `year` to commit. */
    years: z.array(z.number().int()),
    /** Hash scoped to `raw_text` itself (Phase 3A's resolved architecture) — the only hash
     * concept now; resubmitted unchanged with each year-commit request. The Phase 3B-era
     * `raw_text_hash`/legacy-`preview_hash` split and the legacy `shipments` field have been
     * retired now that the commit endpoint re-derives everything from `raw_text` itself (Phase
     * 3C) instead of trusting a resubmitted shipments array. */
    preview_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export const shipmentImportCommitOptionsSchema = z
  .object({
    allow_species_autocreate: z.boolean().optional(),
    allow_duplicate_headers: z.boolean().optional(),
  })
  .strict();

/**
 * Year-scoped commit request (Phase 3C). The server never receives or trusts a pre-grouped
 * shipments structure — it re-derives everything itself from `raw_text`, which must be
 * byte-identical to what `preview_hash` was computed over during validate/preview. A commit
 * request carrying the old `{ preview_hash, shipments, options }` shape fails this schema's
 * `.strict()` check (missing `raw_text`/`year`, unrecognized `shipments`), so a stale client
 * cannot accidentally write partial or unvalidated data through this endpoint.
 */
export const shipmentImportCommitRequestSchema = z
  .object({
    raw_text: z.string().min(1).max(2_000_000),
    preview_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    year: z.number().int(),
    options: shipmentImportCommitOptionsSchema.optional(),
  })
  .strict();

export const shipmentImportCommitResponseSchema = z
  .object({
    year: z.number().int(),
    created: z.number().int().min(0),
    skipped: z.number().int().min(0),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

/** YYYY-MM-DD date string for export range filters and delete range bounds. */
const isoDateOnlySchema = z.iso.date();

export const shipmentExportQuerySchema = z
  .object({
    format: z.enum(["xlsx", "csv"]).optional(),
    from: isoDateOnlySchema.optional(),
    to: isoDateOnlySchema.optional(),
  })
  .strict();

const shipmentDeleteRangeSchema = z
  .object({
    mode: z.literal("range"),
    from: isoDateOnlySchema,
    to: isoDateOnlySchema,
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: "'from' date must not be after 'to' date",
    path: ["from"],
  });

export const shipmentDeleteBodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }).strict(),
  z
    .object({
      mode: z.literal("year"),
      year: z.number().int().min(1900).max(2100),
    })
    .strict(),
  shipmentDeleteRangeSchema,
]);

export type ShipmentDeleteBody = z.infer<typeof shipmentDeleteBodySchema>;

export type ShipmentImportPreviewRequest = z.infer<typeof shipmentImportPreviewRequestSchema>;
export type ShipmentImportPreviewResponse = z.infer<typeof shipmentImportPreviewResponseSchema>;
export type ShipmentImportCommitRequest = z.infer<typeof shipmentImportCommitRequestSchema>;
export type ShipmentImportCommitResponse = z.infer<typeof shipmentImportCommitResponseSchema>;
export type ShipmentExportQuery = z.infer<typeof shipmentExportQuerySchema>;
