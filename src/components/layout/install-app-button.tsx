"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/cn";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Add to Home Screen" trigger. Chrome/Edge/Android fire `beforeinstallprompt`, which we capture and
 * replay on click (the browser only allows calling .prompt() from a later user gesture). iOS Safari
 * never fires that event — there's no programmatic install there, so we just show the manual steps.
 */
const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
const isIOSDevice = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function InstallAppButton({ className }: { className?: string }) {
  const t = useT();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [isIOS] = useState(() => isIOSDevice() && !isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;
  const base = "flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-sm font-medium transition-colors hover:bg-fg/5";

  if (deferred) {
    return (
      <button
        type="button"
        className={cn(base, className)}
        onClick={async () => { await deferred.prompt(); await deferred.userChoice; setDeferred(null); }}
      >
        <Download className="size-4 text-muted" aria-hidden="true" />{t("install.cta")}
      </button>
    );
  }
  if (isIOS) {
    return <p className={cn("rounded-[10px] px-3 py-2 text-xs text-muted", className)}>{t("install.iosHint")}</p>;
  }
  return null;
}
