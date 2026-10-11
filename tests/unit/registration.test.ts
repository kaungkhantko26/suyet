import { describe, expect, it } from "vitest";
import { csvCell, fieldDefSchema, formSchema, toCsv, validateAnswers, type FieldDef } from "@/lib/registration/schema";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const f = (n: number, over: Partial<FieldDef> = {}): FieldDef & { id: string } => ({ id: id(n), type: "SHORT_TEXT", label: `Q${n}`, required: false, ...over });

describe("form builder validation", () => {
  it("accepts a normal form and defaults", () => {
    const r = formSchema.safeParse({ enabled: true, capacity: 50, fields: [{ type: "SHORT_TEXT", label: "School", required: true }, { type: "DROPDOWN", label: "Level", options: ["A", "B"] }] });
    expect(r.success).toBe(true);
  });
  it("choice questions need two distinct options", () => {
    expect(fieldDefSchema.safeParse({ type: "SINGLE_CHOICE", label: "x", options: ["only"] }).success).toBe(false);
    expect(fieldDefSchema.safeParse({ type: "DROPDOWN", label: "x", options: ["A", "a"] }).error?.issues[0].message).toBe("registration.duplicateOptions");
  });
  it.each(["Your password", "Credit card number", "NRC number", "Passport no.", "Bank account number", "One-time code (OTP)", "Seed phrase", "Social Security Number"])("refuses to collect sensitive data: %s", (label) => {
    expect(fieldDefSchema.safeParse({ type: "SHORT_TEXT", label }).error?.issues[0].message).toBe("registration.sensitiveField");
  });
  it("sensitive text is also caught in help text and options", () => {
    expect(fieldDefSchema.safeParse({ type: "SHORT_TEXT", label: "Info", helpText: "please enter your PIN" }).success).toBe(false);
    expect(fieldDefSchema.safeParse({ type: "DROPDOWN", label: "Info", options: ["Passport", "Other"] }).success).toBe(false);
  });
  it("limits question count and capacity", () => {
    expect(formSchema.safeParse({ enabled: true, fields: Array.from({ length: 31 }, () => ({ type: "SHORT_TEXT", label: "q" })) }).success).toBe(false);
    expect(formSchema.safeParse({ enabled: true, capacity: 0, fields: [] }).success).toBe(false);
  });
});

describe("answer validation (server-side, against the saved form)", () => {
  const fields = [
    f(1, { type: "SHORT_TEXT", required: true, rules: { maxLength: 10 } }),
    f(2, { type: "EMAIL" }), f(3, { type: "PHONE" }), f(4, { type: "NUMBER", rules: { min: 1, max: 10 } }), f(5, { type: "DATE" }),
    f(6, { type: "SINGLE_CHOICE", options: ["A", "B"], required: true }), f(7, { type: "MULTIPLE_CHOICE", options: ["X", "Y", "Z"] }),
    f(8, { type: "DROPDOWN", options: ["P", "Q"] }), f(9, { type: "CHECKBOX", required: true }),
  ];
  const good = { [id(1)]: "Yangon", [id(2)]: "A@B.co", [id(3)]: "+95 9 123 456", [id(4)]: "5", [id(5)]: "2026-12-31", [id(6)]: "A", [id(7)]: ["X", "Z"], [id(8)]: "Q", [id(9)]: true };

  it("accepts valid answers and normalises them with a question snapshot", () => {
    const r = validateAnswers(fields, good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers.find((a) => a.fieldId === id(2))?.value).toBe("a@b.co");
      expect(r.answers.find((a) => a.fieldId === id(4))?.value).toBe(5);
      expect(r.answers[0]).toMatchObject({ label: "Q1", type: "SHORT_TEXT" });
    }
  });
  it("reports required, type, range, length and choice errors per field", () => {
    const r = validateAnswers(fields, { [id(1)]: "this is way too long", [id(2)]: "nope", [id(3)]: "abc", [id(4)]: "99", [id(5)]: "2026-02-31", [id(6)]: "Z", [id(7)]: ["X", "Nope"], [id(8)]: "?", [id(9)]: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toMatchObject({ [id(1)]: "validation.max", [id(2)]: "validation.email", [id(3)]: "registration.invalidPhone", [id(4)]: "validation.number", [id(5)]: "registration.invalidDate", [id(6)]: "registration.invalidChoice", [id(7)]: "registration.invalidChoice", [id(8)]: "registration.invalidChoice", [id(9)]: "validation.required" });
  });
  it("missing required answers fail; optional ones can be omitted", () => {
    const r = validateAnswers(fields, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual([id(1), id(6), id(9)].sort());
  });
  it("ignores answers to questions that are not on the form (no data smuggling)", () => {
    const r = validateAnswers(fields, { ...good, "not-a-field": "<script>", extra: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answers.every((a) => fields.some((x) => x.id === a.fieldId))).toBe(true);
  });
  it("strips control characters and rejects non-string text answers", () => {
    const r = validateAnswers([f(1, { type: "SHORT_TEXT" })], { [id(1)]: "he\u0000llo\u0007" });
    expect(r.ok && r.answers[0].value).toBe("hello");
    expect(validateAnswers([f(1, { required: true })], { [id(1)]: { $ne: null } }).ok).toBe(false);
  });
  it("rejects duplicate multi-choice values", () => {
    expect(validateAnswers([f(7, { type: "MULTIPLE_CHOICE", options: ["X", "Y"] })], { [id(7)]: ["X", "X"] }).ok).toBe(false);
  });
});

describe("CSV export safety", () => {
  it("neutralises spreadsheet formula injection", () => {
    for (const evil of ["=HYPERLINK(\"http://evil\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1+1", "\r=1+1"]) expect(csvCell(evil).replace(/^"/, "")[0], evil).toBe("'");
  });
  it("quotes commas, quotes and newlines; joins arrays", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(["x", "y"])).toBe("x; y");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a", "b"], ["1", "=2"]])).toBe("a,b\r\n1,'=2\r\n");
  });
});
