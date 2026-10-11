"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- server actions have heterogeneous signatures */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

type Variant = "primary" | "outline" | "danger" | "ghost" | "dark";

/** Runs a server action with optional confirm; shows the failure reason inline and refreshes on success. */
export function ActionButton({ action, args = [], label, variant = "outline", confirm, size = "sm" }: { action: (...args: any[]) => Promise<ActionResult>; args?: unknown[]; label: string; variant?: Variant; confirm?: string; size?: "sm" | "default" }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Button size={size} variant={variant} disabled={pending} onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        setErr(null);
        start(async () => { const r = await action(...args); if (!r.ok) setErr(t(r.error ?? "common.error")); else router.refresh(); });
      }}>{label}</Button>
      {err && <span role="alert" className="mt-1 max-w-48 text-xs text-error">{err}</span>}
    </span>
  );
}
