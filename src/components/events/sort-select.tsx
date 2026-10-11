"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/fields";
import { useT } from "@/i18n/client";
import { setParam } from "@/lib/events/filters";

export function SortSelect({ value }: { value: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{t("events.sort")}</span>
      <Select
        value={value}
        className="w-auto min-w-44"
        onChange={(e) => {
          const next = setParam(sp, "sort", e.target.value === "upcoming" ? null : e.target.value);
          start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
        }}
      >
        <option value="upcoming">{t("events.sortUpcoming")}</option>
        <option value="deadline">{t("events.sortDeadline")}</option>
        <option value="newest">{t("events.sortNewest")}</option>
        <option value="date">{t("events.sortDate")}</option>
      </Select>
    </label>
  );
}
