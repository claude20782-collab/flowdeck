/* Map of icon-name → lucide component for user-configurable icons
 * (workspaces, quick links). Curated set keeps the bundle small. */

import {
  LayoutGrid,
  Crosshair,
  GraduationCap,
  CalendarDays,
  ChartLine,
  Sparkles,
  Zap,
  Flame,
  Moon,
  Sun,
  Star,
  Heart,
  BookOpen,
  Brain,
  Target,
  Trophy,
  Rocket,
  Leaf,
  Cloud,
  Coffee,
  Headphones,
  PenLine,
  SquareTerminal,
  Shield,
  Infinity as InfinityIcon,
  Compass,
  Gem,
  type LucideIcon,
} from "lucide-react";

export const ICON_MAP: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid,
  crosshair: Crosshair,
  "graduation-cap": GraduationCap,
  "calendar-days": CalendarDays,
  "chart-line": ChartLine,
  sparkles: Sparkles,
  zap: Zap,
  flame: Flame,
  moon: Moon,
  sun: Sun,
  star: Star,
  heart: Heart,
  "book-open": BookOpen,
  brain: Brain,
  target: Target,
  trophy: Trophy,
  rocket: Rocket,
  leaf: Leaf,
  cloud: Cloud,
  coffee: Coffee,
  headphones: Headphones,
  "pen-line": PenLine,
  terminal: SquareTerminal,
  shield: Shield,
  infinity: InfinityIcon,
  compass: Compass,
  gem: Gem,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export function iconByName(name: string | undefined): LucideIcon {
  return (name && ICON_MAP[name]) || LayoutGrid;
}
