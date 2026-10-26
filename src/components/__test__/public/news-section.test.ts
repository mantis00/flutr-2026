import { getPreview } from "@/components/public/home/news-section";

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
