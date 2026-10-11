"use client";
import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";

export function ShareButton({ title, path }: { title: string; path: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const url = new URL(path, location.origin).toString();
        try {
          if (navigator.share) await navigator.share({ title, url });
          else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
        } catch { /* user cancelled */ }
      }}
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{copied ? t("details.copied") : t("details.share")}</span>
    </Button>
  );
}
