/** Accepts "0f766e", "#0f766e", "0f7" or "#0f7" and returns "#rrggbb", or null. */
export function normalizeHexColor(input: string | null | undefined): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((input ?? "").trim());
  if (!match) return null;
  const hex = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${hex.toLowerCase()}`;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Black or white, whichever has the higher WCAG contrast on `hex`. */
export function readableForeground(hex: string): "#ffffff" | "#111111" {
  const l = luminance(hex);
  const whiteContrast = 1.05 / (l + 0.05);
  const blackContrast = (l + 0.05) / (luminance("#111111") + 0.05);
  return whiteContrast >= blackContrast ? "#ffffff" : "#111111";
}

/** A short, single-line label that is safe to show: no control characters, bounded length. */
export function cleanLabel(input: string | null | undefined, fallback: string): string {
  const flat = (input ?? "").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim();
  return flat ? flat.slice(0, 40).trim() : fallback;
}
