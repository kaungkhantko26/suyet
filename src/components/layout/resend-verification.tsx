"use client";
import { useState, useTransition } from "react";
import { resendVerificationAction } from "@/app/actions/auth";

export function ResendVerification({ label, okLabel }: { label: string; okLabel: string }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <span className="font-medium">{okLabel}</span>;
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => { const r = await resendVerificationAction(); if (r.ok) setDone(true); })} className="min-h-9 cursor-pointer font-medium underline underline-offset-4">
      {label}
    </button>
  );
}
