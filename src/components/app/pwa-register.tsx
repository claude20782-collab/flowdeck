"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker (PWA offline shell) and surfaces update-ready
 * toasts: when a freshly installed worker is waiting behind an active one, the
 * user gets a one-tap “Reload” action instead of silently running stale code.
 */
export function PWARegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      /* sw requires secure context; sandbox preview proxies are https so this rarely trips */
    }

    let updateToastShown = false;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          /* existing waiting worker at load (update already downloaded) */
          if (reg.waiting && navigator.serviceWorker.controller) showUpdateToast();

          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller &&
                !updateToastShown
              ) {
                showUpdateToast();
              }
            });
          });

          /* periodic update check (browsers only check on navigation otherwise) */
          const poll = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
          window.addEventListener("pagehide", () => clearInterval(poll), { once: true });
        })
        .catch(() => {
          /* offline support unavailable — app still works online */
        });
    };

    const showUpdateToast = () => {
      if (updateToastShown) return;
      updateToastShown = true;
      toast.message("Flowdeck update ready", {
        description: "A new version has been downloaded. Reload to apply it.",
        duration: 12000,
        action: {
          label: "Reload",
          onClick: () => window.location.reload(),
        },
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
