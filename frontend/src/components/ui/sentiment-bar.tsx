import { cn } from "@/lib/cn";
import type { SentimentCounts } from "@/lib/schemas";

/** Stacked positive / neutral / negative bar. Widths are data, hence the inline style. */
export function SentimentBar({ counts, className }: { counts: SentimentCounts; className?: string }) {
  const total = counts.positive + counts.neutral + counts.negative;
  const label = `${counts.positive} positive, ${counts.neutral} neutral, ${counts.negative} negative`;
  if (total === 0) {
    return <div className={cn("h-1.5 rounded-full bg-surface-2", className)} role="img" aria-label="No scored reviews" />;
  }
  return (
    <div className={cn("flex h-1.5 gap-px overflow-hidden rounded-full", className)} role="img" aria-label={label}>
      {counts.positive > 0 && <span className="bg-pos" style={{ width: `${(counts.positive / total) * 100}%` }} />}
      {counts.neutral > 0 && <span className="bg-neu" style={{ width: `${(counts.neutral / total) * 100}%` }} />}
      {counts.negative > 0 && <span className="bg-neg" style={{ width: `${(counts.negative / total) * 100}%` }} />}
    </div>
  );
}
