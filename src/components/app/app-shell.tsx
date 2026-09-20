"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Toaster } from "sonner";
import { BootGate } from "./boot-gate";
import { ThemeEffect } from "./theme-effect";
import { BackgroundCanvas } from "./background-canvas";
import { TopBar } from "./top-bar";
import { BottomNav } from "./bottom-nav";
import { TimerEffects } from "./timer-effects";
import { AudioSync } from "./audio-sync";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { useSettingsStore } from "@/lib/store/settings-store";
import { useAppearanceStore, resolveTheme } from "@/lib/store/appearance-store";
import { useWorkspaceStore } from "@/lib/store/workspace-store";
import { HardDrive, ShieldCheck } from "lucide-react";

const PanelHost = dynamic(() => import("./panel-host").then((m) => m.PanelHost), { ssr: false });
const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette), { ssr: false });
const FocusOverlay = dynamic(() => import("./focus-overlay").then((m) => m.FocusOverlay), { ssr: false });
const ShortcutLayer = dynamic(() => import("./shortcut-layer").then((m) => m.ShortcutLayer), { ssr: false });
const PWARegister = dynamic(() => import("./pwa-register").then((m) => m.PWARegister), { ssr: false });
const InstallPrompt = dynamic(() => import("./install-prompt").then((m) => m.InstallPrompt), { ssr: false });

export function AppShell() {
  const grain = useSettingsStore((s) => s.reducedMotion) ? 0 : 1;
  const themeId = useAppearanceStore((s) => s.activeThemeId);
  const customThemes = useAppearanceStore((s) => s.customThemes);
  const wallpaper = useAppearanceStore((s) => s.wallpaper);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const name = useSettingsStore((s) => s.name);

  const theme = useMemo(() => resolveTheme(themeId, customThemes), [themeId, customThemes]);
  const showGrain = grain && theme.effects.grain > 0 && !wallpaper;

  return (
    <BootGate>
      <ThemeEffect />
      <TimerEffects />
      <AudioSync />
      <ShortcutLayer />
      <PWARegister />

      {/* fixed background layers */}
      <BackgroundCanvas />
      {showGrain && <div className="grain-overlay" aria-hidden="true" />}

      <a
        href="#dashboard"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--card-solid)] focus:px-4 focus:py-2 focus:text-sm"
      >
        Skip to dashboard
      </a>

      <div className="relative z-10 flex min-h-screen flex-col">
        <TopBar />
        <main id="dashboard" className="mx-auto w-full max-w-[1440px] flex-1 px-3 pb-28 pt-4 sm:px-5 md:pb-10 md:pt-5">
          {workspaces.length === 0 ? (
            <EmptyEverything />
          ) : (
            <DashboardGrid />
          )}
        </main>

        <footer className="safe-bottom mt-auto border-t hairline px-4 py-3 md:px-6">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 text-[11px] text-muted-c">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {name ? `${name} · ` : ""}Flowdeck — local-first. Your data never leaves this device.
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{theme.name} theme</span>
              <span aria-hidden="true">·</span>
              <span>v1.0</span>
            </div>
          </div>
        </footer>

        <BottomNav />
      </div>

      <PanelHost />
      <CommandPalette />
      <FocusOverlay />
      <InstallPrompt />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--popover)",
            color: "var(--text)",
            border: "1px solid var(--border-c)",
            borderRadius: "var(--app-radius)",
            backdropFilter: "blur(20px)",
            boxShadow: "var(--shadow-2)",
            fontSize: "13px",
          },
        }}
      />
    </BootGate>
  );
}

function EmptyEverything() {
  return (
    <div className="widget fd-rise mx-auto mt-24 max-w-md p-8 text-center">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}
      >
        <span className="text-accent text-xl">✳</span>
      </div>
      <h2 className="text-lg font-semibold">No workspaces yet</h2>
      <p className="mt-2 text-sm text-muted-c">
        Workspaces are saved dashboard layouts — Focus, Study, Planning, Analytics or your own.
      </p>
    </div>
  );
}
