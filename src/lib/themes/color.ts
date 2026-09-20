/* Tiny color toolkit for the theme applier — hex parsing, mixing, alpha. */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseColor(input: string): RGB | null {
  const str = input.trim();
  // #rgb / #rrggbb
  if (str.startsWith("#")) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
    return null;
  }
  // rgba?()
  const m = str.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p));
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0 };
  }
  return null;
}

export function withAlpha(input: string, alpha: number): string {
  const rgb = parseColor(input);
  if (!rgb) return input;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${round(a, 3)})`;
}

export function mix(a: string, b: string, ratio: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const t = Math.max(0, Math.min(1, ratio));
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)}, ${Math.round(ca.g + (cb.g - ca.g) * t)}, ${Math.round(
    ca.b + (cb.b - ca.b) * t
  )})`;
}

/** Blend text color over surface (used for subtle tints). */
export function tintOver(surface: string, text: string, amount: number): string {
  return mix(surface, text, amount);
}

export function lighten(hex: string, amount: number): string {
  return mix(hex, "#ffffff", amount);
}

export function darken(hex: string, amount: number): string {
  return mix(hex, "#000000", amount);
}

export function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export const FONT_STACKS: Record<string, string> = {
  sans: "var(--font-geist-sans)",
  serif: 'Georgia, "Times New Roman", "Noto Serif", serif',
  mono: 'var(--font-geist-mono), ui-monospace, "JetBrains Mono", monospace',
  rounded:
    'ui-rounded, "Hiragino Maru Gothic ProN", "Quicksand", "Comfortaa", "Manrope", var(--font-geist-sans), sans-serif',
};
