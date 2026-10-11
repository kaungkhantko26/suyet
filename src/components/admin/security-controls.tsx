"use client";
import { ActionButton } from "./action-button";
import { ackAlertAction, killSwitchAction } from "@/app/actions/admin";

export function KillSwitch({ k, on, label }: { k: "automation_paused" | "submissions_disabled"; on: boolean; label: string }) {
  return <ActionButton variant={on ? "primary" : "danger"} label={on ? `Resume: ${label}` : label} confirm={on ? undefined : `${label}? This takes effect immediately.`} action={killSwitchAction} args={[k, !on]} />;
}
export function AckButton({ id }: { id: string }) {
  return <ActionButton label="Acknowledge" action={ackAlertAction} args={[id]} />;
}
