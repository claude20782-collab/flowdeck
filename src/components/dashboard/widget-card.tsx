"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/store/settings-store";

export interface WidgetChromeProps {
  title?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** no header/body padding — widget manages its own padding */
  flush?: boolean;
}

/**
 * Pure visual widget chrome: surface card + optional header.
 * Drag/resize/remove controls live in the grid's SortableShell.
 */
export function WidgetCard({ title, icon, actions, children, className, bodyClassName, flush }: WidgetChromeProps) {
  const compact = useSettingsStore((s) => s.compactWidgets);

  return (
    <section className={cn("widget widget-hover relative overflow-hidden", className)} aria-label={title}>
      {title && (
        <header className={cn("flex min-h-[34px] items-center gap-2", compact ? "px-3.5 pt-3" : "px-4 pt-3.5")}>
          {icon && (
            <span className="flex items-center text-accent" aria-hidden="true">
              {icon}
            </span>
          )}
          <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
          <span className="flex-1" />
          {actions}
        </header>
      )}
      <div className={cn(!flush && (compact ? "px-3.5 pb-3.5 pt-2" : "px-4 pb-4 pt-2"), bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

/** Standard size class mapping for widget grid spans. */
export const SIZE_CLASS: Record<number, string> = {
  1: "col-span-2 md:col-span-3",
  2: "col-span-2 md:col-span-6",
  3: "col-span-2 md:col-span-9",
  4: "col-span-2 md:col-span-12",
};
