import {
  contrastRatio,
  readableAccentOnDark,
  readableForeground,
  relativeLuminance,
} from "@/lib/theme-color";

describe("relativeLuminance", () => {
  it("returns 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("rejects values that are not #rrggbb", () => {
    expect(relativeLuminance("#fff")).toBeNull();
    expect(relativeLuminance("teal")).toBeNull();
    expect(relativeLuminance("")).toBeNull();
  });
});

describe("readableForeground", () => {
  it("pairs dark theme colors with white text", () => {
    expect(readableForeground("#4f46e5")).toBe("#ffffff"); // Indigo preset
    expect(readableForeground("#475569")).toBe("#ffffff"); // Slate preset
    expect(readableForeground("#000000")).toBe("#ffffff");
  });

  it("pairs light theme colors with dark text", () => {
    // Mid-tone teal reads better against near-black than against white
    // (3.97:1 vs 4.76:1), which is why the threshold is luminance, not hue.
    expect(readableForeground("#0d9488")).toBe("#111111");
    expect(readableForeground("#fde047")).toBe("#111111");
    expect(readableForeground("#ffffff")).toBe("#111111");
  });

  it("picks whichever candidate actually has more contrast", () => {
    // #777777 sits in the band where #111111 only reaches 4.22:1 but white
    // reaches 4.48:1 — a luminance-only threshold picks the worse of the two.
    const gray = relativeLuminance("#777777")!;
    expect(readableForeground("#777777")).toBe("#ffffff");
    expect(contrastRatio(gray, 1)).toBeGreaterThan(
      contrastRatio(gray, relativeLuminance("#111111")!),
    );
  });

  it("returns null for an unparseable color so callers can skip the override", () => {
    expect(readableForeground("not-a-color")).toBeNull();
  });
});

describe("readableAccentOnDark", () => {
  it("keeps theme colors that clear 3:1 against black", () => {
    expect(readableAccentOnDark("#0d9488")).toBe("#0d9488");
    expect(readableAccentOnDark("#fde047")).toBe("#fde047");
  });

  it("falls back to white for colors too dark to read on the hero", () => {
    expect(readableAccentOnDark("#000000")).toBe("#ffffff");
    expect(readableAccentOnDark("#1a1a2e")).toBe("#ffffff");
    expect(readableAccentOnDark("not-a-color")).toBe("#ffffff");
  });
});
