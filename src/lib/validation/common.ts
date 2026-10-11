import { z } from "zod";

// Zod 4 probes `new Function()` for a JIT fast path, which a strict CSP (no unsafe-eval) reports as a violation. Opt out.
z.config({ jitless: true });
import { isSafeExternalUrl } from "../url";

/** Messages are i18n keys (resolved by the UI) so validation errors are translated. */
export const V = {
  required: "validation.required",
  email: "validation.email",
  url: "validation.url",
  number: "validation.number",
  slug: "validation.slug",
  passwordShort: "validation.passwordShort",
  dateOrder: "validation.dateOrder",
  deadlineOrder: "validation.deadlineOrder",
  teamOrder: "validation.teamOrder",
  category: "validation.category",
} as const;

export const text = (max = 200) => z.string().trim().min(1, V.required).max(max, "validation.max");
export const optText = (max = 2000) =>
  z.string().trim().max(max, "validation.max").optional().transform((v) => (v ? v : undefined));

export const emailField = z.string().trim().toLowerCase().min(1, V.required).email(V.email).max(254);

/** Submitted links must be HTTPS unless the deployment explicitly opts in (ALLOW_HTTP_URLS=1) after a review policy decision. */
const HTTPS_ONLY = typeof process === "undefined" || process.env?.ALLOW_HTTP_URLS !== "1";

export const optUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || isSafeExternalUrl(v, { httpsOnly: HTTPS_ONLY }), V.url);

/** Long passphrases are welcome (max 256 only bounds hashing cost); no composition rules, no forced rotation. */
export const password = z.string().min(10, V.passwordShort).max(256);
