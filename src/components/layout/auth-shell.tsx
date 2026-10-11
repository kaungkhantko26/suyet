import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function AuthShell({ title, desc, children, wide = false }: { title: string; desc?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex w-full flex-col px-4 ${wide ? "max-w-4xl py-6 sm:py-8" : "max-w-md py-12 sm:py-20"}`}>
      <h1 className={`font-serif font-medium tracking-tight ${wide ? "text-2xl sm:text-3xl" : "text-3xl"}`}>{title}</h1>
      {desc && <p className="mt-2 text-muted">{desc}</p>}
      <Card className={wide ? "mt-5 p-5 sm:p-6" : "mt-8 p-6 sm:p-8"}>{children}</Card>
    </div>
  );
}
