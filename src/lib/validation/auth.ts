import { z } from "zod";
import { emailField, optUrl, password, text } from "./common";

export const registerSchema = z.object({ name: text(100), email: emailField, password });
export const loginSchema = z.object({ email: emailField, password: z.string().min(1, "validation.required").max(200) });
export const forgotSchema = z.object({ email: emailField });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password });

export const registerOrganizerSchema = registerSchema.extend({
  orgName: text(160),
  orgType: z.enum(["UNIVERSITY", "UNIVERSITY_CLUB", "TECH_COMMUNITY", "COMPANY", "NONPROFIT", "INDEPENDENT"]),
  orgDescription: text(2000),
  orgEmail: emailField,
  orgWebsite: optUrl,
  orgEvidence: optUrl,
});
