import { Ban, CheckCircle2, CircleDot, Clock, Lock, Play } from "lucide-react";
import type { EventStatus } from "@/lib/event-status";
import type { Translator } from "@/i18n/core";
import { Badge } from "@/components/ui/badge";

const MAP = {
  REGISTRATION_OPEN: { tone: "success", Icon: CircleDot },
  REGISTRATION_CLOSED: { tone: "warning", Icon: Lock },
  UPCOMING: { tone: "info", Icon: Clock },
  ONGOING: { tone: "info", Icon: Play },
  COMPLETED: { tone: "neutral", Icon: CheckCircle2 },
  CANCELLED: { tone: "error", Icon: Ban },
} as const;

export function StatusBadge({ status, t }: { status: EventStatus; t: Translator }) {
  const { tone, Icon } = MAP[status];
  return (
    <Badge tone={tone}>
      <Icon className="size-3" aria-hidden="true" />
      {t(`status.${status}`)}
    </Badge>
  );
}
