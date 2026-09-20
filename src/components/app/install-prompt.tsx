"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSettingsStore } from "@/lib/store/settings-store";
import { X, Download, Zap } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function InstallPrompt() {
  const [available, setAvailable] = useState(false);
  const dismissed = useSettingsStore((s) => s.installHintDismissed);
  const update = useSettingsStore((s) => s.update);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      setAvailable(true);
    };
    const onInstalled = () => {
      deferredPrompt = null;
      setAvailable(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    /* manual trigger from settings */
    const onManual = () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
      } else if (typeof Notification !== "undefined") {
        /* no prompt available — guide the user */
        import("sonner").then(({ toast }) =>
          toast("Use your browser menu → Install app / Add to Home screen", { duration: 6000 })
        );
      }
    };
    window.addEventListener("flowdeck:install", onManual);

    const mq = window.matchMedia("(display-mode: standalone)");
    const syncMode = () => setStandalone(mq.matches);
    syncMode();
    mq.addEventListener("change", syncMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("flowdeck:install", onManual);
      mq.removeEventListener("change", syncMode);
    };
  }, []);

  const show = available && !dismissed && !standalone;

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setAvailable(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-x-0 bottom-[76px] z-40 mx-auto w-[calc(100%-2rem)] max-w-sm md:bottom-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
        >
          <div className="widget flex items-center gap-3 p-3.5" style={{ background: "var(--popover)" }}>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}
              aria-hidden="true"
            >
              <Zap className="h-5 w-5 text-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Install Flowdeck</p>
              <p className="text-[11px] leading-snug text-muted-c">Full-screen, offline-ready, opens like a native app.</p>
            </div>
            <button
              className="press flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              onClick={install}
            >
              <Download className="h-3.5 w-3.5" /> Install
            </button>
            <button
              className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-c hover:text-[var(--text)]"
              onClick={() => update({ installHintDismissed: true })}
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
