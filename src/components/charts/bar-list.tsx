/** Horizontal magnitude bars, one hue (sequential: this field's own distribution, not an identity comparison). */
export function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-muted" title={i.label}>{i.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-fg/8">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, (i.value / max) * 100)}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">{i.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Single stacked bar for a small set of named totals (e.g. a status breakdown). Segments get a 2px surface gap. */
export function StatusBar({ segments }: { segments: { label: string; value: number; className: string }[] }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0));
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-fg/8">
        {shown.map((s) => (
          <div key={s.label} className={`h-full rounded-full ${s.className}`} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={`size-2 shrink-0 rounded-full ${s.className}`} aria-hidden="true" />
            {s.label} <span className="tabular-nums text-fg">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
