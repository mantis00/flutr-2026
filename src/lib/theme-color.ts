/** WCAG relative luminance of a `#rrggbb` color, or `null` if it isn't one. */
export function relativeLuminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const int = Number.parseInt(match[1], 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two relative luminances, 1:1 to 21:1. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const DARK_FOREGROUND = "#111111";
const DARK_LUMINANCE = relativeLuminance(DARK_FOREGROUND)!;

/**
 * Foreground color that stays legible on `hex`.
 *
 * Institution theme colors override `--primary` for a whole tenant, but
 * `--primary-foreground` is a fixed token that flips between light and dark
 * mode — so without this it can land dark-on-dark.
 */
export function readableForeground(hex: string): string | null {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return null;
  return contrastRatio(luminance, DARK_LUMINANCE) >= contrastRatio(luminance, 1)
    ? DARK_FOREGROUND
    : "#ffffff";
}

/**
 * Accent color for text on a dark surface, or white when it can't be read.
 *
 * The theme color is admin-chosen with no contrast validation, so a dark one
 * would otherwise render near-invisible on the hero. 3:1 is the AA bar for
 * large text, measured against black — the worst case under the hero overlay.
 */
export function readableAccentOnDark(hex: string): string {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return "#ffffff";
  return contrastRatio(luminance, 0) >= 3 ? hex : "#ffffff";
}
