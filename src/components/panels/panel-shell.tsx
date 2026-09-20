"use client";

import type { ReactNode } from "react";
import { useUIStore } from "@/lib/store/ui-store";
import { X } from "lucide-react";

export interface PanelShellProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  /** sticky footer bar (e.g. composer) */
  footer?: ReactNode;
  children: ReactNode;
  /** remove default max-width for wide panels */
  wide?: boolean;
}

/**
 * Standard panel chrome rendered inside PanelHost's window:
 * sticky glass header with title/actions, scrollable body, optional footer.
 */
export function PanelShell({ title, subtitle, icon, actions, footer, children, wide }: PanelShellProps) {
  const closePanel = useUIStore((s) => s.closePanel);
  void wide;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className="sticky top-0 z-10 flex min-h-[56px] shrink-0 items-center gap-3 border-b hairline px-4 py-2.5 sm:px-5"
        style={{ background: "color-mix(in srgb, var(--card-solid) 88%, transparent)", backdropFilter: "blur(16px)" }}
      >
        {icon && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="truncate text-xs text-muted-c">{subtitle}</p>}
        </div>
        <span className="flex-1" />
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        <button
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c transition-colors hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-[var(--text)]"
          onClick={closePanel}
          aria-label="Close panel"
        >
          <X className="h-4.5 w-4.5 h-[18px] w-[18px]" />
        </button>
      </header>

      <div className="fd-scroll min-h-0 flex-1 overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-5 xl:px-8">{children}</div>
      </div>

      {footer && (
        <footer className="shrink-0 border-t hairline p-3 sm:p-4" style={{ background: "var(--card-solid)" }}>
          {footer}
        </footer>
      )}
    </div>
  );
}

/** Shared primary action button style used across panels. */
export function PanelActionButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  label?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "var(--accent-fg)" },
    ghost: { background: "color-mix(in srgb, var(--text) 8%, transparent)" },
    danger: { background: "color-mix(in srgb, var(--negative) 15%, transparent)", color: "var(--negative)" },
  };
  return (
    <button
      className="press flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-opacity disabled:opacity-40"
      style={styles[variant]}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      {children}
    </button>
  );
}

/** Section heading inside panels. */
export function PanelSection({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-c">{children}</h3>
      {action}
    </div>
  );
}

/** Empty state block used across panels. */
export function PanelEmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--text) 6%, transparent)" }}
        aria-hidden="true"
      >
        {icon ?? <span className="text-xl text-muted-c">◍</span>}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-[320px] text-xs leading-relaxed text-muted-c">{hint}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
