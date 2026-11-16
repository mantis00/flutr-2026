/**
 * Unlike `import-guide-content.test.ts` (which only inspects an unrendered React-element tree,
 * so nested components like this one are never actually executed), this test renders
 * `SpreadsheetExample` for real via `react-dom/server`'s `renderToStaticMarkup` — no JSX needed
 * in this `.ts` file, since `React.createElement` is a plain function call. `renderToStaticMarkup`
 * needs no DOM, so this runs fine under Jest's "node" test environment with no jsdom dependency.
 * This verifies the actual markup a browser or screen reader would see: real `<table>` structure,
 * and that the horizontal-scroll wrapper is genuinely keyboard-focusable with an accessible name
 * (not just that the right props were passed).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SpreadsheetExample,
  type SpreadsheetExampleProps,
} from "@/components/tenant/guides/guide-spreadsheet-example";

function render(props: SpreadsheetExampleProps): string {
  return renderToStaticMarkup(createElement(SpreadsheetExample, props));
}

const baseProps: SpreadsheetExampleProps = {
  kind: "excerpt",
  label: "Example rows",
  headers: ["Species", "No. rec", "Released"],
  rows: [["Morpho peleides", 50, null]],
  caption: "A caption",
};

describe("SpreadsheetExample", () => {
  it("renders a real semantic table with one header cell per column", () => {
    const html = render(baseProps);
    expect(html).toContain("<table");
    expect((html.match(/<th[ >]/g) ?? []).length).toBe(baseProps.headers.length);
    for (const header of baseProps.headers) {
      expect(html).toContain(header);
    }
  });

  it("renders a null cell as a visible, explicit (blank) marker rather than an empty cell", () => {
    const html = render(baseProps);
    expect(html).toContain("(blank)");
  });

  it("renders a non-null cell, including the number 0, as its literal value rather than (blank)", () => {
    const html = render({ ...baseProps, rows: [["Morpho peleides", 50, 0]] });
    expect(html).not.toContain("(blank)");
    expect(html).toMatch(/>0</);
  });

  it("wraps the table in a keyboard-focusable region with a meaningful accessible name", () => {
    const html = render(baseProps);
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toMatch(/aria-label="[^"]*Example rows[^"]*"/);
  });

  it("gives the scroll region's accessible name a scroll-specific hint, distinct from the table's own label", () => {
    const html = render(baseProps);
    const regionLabelMatch = html.match(/role="region"[^>]*aria-label="([^"]*)"/);
    expect(regionLabelMatch).not.toBeNull();
    expect(regionLabelMatch![1].toLowerCase()).toMatch(/scroll/);
  });

  it("shows a visible instruction that the table can scroll horizontally", () => {
    const html = render(baseProps);
    expect(html.toLowerCase()).toMatch(/scrolls? horizontally/);
  });

  it("labels a complete example and an illustrative excerpt differently", () => {
    expect(render({ ...baseProps, kind: "complete" })).toMatch(/Complete example/);
    expect(render({ ...baseProps, kind: "excerpt" })).toMatch(/Illustrative excerpt/);
  });

  it("renders zero rows without error for a header-only excerpt", () => {
    const html = render({ ...baseProps, rows: [] });
    expect(html).toContain("<table");
    expect(html.match(/<tr/g)?.length).toBe(1); // header row only
  });
});
