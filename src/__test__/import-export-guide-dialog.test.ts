/**
 * Phase 5B: guide content consistency with actual validation rules. The guide's prose is kept as
 * plain data (`IMPORT_EXPORT_GUIDE_SECTIONS`) specifically so this can be checked without
 * rendering the dialog — this project has no `@testing-library/react`/jsdom setup, and none is
 * introduced for this.
 */

import { IMPORT_EXPORT_GUIDE_SECTIONS } from "@/components/platform/institutions/detail/import-export-guide-dialog";
import { CANONICAL_SHIPMENT_IMPORT_HEADERS } from "@/lib/shipment-import-utils";

const GUIDE_TEXT = IMPORT_EXPORT_GUIDE_SECTIONS.map(
  (section) => `${section.heading} ${section.body}`,
).join(" ");

describe("IMPORT_EXPORT_GUIDE_SECTIONS", () => {
  it("mentions every one of the 13 canonical column headers, so the guide can't silently drift from the real contract", () => {
    for (const header of CANONICAL_SHIPMENT_IMPORT_HEADERS) {
      expect(GUIDE_TEXT).toContain(header);
    }
  });

  it("never exposes implementation details that would be meaningless to institution staff", () => {
    const forbiddenTerms = ["zod", "drizzle", "advisory lock", "raw_text", "preview_hash", "hash"];
    const lowerGuideText = GUIDE_TEXT.toLowerCase();
    for (const term of forbiddenTerms) {
      expect(lowerGuideText).not.toContain(term);
    }
  });

  it("explains blank vs. zero Released, since that is the single highest-risk concept in the contract", () => {
    const section = IMPORT_EXPORT_GUIDE_SECTIONS.find((s) => s.heading.includes("Released"));
    expect(section).toBeDefined();
    expect(section!.body).toMatch(/blank/i);
    expect(section!.body).toMatch(/unknown/i);
  });

  it("explains that re-validating and retrying is the supported recovery path, never an automatic resume", () => {
    const yearSection = IMPORT_EXPORT_GUIDE_SECTIONS.find((s) =>
      s.heading.includes("year by year"),
    );
    expect(yearSection).toBeDefined();
    expect(yearSection!.body).toMatch(/does not run in the background/i);
    expect(yearSection!.body).toMatch(/re-validat/i);
    expect(yearSection!.body).not.toMatch(/roll\s*back/i); // never claims rollback on interruption
  });

  it("every section has a non-empty heading and body", () => {
    for (const section of IMPORT_EXPORT_GUIDE_SECTIONS) {
      expect(section.heading.trim().length).toBeGreaterThan(0);
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });
});
