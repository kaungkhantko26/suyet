import { z } from "zod";

/** Pure (browser-safe) definitions shared by the form builder, the submission validator and the tests. */
export const FIELD_TYPES = ["SHORT_TEXT", "LONG_TEXT", "EMAIL", "PHONE", "NUMBER", "DATE", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN", "CHECKBOX"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const CHOICE_TYPES: FieldType[] = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN"];
export const MAX_FIELDS = 30;
export const MAX_OPTIONS = 50;

/**
 * Data minimisation: organizers may not use the form to harvest credentials, payment data or government identifiers.
 * Checked on every label/help text when the form is saved (server-side).
 */
export const SENSITIVE_PATTERN = /(password|passcode|pass phrase|\bpin\b|\botp\b|one[- ]time (code|password)|verification code|credit|debit|card number|\bcvv\b|\bcvc\b|\biban\b|bank account|account number|national (id|registration)|\bnrc\b|passport|social security|\bssn\b|driver'?s? licen[cs]e|biometric|fingerprint|secret key|private key|seed phrase)/i;

export interface FieldDef {
  id?: string;
  type: FieldType;
  label: string;
  helpText?: string | null;
  required: boolean;
  options?: string[] | null;
  rules?: { maxLength?: number; min?: number; max?: number } | null;
}

const text = (max: number) => z.string().trim().min(1, "validation.required").max(max, "validation.max");

export const fieldDefSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(FIELD_TYPES),
    label: text(200),
    helpText: z.string().trim().max(500, "validation.max").optional().nullable().transform((v) => v || null),
    required: z.boolean().default(false),
    options: z.array(text(100)).max(MAX_OPTIONS).optional().nullable(),
    rules: z.object({ maxLength: z.number().int().min(1).max(5000).optional(), min: z.number().optional(), max: z.number().optional() }).optional().nullable(),
  })
  .superRefine((f, ctx) => {
    if (CHOICE_TYPES.includes(f.type)) {
      const opts = f.options ?? [];
      if (opts.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "registration.needOptions" });
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) ctx.addIssue({ code: "custom", path: ["options"], message: "registration.duplicateOptions" });
    }
    if (SENSITIVE_PATTERN.test(f.label) || SENSITIVE_PATTERN.test(f.helpText ?? "") || (f.options ?? []).some((o) => SENSITIVE_PATTERN.test(o))) {
      ctx.addIssue({ code: "custom", path: ["label"], message: "registration.sensitiveField" });
    }
    if (f.rules?.min !== undefined && f.rules?.max !== undefined && f.rules.max < f.rules.min) ctx.addIssue({ code: "custom", path: ["rules"], message: "validation.number" });
  });

export const formSchema = z.object({
  enabled: z.boolean(),
  requireApproval: z.boolean().optional().default(false),
  description: z.string().trim().max(2000, "validation.max").optional().nullable().transform((v) => v || null),
  confirmationMessage: z.string().trim().max(1000, "validation.max").optional().nullable().transform((v) => v || null),
  capacity: z.number().int().min(1).max(100_000).nullable().optional().transform((v) => v ?? null),
  closesAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/).nullable().optional().transform((v) => v ?? null),
  fields: z.array(fieldDefSchema).max(MAX_FIELDS, "registration.tooManyFields"),
});
export type FormInput = z.infer<typeof formSchema>;

export type AnswerValue = string | string[] | boolean | number;
export interface Answer { fieldId: string; label: string; type: FieldType; value: AnswerValue }

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const clean = (s: string) => s.replace(CONTROL, "").trim();

/**
 * Validates participant input against the SAVED form definition (never against anything the client says about the form).
 * Only questions defined on the form are accepted; extra keys are ignored. Returns per-field i18n error keys.
 */
export function validateAnswers(fields: (FieldDef & { id: string })[], raw: Record<string, unknown>): { ok: true; answers: Answer[] } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const answers: Answer[] = [];
  for (const f of fields) {
    const v = raw?.[f.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || (f.type === "CHECKBOX" && v === false);
    const push = (value: AnswerValue) => answers.push({ fieldId: f.id, label: f.label, type: f.type, value });
    if (empty) {
      if (f.required) errors[f.id] = "validation.required";
      continue;
    }
    switch (f.type) {
      case "SHORT_TEXT":
      case "LONG_TEXT": {
        if (typeof v !== "string") { errors[f.id] = "validation.required"; break; }
        const s = clean(v);
        const max = f.rules?.maxLength ?? (f.type === "SHORT_TEXT" ? 300 : 2000);
        if (!s) { if (f.required) errors[f.id] = "validation.required"; break; }
        if (s.length > max) { errors[f.id] = "validation.max"; break; }
        push(s); break;
      }
      case "EMAIL": {
        const s = typeof v === "string" ? clean(v).toLowerCase() : "";
        if (!z.string().email().max(254).safeParse(s).success) errors[f.id] = "validation.email"; else push(s);
        break;
      }
      case "PHONE": {
        const s = typeof v === "string" ? clean(v) : "";
        if (!/^\+?[\d\s()-]{6,20}$/.test(s)) errors[f.id] = "registration.invalidPhone"; else push(s);
        break;
      }
      case "NUMBER": {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
        if (!Number.isFinite(n) || (f.rules?.min !== undefined && n < f.rules.min) || (f.rules?.max !== undefined && n > f.rules.max)) errors[f.id] = "validation.number"; else push(n);
        break;
      }
      case "DATE": {
        const s = typeof v === "string" ? v.trim() : "";
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
        if (!ok) errors[f.id] = "registration.invalidDate"; else push(s);
        break;
      }
      case "SINGLE_CHOICE":
      case "DROPDOWN": {
        if (typeof v !== "string" || !(f.options ?? []).includes(v)) errors[f.id] = "registration.invalidChoice"; else push(v);
        break;
      }
      case "MULTIPLE_CHOICE": {
        const arr = Array.isArray(v) ? v : [];
        const valid = arr.every((x) => typeof x === "string" && (f.options ?? []).includes(x)) && new Set(arr).size === arr.length;
        if (!valid) errors[f.id] = "registration.invalidChoice"; else push(arr as string[]);
        break;
      }
      case "CHECKBOX": {
        if (v !== true && v !== "true" && v !== "on") errors[f.id] = "validation.required"; else push(true);
        break;
      }
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

/** CSV cell escaping with spreadsheet-formula neutralisation (=, +, -, @, tab, CR at the start are prefixed with an apostrophe). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
