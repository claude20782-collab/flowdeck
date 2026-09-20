/* ============================================================
 * Flowdeck theme engine — types
 * ============================================================ */

export type AnimationId =
  | "none"
  | "starfield"
  | "galaxy"
  | "nebula"
  | "aurora"
  | "rain"
  | "snow"
  | "petals"
  | "fireflies"
  | "embers"
  | "dust"
  | "waves"
  | "grid"
  | "matrix"
  | "blobs"
  | "gradient";

export type FontChoice = "sans" | "serif" | "mono" | "rounded";

export interface ThemeColors {
  /** Base page background (hex) */
  bg: string;
  /** Optional layered CSS background-image painted above bg */
  bgImage?: string;
  /** Widget surface color (hex) */
  surface: string;
  /** Primary text (hex) */
  text: string;
  /** Muted text (hex) */
  textMuted: string;
  /** Primary accent (hex) */
  accent: string;
  /** Readable text on accent (hex) */
  accentFg: string;
  /** Secondary accent for charts / highlights (hex) */
  accent2: string;
  /** Border color with alpha, e.g. "#ffffff14" or rgba() string */
  border: string;
  /** Success color */
  positive: string;
  /** Destructive color */
  negative: string;
  /** Warning color */
  warning: string;
}

export interface ThemeEffects {
  /** 0..1 widget surface opacity */
  widgetAlpha: number;
  /** Backdrop blur in px */
  blur: number;
  /** Base corner radius in px */
  radius: number;
  /** Film grain overlay strength 0..0.12 */
  grain: number;
  /** Default ambient animation */
  animation: AnimationId;
  /** Default animation intensity 0..1 */
  animationIntensity: number;
  /** Default animation speed multiplier 0.25..2 */
  animationSpeed: number;
  /** Default font */
  font?: FontChoice;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  tagline: string;
  /** true = dark theme */
  dark: boolean;
  colors: ThemeColors;
  effects: ThemeEffects;
  /** For user-created themes */
  custom?: boolean;
  createdAt?: number;
}

export interface WallpaperSettings {
  type: "none" | "solid" | "gradient" | "image" | "animated";
  /** solid hex | gradient CSS | image data-url */
  value?: string;
  /** dim overlay 0..0.8 applied above wallpaper for readability */
  dim?: number;
  /** blur px applied to image wallpapers */
  blur?: number;
}
