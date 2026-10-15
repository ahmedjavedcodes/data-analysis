import { Star } from "lucide-react";

import { cn } from "@/lib/cn";

/** Star rating with the number always shown, so meaning never rests on glyphs alone. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)} aria-label={`${rating} out of 5 stars`}>
      <span className="inline-flex text-star" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn("size-3", i <= rating ? "fill-current" : "text-border-strong")} strokeWidth={1.5} />
        ))}
      </span>
      <span className="font-mono text-muted tabular-nums" aria-hidden>
        {rating}/5
      </span>
    </span>
  );
}
