/**
 * Guide-content regression test, mirroring the no-render technique in `guides-layout.test.ts`:
 * this project has no `@testing-library/react`/jsdom setup, so the Server Component function is
 * called directly and its returned React-element tree is JSON.stringify'd. Literal props/children
 * written in the page (text, table headers, row data) survive serialization even though nested
 * custom components like `SpreadsheetExample` are never actually executed — only `ImportGuidePage`
 * itself runs. This checks the guide's real content, not a parallel data structure that could
 * drift from it.
 */

jest.mock("@/lib/guides-access", () => ({ canReadGuides: jest.fn() }));

import { existsSync } from "fs";
import { join } from "path";
import { canReadGuides } from "@/lib/guides-access";
import ImportGuidePage from "@/app/[institution]/guides/import/page";
import { CANONICAL_SHIPMENT_IMPORT_HEADERS } from "@/lib/shipment-import-utils";

const canReadGuidesMock = canReadGuides as unknown as jest.Mock;

/** Every string rendered anywhere in the returned tree (same technique as guides-layout.test.ts). */
function textOf(node: unknown): string {
  return JSON.stringify(node, (_key, value) =>
    typeof value === "function" ? value.name || "fn" : value,
  );
}

function render() {
  return ImportGuidePage({ params: Promise.resolve({ institution: "reiman-gardens" }) });
}

beforeEach(() => {
  canReadGuidesMock.mockReset();
  canReadGuidesMock.mockResolvedValue(true);
});

describe("ImportGuidePage access gating", () => {
  it("checks access for the requested institution", async () => {
    await render();
    expect(canReadGuidesMock).toHaveBeenCalledWith("reiman-gardens");
  });

  it("renders nothing when access is denied", async () => {
    canReadGuidesMock.mockResolvedValue(false);
    await expect(render()).resolves.toBeNull();
  });
});

describe("ImportGuidePage content", () => {
  it("mentions every one of the 13 canonical column headers, so the guide can't silently drift from the real contract", async () => {
    const text = textOf(await render());
    for (const header of CANONICAL_SHIPMENT_IMPORT_HEADERS) {
      expect(text).toContain(header);
    }
  });

  it("explains blank vs. zero Released, since that is the single highest-risk concept in the contract", async () => {
    const text = textOf(await render());
    expect(text).toMatch(/blank/i);
    expect(text).toMatch(/unknown/i);
  });

  it("distinguishes blank, zero, and a positive Released count as three different states, not just two", async () => {
    const text = textOf(await render());
    expect(text).toMatch(/never recorded historically/i);
    expect(text).toMatch(/confirmed: zero were released/i);
    expect(text).toMatch(/confirmed released/i);
  });

  it("documents column order as flexible, with the template's order offered only as a recommended starting point", async () => {
    const text = textOf(await render());
    expect(text.toLowerCase()).toMatch(
      /don.?t need to be in any particular order|recognizes each column by its name/,
    );
    expect(text.toLowerCase()).toMatch(/recommended/);
    // The strict claim this guide used to make must not survive a copy edit.
    expect(text.toLowerCase()).not.toMatch(/exactly these 13 columns, in this exact order/);
  });

  it("documents that unknown species block the import for institution staff, and are never auto-created", async () => {
    const text = textOf(await render());
    expect(text.toLowerCase()).toMatch(/unknown species|unrecognized species/);
    expect(text.toLowerCase()).toMatch(/platform superuser/);
  });

  it("documents that unknown suppliers are auto-created inactive, not blocked", async () => {
    const text = textOf(await render());
    expect(text.toLowerCase()).toMatch(/added automatically|creates the supplier/);
    expect(text.toLowerCase()).toMatch(/inactive/);
    // "never a blocking error" overstates it; the qualified phrasing must be used instead.
    expect(text.toLowerCase()).not.toMatch(/never a blocking error/);
  });

  it("gives each of the three validation examples its own heading, not just an inline bold lead-in", async () => {
    const text = textOf(await render());
    expect(text).toMatch(/Unknown species/);
    expect(text).toMatch(/Incorrect column header/);
    expect(text).toMatch(/Released exceeds received/);
  });

  it("describes the platform-superuser workflow as similar, not identical, and names its extra option", async () => {
    const text = textOf(await render());
    expect(text.toLowerCase()).toMatch(/similar/);
    expect(text.toLowerCase()).toMatch(/auto-create/);
    expect(text.toLowerCase()).not.toMatch(/works the same way/);
  });

  it("never implies an existing shipment is automatically updated or merged on reimport", async () => {
    const text = textOf(await render());
    expect(text.toLowerCase()).toMatch(/skipped automatically/);
    expect(text.toLowerCase()).not.toMatch(/merges? (the )?changes?/);
    expect(text.toLowerCase()).not.toMatch(/automatically updat(e|es|ed)/);
  });

  it("documents reimport safety as conditional on the default Skip duplicates setting, and explains Allow duplicates", async () => {
    const text = textOf(await render());
    expect(text).toMatch(/Duplicate headers/);
    expect(text).toMatch(/Skip duplicates/);
    expect(text).toMatch(/Allow duplicates/);
    // Must not claim retrying is safe unconditionally, regardless of that setting.
    expect(text.toLowerCase()).not.toMatch(/re-running the same file is always safe/);
  });

  it("explains why the browser tab must stay open during import", async () => {
    const text = textOf(await render());
    expect(text.toLowerCase()).toMatch(/keep this browser tab open|doesn.t run in the background/);
  });

  it("documents exports as .xlsx only", async () => {
    const text = textOf(await render());
    expect(text).toMatch(/\.xlsx/);
  });

  it("never exposes implementation details that would be meaningless to institution staff", async () => {
    const text = textOf(await render()).toLowerCase();
    const forbiddenTerms = ["zod", "drizzle", "advisory lock", "raw_text", "preview_hash", "hash"];
    for (const term of forbiddenTerms) {
      expect(text).not.toContain(term);
    }
  });

  it("references at least one screenshot, and every referenced screenshot path exists on disk", async () => {
    const text = textOf(await render());
    const paths = [
      ...text.matchAll(/\/docs\/(?:guides|field-guide)\/[\w.-]+\.(?:webp|png|jpg)/g),
    ].map((match) => match[0]);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(existsSync(join(process.cwd(), "public", path))).toBe(true);
    }
  });

  it("labels the Excel workbook screenshot as synthetic data, not a real institution's records", async () => {
    const text = textOf(await render());
    expect(text).toMatch(/import-xlsx-example\.webp/);
    expect(text.toLowerCase()).toMatch(/synthetic data/);
  });
});
