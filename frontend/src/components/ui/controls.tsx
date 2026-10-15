import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/** A small "↑ +12" style change indicator. `goodWhenUp` flips the colouring for metrics where down is good. */
export function DeltaChip({
  value,
  format,
  goodWhenUp = true,
  title,
}: {
  value: number | null;
  format: (v: number) => string;
  goodWhenUp?: boolean;
  title?: string;
}) {
  if (value == null || Number.isNaN(value)) return null;
  const flat = Math.abs(value) < 1e-9;
  const good = flat ? null : value > 0 === goodWhenUp;
  const Icon = value > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums",
        good === null ? "text-muted" : good ? "text-pos-ink" : "text-neg-ink",
      )}
    >
      {!flat && <Icon className="size-3" strokeWidth={2.5} aria-hidden />}
      {value > 0 ? "+" : ""}
      {format(value)}
    </span>
  );
}

type Option<T extends string> = { value: T; label: string };

/** Pill tabs, e.g. "Pain points | Positive highlights". */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("inline-flex rounded-lg bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-ring",
            o.value === value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The dark tooltip used by every chart: a label line, then label/value rows with mono values. */
export function ChartTooltip({ title, rows }: { title?: ReactNode; rows: { label: string; value: ReactNode; swatch?: string }[] }) {
  return (
    <div className="min-w-36 rounded-lg bg-tooltip px-3 py-2.5 text-xs text-tooltip-text shadow-xl">
      {title && <p className="mb-1.5 font-medium opacity-70">{title}</p>}
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="flex items-center gap-1.5 opacity-80">
              {r.swatch && <span className="size-2 rounded-[2px]" style={{ background: r.swatch }} aria-hidden />}
              {r.label}
            </dt>
            <dd className="text-right font-mono font-semibold tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A coloured square + label + mono count, as in chart legends. */
export function LegendItem({ color, label, value }: { color: string; label: string; value?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
      {label}
      {value !== undefined && <span className="font-mono font-semibold text-text tabular-nums">{value}</span>}
    </span>
  );
}
