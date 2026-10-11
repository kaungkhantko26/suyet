import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";

export function StatusPage({ icon, code, title, body, action, note, home = "Home" }: { icon: ReactNode; code?: string; title: string; body: string; action?: ReactNode; note?: string; home?: string }) {
  return (
    <Container className="flex flex-col items-center py-24 text-center">
      <div className="text-muted">{icon}</div>
      {code && <p className="eyebrow mt-4 tabular-nums">{code}</p>}
      <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-muted">{body}</p>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      <div className="mt-6 flex gap-3">{action}<ButtonLink href="/" variant="outline">{home}</ButtonLink></div>
    </Container>
  );
}
