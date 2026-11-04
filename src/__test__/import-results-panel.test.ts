/**
 * Rendering-level regression coverage for `ImportResultsPanel`'s warning disclosures, without a
 * `@testing-library/react`/jsdom setup (this project has neither, and none is introduced here —
 * see `import-export-guide-dialog.test.ts` for the same constraint). A React function component
 * is just a function: calling it directly returns the plain `{ type, props }` element tree that
 * `React.createElement` built, with no DOM renderer involved, so that tree can be walked and
 * asserted on directly.
 */

import ImportResultsPanel from "@/components/platform/institutions/detail/import-results-panel";
import { type CommitResponse, type PreviewResponse } from "@/lib/shipment-import-utils";

type Fiber = { type: unknown; props: Record<string, unknown> };

function isFiber(node: unknown): node is Fiber {
  return typeof node === "object" && node !== null && "props" in node;
}

function flatten(node: unknown, acc: Fiber[] = []): Fiber[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, acc);
    return acc;
  }
  if (isFiber(node)) {
    acc.push(node);
    flatten(node.props.children, acc);
  }
  return acc;
}

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isFiber(node)) return textOf(node.props.children);
  return "";
}

function basePreview(warnings: string[]): PreviewResponse {
  return {
    summary: {
      total_rows: warnings.length,
      shipments_detected: 0,
      row_errors: 0,
      warnings: warnings.length,
      unknown_species: 0,
      unknown_suppliers: 0,
    },
    row_errors: [],
    warnings,
    unknown_species: [],
    unknown_suppliers: [],
    issues: [],
    existing_shipments: [],
    years: [],
    preview_hash: `sha256:${"a".repeat(64)}`,
  };
}

function baseCommit(warnings: string[]): CommitResponse {
  return { year: 2010, created: 0, skipped: 0, warnings };
}

const WARNING_COUNT = 24;
const warnings = Array.from({ length: WARNING_COUNT }, (_, i) => `warning-${i + 1}`);

describe("ImportResultsPanel warning disclosures", () => {
  it("renders the preview warnings disclosure with an accurate count, every warning, and collapsed by default", () => {
    const el = ImportResultsPanel({
      preview: basePreview(warnings),
      commitSummary: null,
      yearProgress: null,
      yearRunningTotals: null,
      isImporting: false,
      onReset: () => {},
    });

    const nodes = flatten(el);
    const details = nodes.filter((n) => n.type === "details");
    expect(details).toHaveLength(1);
    expect(details[0].props.open).toBeFalsy();

    const summary = nodes.find((n) => n.type === "summary");
    expect(textOf(summary)).toBe(`Warnings (${WARNING_COUNT})`);

    const items = nodes.filter((n) => n.type === "li");
    expect(items).toHaveLength(WARNING_COUNT);
    expect(textOf(items[0])).toBe("warning-1");
    expect(textOf(items[items.length - 1])).toBe(`warning-${WARNING_COUNT}`);
  });

  it("renders the commit warnings disclosure with an accurate count, every warning, and collapsed by default", () => {
    const el = ImportResultsPanel({
      preview: null,
      commitSummary: baseCommit(warnings),
      yearProgress: null,
      yearRunningTotals: null,
      isImporting: false,
      onReset: () => {},
    });

    const nodes = flatten(el);
    const details = nodes.filter((n) => n.type === "details");
    expect(details).toHaveLength(1);
    expect(details[0].props.open).toBeFalsy();

    const summary = nodes.find((n) => n.type === "summary");
    expect(textOf(summary)).toBe(`Import Warnings (${WARNING_COUNT})`);

    const items = nodes.filter((n) => n.type === "li");
    expect(items).toHaveLength(WARNING_COUNT);
    expect(textOf(items[0])).toBe("warning-1");
    expect(textOf(items[items.length - 1])).toBe(`warning-${WARNING_COUNT}`);
  });

  it("keeps the importing-year live region intact alongside the warning disclosures", () => {
    const el = ImportResultsPanel({
      preview: basePreview(warnings),
      commitSummary: baseCommit(warnings),
      yearProgress: null,
      yearRunningTotals: null,
      isImporting: false,
      onReset: () => {},
    });

    const nodes = flatten(el);
    const liveRegion = nodes.find(
      (n) => n.props["aria-live"] === "polite" && n.props.role === "status",
    );
    expect(liveRegion).toBeDefined();

    // Both disclosures render in the same tree without either truncating the other's warnings.
    const items = nodes.filter((n) => n.type === "li");
    expect(items).toHaveLength(WARNING_COUNT * 2);
  });
});
