"use client";

import { Search, ThumbsUp, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { Panel } from "@/components/ui/panel";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Stars } from "@/components/ui/stars";
import { cn } from "@/lib/cn";
import { reviewMismatch } from "@/lib/insights";
import type { Review, ScoreScale, Sentiment } from "@/lib/schemas";
import { fmtDate, fmtScore, scoreTone, SENTIMENT_LABEL, TONE_CHIP } from "@/lib/scale";

type SentimentFilter = "all" | Sentiment;
type SortKey = "lowest" | "newest" | "helpful";

const PAGE = 20;

const SORTS: Record<SortKey, { label: string; compare: (a: Review, b: Review) => number }> = {
  lowest: {
    label: "Lowest sentiment first",
    compare: (a, b) => (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY),
  },
  newest: {
    label: "Newest first",
    compare: (a, b) => (b.review_date ?? "").localeCompare(a.review_date ?? ""),
  },
  helpful: { label: "Most helpful first", compare: (a, b) => b.helpful_count - a.helpful_count },
};

type Props = {
  reviews: Review[];
  featureNames: string[];
  scale: ScoreScale;
  feature: string | null;
  onFeatureChange: (name: string | null) => void;
};

export function ReviewFeed({ reviews, featureNames, scale, feature, onFeatureChange }: Props) {
  const [query, setQuery] = useState("");
  const [sentiment, setSentiment] = useState<SentimentFilter>("all");
  const [sort, setSort] = useState<SortKey>("lowest");
  const [mismatchOnly, setMismatchOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return reviews
      .filter((r) => {
        if (q && !r.text.toLowerCase().includes(q)) return false;
        if (sentiment !== "all" && r.sentiment !== sentiment) return false;
        if (mismatchOnly && reviewMismatch(r, scale.max_level) === null) return false;
        if (feature === "Overall") return r.features.length === 0;
        if (feature && !r.features.some((f) => f.name === feature)) return false;
        return true;
      })
      .sort((a, b) => {
        // With a feature selected, rank by how the review feels about that feature.
        if (feature && feature !== "Overall" && sort === "lowest") {
          const fa = a.features.find((f) => f.name === feature)?.score ?? Number.POSITIVE_INFINITY;
          const fb = b.features.find((f) => f.name === feature)?.score ?? Number.POSITIVE_INFINITY;
          return fa - fb;
        }
        return SORTS[sort].compare(a, b);
      });
  }, [reviews, deferredQuery, sentiment, mismatchOnly, feature, sort, scale.max_level]);

  const shown = filtered.slice(0, limit);
  const hasFilters = query !== "" || sentiment !== "all" || mismatchOnly || feature !== null;

  return (
    <Panel
      id="reviews"
      title="Reviews"
      description="Every review, pairing the stars the buyer clicked with what their words actually say."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search review text</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search reviews (e.g. packaging, taste)"
            className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-8 text-sm placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
        </label>

        <fieldset className="flex rounded-lg bg-surface-2 p-1" aria-label="Filter by sentiment">
          {(["all", "negative", "neutral", "positive"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sentiment === s}
              onClick={() => {
                setSentiment(s);
                setLimit(PAGE);
              }}
              className={cn(
                "h-7 rounded-md px-3 text-xs font-medium text-muted transition-all hover:text-text focus-visible:outline-2 focus-visible:outline-ring",
                sentiment === s && "bg-surface text-text shadow-sm",
              )}
            >
              {s === "all" ? "All" : SENTIMENT_LABEL[s]}
            </button>
          ))}
        </fieldset>

        <Select
          label="Feature"
          value={feature ?? ""}
          onChange={(v) => {
            onFeatureChange(v || null);
            setLimit(PAGE);
          }}
          options={[
            { value: "", label: "All features" },
            ...featureNames.map((n) => ({ value: n, label: n === "Overall" ? "General comments" : n })),
          ]}
        />
        <Select
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v as SortKey)}
          options={Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }))}
        />

        <label className="flex h-9 items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={mismatchOnly}
            onChange={(e) => {
              setMismatchOnly(e.target.checked);
              setLimit(PAGE);
            }}
            className="size-3.5 accent-[var(--ink)]"
          />
          Stars and words disagree
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted" aria-live="polite">
        <span>
          {filtered.length === reviews.length
            ? `${reviews.length} reviews`
            : `${filtered.length} of ${reviews.length} reviews`}
          {feature && ` mentioning ${feature === "Overall" ? "no specific feature" : feature}`}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSentiment("all");
              setMismatchOnly(false);
              onFeatureChange(null);
              setLimit(PAGE);
            }}
            className="inline-flex items-center gap-1 hover:text-text focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-3" aria-hidden />
            Clear filters
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No reviews match these filters.</p>
      ) : (
        <ol className="mt-2 divide-y divide-border">
          {shown.map((r) => (
            <ReviewItem key={r.review_id} review={r} scale={scale} highlight={feature} />
          ))}
        </ol>
      )}

      {filtered.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="mt-3 w-full rounded-lg border border-border py-2 text-sm text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-ring"
        >
          Show {Math.min(PAGE, filtered.length - shown.length)} more
        </button>
      )}
    </Panel>
  );
}

function ReviewItem({ review, scale, highlight }: { review: Review; scale: ScoreScale; highlight: string | null }) {
  const mismatch = reviewMismatch(review, scale.max_level);
  const label = review.level == null ? null : (scale.labels[review.level] ?? null);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={review.rating} />
        <ScoreBadge score={review.score} maxLevel={scale.max_level} label={label} prefix="AI" />
        {mismatch && (
          <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">
            {mismatch === "words-worse"
              ? `${review.rating}★ but the words read ${label ?? "negative"}`
              : `${review.rating}★ but the words read ${label ?? "positive"}`}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-subtle tabular-nums">
          {review.helpful_count > 0 && (
            <span className="inline-flex items-center gap-1" title="Marked helpful">
              <ThumbsUp className="size-3" aria-hidden />
              {review.helpful_count}
            </span>
          )}
          <time dateTime={review.review_date ?? undefined}>{fmtDate(review.review_date)}</time>
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line">{review.text}</p>
      {review.features.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Features mentioned">
          {review.features.map((f) => (
            <li
              key={f.name}
              className={cn(
                "rounded-md px-2 py-0.5 font-mono text-[11px] tabular-nums",
                TONE_CHIP[scoreTone(f.score, scale.max_level)],
                highlight === f.name && "ring-1 ring-current",
              )}
            >
              {f.name} {fmtScore(f.score)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-subtle">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
