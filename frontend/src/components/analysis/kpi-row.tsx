"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { DeltaChip } from "@/components/ui/controls";
import { Card } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/cn";
import { SCORE_NAME } from "@/lib/copy";
import { MIN_RECENT_REVIEWS, moodDelta, moodVerdict } from "@/lib/insights";
import type { RecencyWindow, SentimentCounts, TrendPoint } from "@/lib/schemas";
import { fmtNet, fmtPct, fmtScore, scoreTone, TONE_TEXT } from "@/lib/scale";

export type KpiInput = {
  netSentiment: number | null;
  avgScore: number | null;
  sentiment: SentimentCounts;
  scoredCount: number;
  unprocessed: number;
  maxLevel: number;
  /** Ratings shown on Daraz, for "78 of 169". */
  ratingCount: number | null;
  /** Only known once insights are compiled. */
  recency: RecencyWindow[] | null;
  trend: TrendPoint[] | null;
};

const LAST_MONTHS = 12;
const fmtInt = (v: number | null) => (v == null ? "–" : Math.round(v).toLocaleString());

/** Recent window (30 or 90 days, whichever has enough reviews) against all time. */
function recentVsAll(recency: RecencyWindow[] | null, maxLevel: number) {
  if (!recency) return null;
  const verdict = moodVerdict(recency, maxLevel);
  const all = recency.find((w) => w.days === null);
  if (!verdict.window || !all) return null;
  return { window: verdict.window, all, verdict };
}

export function KpiRow(props: KpiInput) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <OverallCard {...props} />
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
        <ReviewsCard {...props} />
        <ScoreCard {...props} />
        <MoodCard {...props} />
        <BreakdownCard {...props} />
      </div>
    </div>
  );
}

function SmallCard({ title, children, spark }: { title: string; children: ReactNode; spark?: ReactNode }) {
  return (
    <Card label={title} className="flex flex-col p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="mt-3 flex flex-1 items-end justify-between gap-4">
        <div className="min-w-0">{children}</div>
        {spark && <div className="w-24 shrink-0 sm:w-28">{spark}</div>}
      </div>
    </Card>
  );
}

function OverallCard({ netSentiment, scoredCount, recency, trend, maxLevel }: KpiInput) {
  const cmp = recentVsAll(recency, maxLevel);
  const monthly = (trend ?? []).slice(-LAST_MONTHS).map((p) => p.net_sentiment);
  const tone = netSentiment == null ? "none" : netSentiment > 0 ? "pos" : netSentiment < 0 ? "neg" : "neu";
  return (
    <Card label="Overall sentiment" className="flex flex-col">
      <h2 className="text-sm font-medium">Overall sentiment</h2>
      <div className="mt-4 h-28">
        {trend ? (
          <Sparkline
            values={monthly}
            domain={[-100, 100]}
            color={netSentiment != null && netSentiment < 0 ? "var(--neg)" : "var(--pos)"}
            label="Net sentiment by month, last 12 months"
            height="h-28"
          />
        ) : (
          <Skeleton className="h-full w-full" />
        )}
      </div>
      <div className="mt-auto pt-5">
        <div className="flex items-baseline gap-2">
          <AnimatedNumber
            value={netSentiment}
            format={fmtNet}
            className={cn("font-mono text-5xl font-semibold tracking-tight tabular-nums", TONE_TEXT[tone])}
          />
          {cmp && (
            <DeltaChip
              value={(cmp.window.net_sentiment ?? 0) - (cmp.all.net_sentiment ?? 0)}
              format={(v) => `${Math.round(v)}`}
              title={`Last ${cmp.window.days} days vs all time`}
            />
          )}
        </div>
        <p className="mt-2 text-sm text-muted">
          Net sentiment: % positive minus % negative across {scoredCount.toLocaleString()} reviews
          {cmp ? `; change is the last ${cmp.window.days} days vs all time` : ""}.
        </p>
      </div>
    </Card>
  );
}

function ReviewsCard({ scoredCount, ratingCount, unprocessed, trend }: KpiInput) {
  const monthly = (trend ?? []).slice(-LAST_MONTHS).map((p) => p.review_count);
  return (
    <SmallCard
      title="Reviews analysed"
      spark={trend ? <Sparkline values={monthly} domain={[0, Math.max(1, ...monthly)]} color="var(--pos)" label="Reviews per month" /> : <Skeleton className="h-10" />}
    >
      <AnimatedNumber value={scoredCount} format={fmtInt} className="font-mono text-3xl font-semibold tracking-tight tabular-nums" />
      <p className="mt-1 text-xs text-muted">
        {ratingCount ? `with text, of ${ratingCount.toLocaleString()} ratings on Daraz` : "reviews with text"}
        {unprocessed > 0 ? ` · ${unprocessed} not analysed` : ""}
      </p>
    </SmallCard>
  );
}

function ScoreCard({ avgScore, maxLevel, recency, trend }: KpiInput) {
  const cmp = recentVsAll(recency, maxLevel);
  const monthly = (trend ?? []).slice(-LAST_MONTHS).map((p) => p.avg_score);
  return (
    <SmallCard
      title={SCORE_NAME}
      spark={trend ? <Sparkline values={monthly} domain={[0, maxLevel]} color="var(--pos)" label="Average score per month" /> : <Skeleton className="h-10" />}
    >
      <div className="flex items-baseline gap-2">
        <span className={cn("font-mono text-3xl font-semibold tracking-tight tabular-nums", TONE_TEXT[scoreTone(avgScore, maxLevel)])}>
          <AnimatedNumber value={avgScore} format={fmtScore} />
        </span>
        <span className="font-mono text-sm text-subtle">/ {maxLevel}</span>
        {cmp && cmp.window.avg_score != null && cmp.all.avg_score != null && (
          <DeltaChip value={cmp.window.avg_score - cmp.all.avg_score} format={(v) => v.toFixed(2)} title={`Last ${cmp.window.days} days vs all time`} />
        )}
      </div>
      <p className="mt-1 text-xs text-muted">average across all reviews (0 Negative · {maxLevel} Positive)</p>
    </SmallCard>
  );
}

const VERDICT = {
  improving: { label: "Improving", Icon: TrendingUp, tone: "pos" },
  dropping: { label: "Dropping", Icon: TrendingDown, tone: "neg" },
  stable: { label: "Stable", Icon: Minus, tone: "neu" },
  insufficient: { label: "Too few recent", Icon: Minus, tone: "none" },
} as const;

function MoodCard({ recency, maxLevel }: KpiInput) {
  if (!recency) {
    return (
      <SmallCard title="Recent mood">
        <Skeleton className="h-8 w-36" />
        <p className="mt-2 text-xs text-subtle">Appears once review dates are compiled.</p>
      </SmallCard>
    );
  }
  const verdict = moodVerdict(recency, maxLevel);
  const copy = VERDICT[verdict.kind];
  return (
    <SmallCard title="Recent mood">
      <p className={cn("flex items-center gap-2 text-2xl font-semibold tracking-tight", TONE_TEXT[copy.tone])}>
        <copy.Icon className="size-5" aria-hidden />
        {copy.label}
      </p>
      <p className="mt-1 text-xs text-muted">
        {verdict.window && verdict.delta != null
          ? `Last ${verdict.window.days} days vs all time; moves under ±${moodDelta(maxLevel).toFixed(2)} count as stable`
          : `Needs ${MIN_RECENT_REVIEWS}+ reviews in the last 30 or 90 days`}
      </p>
      <dl className="mt-3 flex gap-1.5">
        {[7, 30, 90].map((days) => {
          const w = recency.find((x) => x.days === days);
          const thin = (w?.scored_count ?? 0) < MIN_RECENT_REVIEWS;
          return (
            <div key={days} className="rounded-md bg-surface-2 px-2 py-1 text-center" title={`${w?.scored_count ?? 0} reviews`}>
              <dt className="text-[10px] text-muted">{days}d</dt>
              <dd className={cn("font-mono text-xs font-semibold tabular-nums", thin ? "text-subtle" : TONE_TEXT[scoreTone(w?.avg_score, maxLevel)])}>
                {fmtScore(w?.avg_score)}
              </dd>
            </div>
          );
        })}
      </dl>
    </SmallCard>
  );
}

function BreakdownCard({ sentiment }: KpiInput) {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative;
  const rows = [
    { label: "Positive", count: sentiment.positive, bar: "bg-pos", dot: "var(--pos)" },
    { label: "Neutral", count: sentiment.neutral, bar: "bg-neu", dot: "var(--neu)" },
    { label: "Negative", count: sentiment.negative, bar: "bg-neg", dot: "var(--neg)" },
  ];
  return (
    <SmallCard title="Sentiment breakdown">
      <dl className="flex flex-wrap gap-x-5 gap-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2.5 rounded-[3px]" style={{ background: r.dot }} aria-hidden />
              {r.label}
            </dt>
            <dd className="font-mono text-xl font-semibold tabular-nums">
              <AnimatedNumber value={r.count} format={fmtInt} />
              <span className="ml-1 text-xs font-normal text-subtle">{total ? fmtPct(r.count / total) : ""}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div
        className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${sentiment.positive} positive, ${sentiment.neutral} neutral, ${sentiment.negative} negative`}
      >
        {rows.map((r) => (
          <span key={r.label} className={cn(r.bar, "transition-[width] duration-700 ease-out")} style={{ width: `${total ? (r.count / total) * 100 : 0}%` }} />
        ))}
      </div>
    </SmallCard>
  );
}
