import type { Translator } from "@/i18n/core";
import { Badge } from "@/components/ui/badge";

const TONE = { DRAFT: "neutral", PENDING_REVIEW: "warning", CHANGES_REQUESTED: "warning", APPROVED: "success", REJECTED: "error" } as const;
export function SubmissionBadge({ status, t }: { status: keyof typeof TONE; t: Translator }) {
  return <Badge tone={TONE[status]}>{t(`organizerArea.sub.${status}`)}</Badge>;
}
const PUB = { DRAFT: "neutral", PUBLISHED: "success", ARCHIVED: "outline" } as const;
export function PublishBadge({ state, t }: { state: keyof typeof PUB; t: Translator }) {
  return <Badge tone={PUB[state]}>{t(`organizerArea.pub.${state}`)}</Badge>;
}
