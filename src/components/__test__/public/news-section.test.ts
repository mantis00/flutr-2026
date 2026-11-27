import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getHomepageNewsEntry,
  getPreview,
  NewsSection,
  type PublicNewsEntry,
} from "@/components/public/home/news-section";

function makeEntry(id: number, overrides: Partial<PublicNewsEntry> = {}): PublicNewsEntry {
  return {
    id,
    title: `News ${id}`,
    content: `Content ${id}`,
    image_url: null,
    created_at: new Date(`2026-03-${String(id).padStart(2, "0")}T00:00:00.000Z`),
    show_on_homepage: false,
    ...overrides,
  };
}

describe("getPreview", () => {
  it("returns short content unchanged", () => {
    expect(getPreview("A short note.")).toBe("A short note.");
  });

  it("truncates long content at the last word boundary before the limit", () => {
    const content = `${"word ".repeat(56)}tail`;

    expect(getPreview(content)).toBe(`${"word ".repeat(55)}word...`);
  });

  it("falls back to the character limit when long content has no spaces", () => {
    const content = "x".repeat(281);

    expect(getPreview(content)).toBe(`${"x".repeat(280)}...`);
  });
});

describe("homepage news selection", () => {
  it("uses the selected active entry instead of the newest entry", () => {
    const newest = makeEntry(2);
    const selected = makeEntry(1, { show_on_homepage: true });

    expect(getHomepageNewsEntry([newest, selected])).toBe(selected);
  });

  it("defaults to the newest entry when no override is selected", () => {
    const newest = makeEntry(2);
    expect(getHomepageNewsEntry([newest, makeEntry(1)])).toBe(newest);
  });

  it("returns null when no active entries are available", () => {
    expect(getHomepageNewsEntry([])).toBeNull();
  });
});

describe("NewsSection", () => {
  it("shows View all only when there are multiple active entries", () => {
    const render = (entries: PublicNewsEntry[]) =>
      renderToStaticMarkup(createElement(NewsSection, { entries }));

    expect(render([makeEntry(1)])).not.toContain("View all");
    expect(render([makeEntry(2), makeEntry(1)])).toContain("View all");
  });
});
