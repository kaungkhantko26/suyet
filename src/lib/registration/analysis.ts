import { CHOICE_TYPES, type Answer, type FieldDef } from "./schema";

export interface DayCount { date: string; count: number }
export interface OptionCount { option: string; count: number }
export interface FieldBreakdown { fieldId: string; label: string; options: OptionCount[] }

/** Registrations per calendar day (UTC date), oldest first. No gap-filling: only days with at least one registration appear. */
export function registrationsByDay(rows: { createdAt: Date }[]): DayCount[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = r.createdAt.toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

/**
 * Answer distribution for every choice-style field (single/multiple choice, dropdown, checkbox), sorted by
 * popularity. Free-text/number/date fields aren't aggregated — there's nothing meaningful to bucket them into.
 */
export function fieldBreakdowns(fields: (FieldDef & { id: string })[], rows: { answers: unknown }[]): FieldBreakdown[] {
  const aggregable = fields.filter((f) => CHOICE_TYPES.includes(f.type) || f.type === "CHECKBOX");
  if (aggregable.length === 0) return [];
  const counts = new Map<string, Map<string, number>>(aggregable.map((f) => [f.id, new Map<string, number>()]));
  for (const r of rows) {
    for (const a of r.answers as unknown as Answer[]) {
      const m = counts.get(a.fieldId);
      if (!m) continue;
      const values = Array.isArray(a.value) ? a.value : a.type === "CHECKBOX" ? [a.value ? "Yes" : "No"] : [String(a.value)];
      for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    }
  }
  return aggregable.map((f) => ({
    fieldId: f.id,
    label: f.label,
    options: [...(counts.get(f.id) ?? new Map()).entries()].sort(([, a], [, b]) => b - a).map(([option, count]) => ({ option, count })),
  })).filter((f) => f.options.length > 0);
}
