import { eventFormSchema, type EventFormInput } from "@/lib/validation/event";
import { toDateTimeLocal } from "@/lib/dates";
import { categoryIds, future } from "./db";

export async function eventInput(over: Record<string, unknown> = {}): Promise<EventFormInput> {
  return eventFormSchema.parse({
    title: "Integration Test Hackathon", shortDescription: "Short text", description: "Long text",
    categoryIds: await categoryIds("hackathons"), startAt: toDateTimeLocal(future(30)), registrationDeadline: toDateTimeLocal(future(20)),
    format: "ONLINE", onlineUrl: "https://example.org/live", registrationUrl: "https://example.org/register", sourceUrl: "https://example.org/event",
    ...over,
  });
}
