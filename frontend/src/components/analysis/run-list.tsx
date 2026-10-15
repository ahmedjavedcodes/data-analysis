"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { cardClass } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import type { RunSummary } from "@/lib/schemas";
import { fmtDate, fmtNet, fmtScore, scoreTone, TONE_TEXT } from "@/lib/scale";

/** Previously analysed products, searchable by name or category. */
export function RunList({ runs }: { runs: RunSummary[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? runs.filter((r) => `${r.product_name} ${r.product_category}`.toLowerCase().includes(q)) : runs;

  if (runs.length === 0) {
    return <p className="text-sm text-muted">No products analysed yet. Paste a link above to start.</p>;
  }

  return (
    <div className="space-y-3">
      <label className="relative block max-w-sm">
        <span className="sr-only">Search analysed products</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search analysed products"
          className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-8 text-sm placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
      </label>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">No analysed product matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className={cn(cardClass, "divide-y divide-border overflow-hidden")}>
          {shown.map((r) => (
            <li key={r.run_id}>
              <Link
                href={`/runs/${encodeURIComponent(r.run_id)}`}
                className="group grid gap-x-6 gap-y-1 px-5 py-4 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{r.product_name}</span>
                  <span className="text-xs text-muted">
                    {r.product_category} · {fmtDate(r.scraped_at)}
                  </span>
                </span>
                <Figure label="Reviews" value={r.reviews_scored.toLocaleString()} />
                <Figure
                  label="Sentiment"
                  value={`${fmtScore(r.avg_score)} / ${r.max_level}`}
                  className={TONE_TEXT[scoreTone(r.avg_score, r.max_level)]}
                />
                <Figure label="Net" value={fmtNet(r.net_sentiment)} />
                <ChevronRight className="hidden size-4 text-subtle transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 text-sm sm:flex-col sm:items-end sm:gap-0">
      <span className="text-[11px] text-subtle">{label}</span>
      <span className={cn("font-mono font-semibold tabular-nums", className)}>{value}</span>
    </span>
  );
}
