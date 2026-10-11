import { z } from "zod";
import { fromDateTimeLocal } from "../dates";
import { optText, optUrl, text, V } from "./common";

const dt = z
  .string()
  .optional()
  .transform((v) => (v ? fromDateTimeLocal(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), V.required);

const intField = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
  .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0), V.number);

const bool = z.union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()]).optional().transform((v) => v === "on" || v === "true" || v === true);

export const scheduleSchema = z.array(z.object({ time: z.string().max(40), title: z.string().max(200) })).max(60);

/** "09:00 | Opening" per line → structured schedule. */
export function parseSchedule(raw: string | undefined) {
  if (!raw) return [];
  return raw.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 60).map((line) => {
    const i = line.indexOf("|");
    return i === -1 ? { time: "", title: line.slice(0, 200) } : { time: line.slice(0, i).trim().slice(0, 40), title: line.slice(i + 1).trim().slice(0, 200) };
  });
}

export const eventFormSchema = z
  .object({
    title: text(160),
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, V.slug).max(90).optional().or(z.literal("").transform(() => undefined)),
    shortDescription: text(300),
    description: text(10000),
    categoryIds: z.array(z.string().uuid()).min(1, V.category).max(6),
    startAt: dt.refine((v) => v !== null, V.required),
    endAt: dt,
    registrationDeadline: dt,
    format: z.enum(["ONSITE", "ONLINE", "HYBRID"]),
    country: text(80).default("Myanmar"),
    locationId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    city: optText(100),
    venue: optText(200),
    address: optText(300),
    onlineUrl: optUrl,
    registrationMode: z.enum(["EXTERNAL", "ON_PLATFORM"]).default("EXTERNAL"),
    registrationUrl: optUrl,
    sourceUrl: optUrl,
    eligibility: optText(500),
    skillLevel: z.enum(["ALL_LEVELS", "BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("ALL_LEVELS"),
    requirements: optText(3000),
    feeAmount: intField.transform((v) => v ?? 0),
    currency: z.string().trim().toUpperCase().length(3).default("MMK"),
    teamAllowed: bool,
    minTeamSize: intField,
    maxTeamSize: intField,
    prizes: optText(3000),
    scheduleText: optText(4000),
    contactInfo: optText(500),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (v.endAt && v.startAt && v.endAt < v.startAt) issue("endAt", V.dateOrder);
    if (v.registrationDeadline && v.startAt && v.registrationDeadline > v.startAt) issue("registrationDeadline", V.deadlineOrder);
    if (v.minTeamSize && v.maxTeamSize && v.maxTeamSize < v.minTeamSize) issue("maxTeamSize", V.teamOrder);
    if (v.format !== "ONLINE" && !v.city && !v.venue && !v.locationId) issue("city", V.required);
    if (v.format !== "ONSITE" && !v.onlineUrl && v.format === "ONLINE") issue("onlineUrl", V.required);
  });

export type EventFormInput = z.infer<typeof eventFormSchema>;

/** Fields whose change on a published event requires re-review. */
export const SUBSTANTIAL_FIELDS = [
  "title", "startAt", "endAt", "registrationDeadline", "registrationUrl", "sourceUrl",
  "format", "locationId", "city", "venue", "onlineUrl", "feeAmount", "eligibility", "registrationMode",
] as const;

export function changedSubstantialFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v ?? null);
  return SUBSTANTIAL_FIELDS.filter((k) => norm(before[k]) !== norm(after[k]));
}
