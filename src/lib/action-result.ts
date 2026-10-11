import type { ZodError } from "zod";

export interface ActionResult {
  ok: boolean;
  /** i18n key under validation./auth./common. etc. */
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
  redirect?: string;
  data?: Record<string, unknown>;
}

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".") || "_";
    out[k] ??= i.message.startsWith("validation.") ? i.message : "validation.required";
  }
  return out;
}
