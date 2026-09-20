import type { ThemeDefinition } from "./types";

/* ============================================================
 * Flowdeck built-in themes (28).
 * Every theme is a complete, coherent visual identity.
 * ============================================================ */

const T = (
  id: string,
  name: string,
  tagline: string,
  dark: boolean,
  colors: ThemeDefinition["colors"],
  effects: ThemeDefinition["effects"]
): ThemeDefinition => ({ id, name, tagline, dark, colors, effects });

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  /* ---------- 1. Midnight — default ---------- */
  T(
    "midnight",
    "Midnight",
    "Deep navy dusk with warm amber",
    true,
    {
      bg: "#0b0d12",
      bgImage:
        "radial-gradient(1200px 700px at 70% -10%, rgba(232,168,73,0.05), transparent 60%), radial-gradient(900px 600px at 15% 110%, rgba(110,124,166,0.06), transparent 60%)",
      surface: "#151823",
      text: "#e7e9ee",
      textMuted: "#8b90a0",
      accent: "#e8a849",
      accentFg: "#17130a",
      accent2: "#c46a4e",
      border: "#ffffff12",
      positive: "#4caf7d",
      negative: "#e0566b",
      warning: "#e8a849",
    },
    { widgetAlpha: 0.72, blur: 14, radius: 16, grain: 0, animation: "starfield", animationIntensity: 0.45, animationSpeed: 0.6 }
  ),

  /* ---------- 2. AMOLED ---------- */
  T(
    "amoled",
    "AMOLED",
    "Pure black. Zero light. Maximum battery.",
    true,
    {
      bg: "#000000",
      surface: "#0c0c0c",
      text: "#f2f2f2",
      textMuted: "#7a7a7a",
      accent: "#5eead4",
      accentFg: "#00201b",
      accent2: "#94a3b8",
      border: "#ffffff10",
      positive: "#34d399",
      negative: "#f87171",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.88, blur: 0, radius: 14, grain: 0, animation: "none", animationIntensity: 0.3, animationSpeed: 1 }
  ),

  /* ---------- 3. Deep Space ---------- */
  T(
    "deep-space",
    "Deep Space",
    "The quiet between stars",
    true,
    {
      bg: "#05060f",
      bgImage: "radial-gradient(1000px 600px at 50% -20%, rgba(99,102,241,0.08), transparent 65%)",
      surface: "#0d1020",
      text: "#dfe3f2",
      textMuted: "#7d84a3",
      accent: "#a5b4fc",
      accentFg: "#111224",
      accent2: "#67e8f9",
      border: "#ffffff10",
      positive: "#6ee7b7",
      negative: "#fb7185",
      warning: "#fcd34d",
    },
    { widgetAlpha: 0.66, blur: 16, radius: 18, grain: 0.03, animation: "starfield", animationIntensity: 0.7, animationSpeed: 0.5 }
  ),

  /* ---------- 4. Purple Nebula ---------- */
  T(
    "nebula",
    "Purple Nebula",
    "Drifting through violet clouds",
    true,
    {
      bg: "#12091f",
      bgImage:
        "radial-gradient(900px 600px at 20% 20%, rgba(168,85,247,0.16), transparent 60%), radial-gradient(800px 700px at 85% 80%, rgba(236,72,153,0.12), transparent 60%)",
      surface: "#1d1233",
      text: "#efe6ff",
      textMuted: "#9d8ec2",
      accent: "#c084fc",
      accentFg: "#1c0f31",
      accent2: "#f0abfc",
      border: "#ffffff14",
      positive: "#86efac",
      negative: "#fb7185",
      warning: "#fcd34d",
    },
    { widgetAlpha: 0.6, blur: 18, radius: 20, grain: 0.04, animation: "nebula", animationIntensity: 0.6, animationSpeed: 0.7 }
  ),

  /* ---------- 5. Aurora ---------- */
  T(
    "aurora",
    "Aurora",
    "Northern lights over dark pines",
    true,
    {
      bg: "#041311",
      bgImage:
        "radial-gradient(1100px 500px at 30% 0%, rgba(45,212,191,0.14), transparent 60%), radial-gradient(900px 600px at 80% 30%, rgba(139,92,246,0.10), transparent 60%)",
      surface: "#0a1f1c",
      text: "#e3fffa",
      textMuted: "#7fa8a1",
      accent: "#2dd4bf",
      accentFg: "#03211d",
      accent2: "#a78bfa",
      border: "#ffffff12",
      positive: "#34d399",
      negative: "#fb7185",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.6, blur: 16, radius: 18, grain: 0, animation: "aurora", animationIntensity: 0.65, animationSpeed: 0.6 }
  ),

  /* ---------- 6. Ocean ---------- */
  T(
    "ocean",
    "Ocean",
    "Two hundred meters down",
    true,
    {
      bg: "#04121c",
      bgImage:
        "radial-gradient(1000px 700px at 50% -10%, rgba(14,165,183,0.12), transparent 60%), linear-gradient(180deg, rgba(6,95,140,0.10), transparent 50%)",
      surface: "#0a1e2d",
      text: "#e2f3fa",
      textMuted: "#7c9db0",
      accent: "#38bdf8",
      accentFg: "#031a26",
      accent2: "#5eead4",
      border: "#ffffff12",
      positive: "#34d399",
      negative: "#fb7185",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.62, blur: 16, radius: 18, grain: 0, animation: "waves", animationIntensity: 0.55, animationSpeed: 0.6 }
  ),

  /* ---------- 7. Arctic (light) ---------- */
  T(
    "arctic",
    "Arctic",
    "Glacial morning light",
    false,
    {
      bg: "#eef4f8",
      bgImage: "radial-gradient(900px 500px at 70% -10%, rgba(56,189,248,0.14), transparent 60%)",
      surface: "#ffffff",
      text: "#132733",
      textMuted: "#5c7383",
      accent: "#0e7490",
      accentFg: "#f0fbff",
      accent2: "#0284c7",
      border: "#0b1c2647",
      positive: "#059669",
      negative: "#dc2626",
      warning: "#d97706",
    },
    { widgetAlpha: 0.82, blur: 12, radius: 18, grain: 0, animation: "snow", animationIntensity: 0.4, animationSpeed: 0.7 }
  ),

  /* ---------- 8. Forest ---------- */
  T(
    "forest",
    "Forest",
    "Fireflies under a canopy",
    true,
    {
      bg: "#0a120a",
      bgImage: "radial-gradient(1000px 600px at 50% 120%, rgba(74,124,58,0.16), transparent 65%)",
      surface: "#122012",
      text: "#e8f2e6",
      textMuted: "#84a37e",
      accent: "#a3e635",
      accentFg: "#141f0a",
      accent2: "#facc15",
      border: "#ffffff12",
      positive: "#4ade80",
      negative: "#f87171",
      warning: "#facc15",
    },
    { widgetAlpha: 0.64, blur: 14, radius: 16, grain: 0.02, animation: "fireflies", animationIntensity: 0.6, animationSpeed: 0.5 }
  ),

  /* ---------- 9. Sakura (light) ---------- */
  T(
    "sakura",
    "Sakura",
    "Petals on still water",
    false,
    {
      bg: "#faf2f4",
      bgImage:
        "radial-gradient(800px 500px at 80% -10%, rgba(244,114,182,0.12), transparent 60%), radial-gradient(700px 500px at 10% 110%, rgba(251,146,60,0.08), transparent 60%)",
      surface: "#ffffff",
      text: "#3d2431",
      textMuted: "#8a6b7a",
      accent: "#db2777",
      accentFg: "#fff5f9",
      accent2: "#f472b6",
      border: "#3d24314d",
      positive: "#059669",
      negative: "#dc2626",
      warning: "#d97706",
    },
    { widgetAlpha: 0.85, blur: 12, radius: 20, grain: 0, animation: "petals", animationIntensity: 0.5, animationSpeed: 0.5 }
  ),

  /* ---------- 10. Sunset ---------- */
  T(
    "sunset",
    "Sunset",
    "Golden hour fading to plum",
    true,
    {
      bg: "#1a0f18",
      bgImage:
        "radial-gradient(1100px 600px at 50% 115%, rgba(249,115,22,0.20), transparent 55%), radial-gradient(700px 500px at 15% -10%, rgba(168,85,247,0.10), transparent 60%)",
      surface: "#251523",
      text: "#ffe9d6",
      textMuted: "#a68a9b",
      accent: "#fb923c",
      accentFg: "#271205",
      accent2: "#f43f5e",
      border: "#ffffff14",
      positive: "#4ade80",
      negative: "#fb7185",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.62, blur: 16, radius: 18, grain: 0.03, animation: "gradient", animationIntensity: 0.5, animationSpeed: 0.4 }
  ),

  /* ---------- 11. Solar ---------- */
  T(
    "solar",
    "Solar",
    "Noon distilled into gold",
    true,
    {
      bg: "#12100a",
      bgImage:
        "radial-gradient(900px 550px at 50% -15%, rgba(250,204,21,0.16), transparent 60%), radial-gradient(700px 500px at 85% 100%, rgba(234,88,12,0.10), transparent 60%)",
      surface: "#1e1a10",
      text: "#fdf6dd",
      textMuted: "#a89f78",
      accent: "#facc15",
      accentFg: "#211c05",
      accent2: "#fb923c",
      border: "#ffffff14",
      positive: "#a3e635",
      negative: "#f87171",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.64, blur: 14, radius: 16, grain: 0.03, animation: "gradient", animationIntensity: 0.45, animationSpeed: 0.4 }
  ),

  /* ---------- 12. Cyberpunk ---------- */
  T(
    "cyberpunk",
    "Cyberpunk",
    "Neon rain on chrome streets",
    true,
    {
      bg: "#0a0612",
      bgImage:
        "radial-gradient(800px 500px at 20% 110%, rgba(217,70,239,0.14), transparent 60%), radial-gradient(800px 500px at 85% -10%, rgba(34,211,238,0.12), transparent 60%)",
      surface: "#150d22",
      text: "#f2eaff",
      textMuted: "#9d8ab8",
      accent: "#e879f9",
      accentFg: "#210a24",
      accent2: "#22d3ee",
      border: "#ffffff16",
      positive: "#4ade80",
      negative: "#fb7185",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.6, blur: 16, radius: 10, grain: 0.05, animation: "grid", animationIntensity: 0.7, animationSpeed: 0.8 }
  ),

  /* ---------- 13. Synthwave ---------- */
  T(
    "synthwave",
    "Synthwave",
    "1985, but at 2 AM",
    true,
    {
      bg: "#150a24",
      bgImage:
        "radial-gradient(900px 500px at 50% 130%, rgba(236,72,153,0.22), transparent 60%), radial-gradient(800px 500px at 50% -20%, rgba(56,189,248,0.12), transparent 60%)",
      surface: "#20103a",
      text: "#fdeaff",
      textMuted: "#a586c9",
      accent: "#f472b6",
      accentFg: "#2a0a1e",
      accent2: "#22d3ee",
      border: "#ffffff16",
      positive: "#4ade80",
      negative: "#fb7185",
      warning: "#fcd34d",
    },
    { widgetAlpha: 0.58, blur: 18, radius: 12, grain: 0.04, animation: "grid", animationIntensity: 0.75, animationSpeed: 0.7 }
  ),

  /* ---------- 14. Matrix ---------- */
  T(
    "matrix",
    "Matrix",
    "There is no spoon",
    true,
    {
      bg: "#010803",
      surface: "#04140a",
      text: "#c8f7d4",
      textMuted: "#4f8a62",
      accent: "#22c55e",
      accentFg: "#01130a",
      accent2: "#86efac",
      border: "#22c55e33",
      positive: "#22c55e",
      negative: "#f87171",
      warning: "#bbf7d0",
    },
    { widgetAlpha: 0.72, blur: 6, radius: 8, grain: 0.05, animation: "matrix", animationIntensity: 0.8, animationSpeed: 1 }
  ),

  /* ---------- 15. Retro Terminal ---------- */
  T(
    "terminal",
    "Retro Terminal",
    "Amber phosphor and hum",
    true,
    {
      bg: "#100c02",
      surface: "#1a1405",
      text: "#ffcf7d",
      textMuted: "#a98d52",
      accent: "#ffb02e",
      accentFg: "#1c1200",
      accent2: "#ffd98a",
      border: "#ffb02e2e",
      positive: "#b8d97a",
      negative: "#ff7a5c",
      warning: "#ffb02e",
    },
    { widgetAlpha: 0.78, blur: 4, radius: 6, grain: 0.09, animation: "dust", animationIntensity: 0.3, animationSpeed: 0.5 }
  ),

  /* ---------- 16. Monochrome ---------- */
  T(
    "monochrome",
    "Monochrome",
    "Everything gray. Nothing loud.",
    true,
    {
      bg: "#101010",
      surface: "#1a1a1a",
      text: "#f5f5f5",
      textMuted: "#8a8a8a",
      accent: "#f5f5f5",
      accentFg: "#111111",
      accent2: "#bdbdbd",
      border: "#ffffff14",
      positive: "#d4d4d4",
      negative: "#e07a7a",
      warning: "#d8b25c",
    },
    { widgetAlpha: 0.75, blur: 10, radius: 14, grain: 0.02, animation: "none", animationIntensity: 0.3, animationSpeed: 0.5 }
  ),

  /* ---------- 17. Minimal White ---------- */
  T(
    "minimal-white",
    "Minimal White",
    "Paper, ink, nothing else",
    false,
    {
      bg: "#fbfbfa",
      surface: "#ffffff",
      text: "#1a1a18",
      textMuted: "#787772",
      accent: "#1a1a18",
      accentFg: "#fbfbfa",
      accent2: "#6b6a66",
      border: "#1a1a1826",
      positive: "#217a45",
      negative: "#c0392b",
      warning: "#9a6b0f",
    },
    { widgetAlpha: 1, blur: 0, radius: 12, grain: 0, animation: "none", animationIntensity: 0.2, animationSpeed: 0.5 }
  ),

  /* ---------- 18. Glass ---------- */
  T(
    "glass",
    "Glass",
    "Frosted panes over dusk",
    true,
    {
      bg: "#0e1016",
      bgImage:
        "radial-gradient(700px 500px at 15% 25%, rgba(94,234,212,0.10), transparent 55%), radial-gradient(700px 500px at 85% 75%, rgba(244,114,182,0.10), transparent 55%), radial-gradient(600px 400px at 50% 50%, rgba(129,140,248,0.08), transparent 55%)",
      surface: "#1a1e29",
      text: "#eef1f8",
      textMuted: "#98a0b4",
      accent: "#8be9d8",
      accentFg: "#0a1a17",
      accent2: "#f4a8c8",
      border: "#ffffff1a",
      positive: "#4ade80",
      negative: "#fb7185",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.4, blur: 22, radius: 20, grain: 0, animation: "blobs", animationIntensity: 0.6, animationSpeed: 0.5 }
  ),

  /* ---------- 19. Liquid Glass (light) ---------- */
  T(
    "liquid-glass",
    "Liquid Glass",
    "Clear, cool, weightless",
    false,
    {
      bg: "#eef1f6",
      bgImage:
        "radial-gradient(700px 500px at 20% 30%, rgba(56,189,248,0.16), transparent 55%), radial-gradient(700px 500px at 80% 70%, rgba(244,114,182,0.12), transparent 55%), radial-gradient(500px 400px at 55% 55%, rgba(52,211,153,0.10), transparent 55%)",
      surface: "#ffffff",
      text: "#1c2430",
      textMuted: "#66707e",
      accent: "#0891b2",
      accentFg: "#f2fbff",
      accent2: "#db2777",
      border: "#1c243038",
      positive: "#059669",
      negative: "#dc2626",
      warning: "#d97706",
    },
    { widgetAlpha: 0.55, blur: 20, radius: 22, grain: 0, animation: "blobs", animationIntensity: 0.55, animationSpeed: 0.45 }
  ),

  /* ---------- 20. JEE Focus ---------- */
  T(
    "jee-focus",
    "JEE Focus",
    "Saffron discipline for exam season",
    true,
    {
      bg: "#11120c",
      bgImage:
        "radial-gradient(900px 550px at 50% -12%, rgba(255,153,0,0.10), transparent 60%), radial-gradient(700px 450px at 90% 110%, rgba(0,150,119,0.08), transparent 60%)",
      surface: "#1b1d13",
      text: "#f3f0e4",
      textMuted: "#9a9a84",
      accent: "#ff9913",
      accentFg: "#1e1502",
      accent2: "#009677",
      border: "#ffffff14",
      positive: "#00b383",
      negative: "#e0566b",
      warning: "#ff9913",
    },
    { widgetAlpha: 0.7, blur: 12, radius: 14, grain: 0.02, animation: "dust", animationIntensity: 0.35, animationSpeed: 0.5 }
  ),

  /* ---------- 21. Crimson Night ---------- */
  T(
    "crimson-night",
    "Crimson Night",
    "Velvet dark, arterial red",
    true,
    {
      bg: "#12080a",
      bgImage: "radial-gradient(900px 550px at 50% -12%, rgba(220,38,38,0.12), transparent 60%)",
      surface: "#1f0e12",
      text: "#ffe9ea",
      textMuted: "#a87d84",
      accent: "#ef4444",
      accentFg: "#26060a",
      accent2: "#fb7185",
      border: "#ffffff14",
      positive: "#4ade80",
      negative: "#ef4444",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.66, blur: 14, radius: 16, grain: 0.03, animation: "embers", animationIntensity: 0.55, animationSpeed: 0.55 }
  ),

  /* ---------- 22. Emerald Night ---------- */
  T(
    "emerald-night",
    "Emerald Night",
    "Lantern green in the dark",
    true,
    {
      bg: "#06110d",
      bgImage: "radial-gradient(900px 550px at 50% -12%, rgba(16,185,129,0.12), transparent 60%)",
      surface: "#0c1f18",
      text: "#e6fff4",
      textMuted: "#7ca692",
      accent: "#34d399",
      accentFg: "#04160f",
      accent2: "#a7f3d0",
      border: "#ffffff12",
      positive: "#34d399",
      negative: "#f87171",
      warning: "#fbbf24",
    },
    { widgetAlpha: 0.64, blur: 14, radius: 16, grain: 0.02, animation: "fireflies", animationIntensity: 0.5, animationSpeed: 0.5 }
  ),

  /* ---------- 23. Blue Hour ---------- */
  T(
    "blue-hour",
    "Blue Hour",
    "The sky ten minutes after sunset",
    true,
    {
      bg: "#0c1220",
      bgImage:
        "radial-gradient(1000px 600px at 50% -10%, rgba(96,125,189,0.16), transparent 60%), linear-gradient(180deg, rgba(39,58,93,0.14), transparent 55%)",
      surface: "#151d31",
      text: "#e5ebf8",
      textMuted: "#8291b0",
      accent: "#7da2e8",
      accentFg: "#0a1122",
      accent2: "#b8c6e8",
      border: "#ffffff12",
      positive: "#6ee7b7",
      negative: "#fb7185",
      warning: "#fcd34d",
    },
    { widgetAlpha: 0.68, blur: 14, radius: 16, grain: 0.02, animation: "dust", animationIntensity: 0.45, animationSpeed: 0.45 }
  ),

  /* ---------- 24. Cosmic ---------- */
  T(
    "cosmic",
    "Cosmic",
    "Every color the night sky hides",
    true,
    {
      bg: "#0a0714",
      bgImage:
        "radial-gradient(800px 500px at 20% 15%, rgba(139,92,246,0.14), transparent 55%), radial-gradient(700px 500px at 80% 30%, rgba(34,211,238,0.10), transparent 55%), radial-gradient(700px 500px at 55% 90%, rgba(236,72,153,0.10), transparent 55%)",
      surface: "#161028",
      text: "#eee9ff",
      textMuted: "#9c92bd",
      accent: "#b197fc",
      accentFg: "#150b28",
      accent2: "#67e8f9",
      border: "#ffffff14",
      positive: "#6ee7b7",
      negative: "#fb7185",
      warning: "#fcd34d",
    },
    { widgetAlpha: 0.6, blur: 18, radius: 18, grain: 0.03, animation: "galaxy", animationIntensity: 0.65, animationSpeed: 0.55 }
  ),

  /* ---------- 25. Neon Grid ---------- */
  T(
    "neon-grid",
    "Neon Grid",
    "Ride the light lines",
    true,
    {
      bg: "#03090a",
      bgImage: "radial-gradient(700px 400px at 50% 120%, rgba(16,185,129,0.16), transparent 60%)",
      surface: "#07181a",
      text: "#d9fff5",
      textMuted: "#5f9a90",
      accent: "#00e5a0",
      accentFg: "#01100c",
      accent2: "#22d3ee",
      border: "#00e5a02e",
      positive: "#00e5a0",
      negative: "#ff6d7a",
      warning: "#ffd166",
    },
    { widgetAlpha: 0.62, blur: 10, radius: 10, grain: 0.04, animation: "grid", animationIntensity: 0.7, animationSpeed: 0.75 }
  ),

  /* ---------- 26. Terracotta (light) ---------- */
  T(
    "terracotta",
    "Terracotta",
    "Warm clay and olives",
    false,
    {
      bg: "#f7efe7",
      bgImage: "radial-gradient(800px 500px at 75% -10%, rgba(194,88,58,0.10), transparent 60%)",
      surface: "#fffdf9",
      text: "#3a2a22",
      textMuted: "#8a7466",
      accent: "#bc5533",
      accentFg: "#fff4ee",
      accent2: "#7d8b4e",
      border: "#3a2a2240",
      positive: "#587f3f",
      negative: "#b3392c",
      warning: "#a8720f",
    },
    { widgetAlpha: 0.92, blur: 8, radius: 18, grain: 0.02, animation: "dust", animationIntensity: 0.3, animationSpeed: 0.5 }
  ),

  /* ---------- 27. Fjord ---------- */
  T(
    "fjord",
    "Fjord",
    "Cold water, steep silence",
    true,
    {
      bg: "#0b1220",
      bgImage:
        "radial-gradient(900px 550px at 30% -10%, rgba(94,137,178,0.14), transparent 60%), radial-gradient(700px 500px at 85% 100%, rgba(69,143,163,0.10), transparent 60%)",
      surface: "#131e31",
      text: "#e6edf7",
      textMuted: "#7e90a8",
      accent: "#9fc3ef",
      accentFg: "#0b1420",
      accent2: "#7dd3c8",
      border: "#ffffff12",
      positive: "#6ee7b7",
      negative: "#fb7185",
      warning: "#fcd34d",
    },
    { widgetAlpha: 0.66, blur: 14, radius: 16, grain: 0.02, animation: "aurora", animationIntensity: 0.45, animationSpeed: 0.4 }
  ),

  /* ---------- 28. Dune ---------- */
  T(
    "dune",
    "Dune",
    "Sand, heat, and patience",
    true,
    {
      bg: "#141009",
      bgImage:
        "radial-gradient(1000px 600px at 50% -10%, rgba(217,158,86,0.12), transparent 60%), radial-gradient(800px 500px at 90% 110%, rgba(146,94,52,0.12), transparent 60%)",
      surface: "#201a0f",
      text: "#f4ead6",
      textMuted: "#a89a7d",
      accent: "#d99e56",
      accentFg: "#221708",
      accent2: "#c4704f",
      border: "#ffffff14",
      positive: "#a3c47c",
      negative: "#e0787a",
      warning: "#e8c06a",
    },
    { widgetAlpha: 0.66, blur: 12, radius: 16, grain: 0.05, animation: "dust", animationIntensity: 0.5, animationSpeed: 0.55 }
  ),
];

export const DEFAULT_THEME_ID = "midnight";

export function getBuiltInTheme(id: string): ThemeDefinition | undefined {
  return BUILT_IN_THEMES.find((t) => t.id === id);
}

export const ANIMATION_LABELS: Record<string, { label: string; icon: string }> = {
  none: { label: "None", icon: "circle-slash" },
  starfield: { label: "Starfield", icon: "sparkles" },
  galaxy: { label: "Galaxy", icon: "orbit" },
  nebula: { label: "Nebula", icon: "cloud" },
  aurora: { label: "Aurora", icon: "wand" },
  rain: { label: "Rain", icon: "cloud-rain" },
  snow: { label: "Snow", icon: "snowflake" },
  petals: { label: "Petals", icon: "flower" },
  fireflies: { label: "Fireflies", icon: "lamp" },
  embers: { label: "Embers", icon: "flame" },
  dust: { label: "Dust", icon: "wind" },
  waves: { label: "Waves", icon: "waves" },
  grid: { label: "Neon grid", icon: "grid-3x3" },
  matrix: { label: "Matrix rain", icon: "binary" },
  blobs: { label: "Fluid blobs", icon: "droplets" },
  gradient: { label: "Drifting gradient", icon: "blend" },
};
