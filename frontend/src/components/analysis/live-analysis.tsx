"use client";

import Link from "next/link";
import { useEffect, useReducer, useRef, useState } from "react";

import { Dashboard } from "@/components/analysis/dashboard";
import { FeaturesSection } from "@/components/analysis/features-section";
import { KpiRow } from "@/components/analysis/kpi-row";
import { ProductHeader } from "@/components/analysis/product-header";
import { ProgressTracker } from "@/components/analysis/progress-tracker";
import { InsightDonut } from "@/components/analysis/insight-donut";
import { Panel } from "@/components/ui/panel";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Skeleton, SkeletonPanel } from "@/components/ui/skeleton";
import { Stars } from "@/components/ui/stars";
import { analysisStreamUrl } from "@/lib/api";
import { errorMessage } from "@/lib/copy";
import { EVENT_NAMES, INITIAL_STATE, liveSummary, parseEvent, reduceStream, type LiveState } from "@/lib/stream";

const TICKER_SIZE = 6;

function useAnalysisStream(productUrl: string) {
  const [state, dispatch] = useReducer(reduceStream, INITIAL_STATE);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    // A finished analysis must not start another one when this view is shown again.
    if (finished.current) return;
    const source = new EventSource(analysisStreamUrl(productUrl));
    source.onopen = () => setStartedAt((t) => t ?? Date.now());
    for (const name of EVENT_NAMES) {
      source.addEventListener(name, (event: MessageEvent<string>) => {
        const parsed = parseEvent(name, event.data);
        if (!parsed) return;
        dispatch(parsed);
        if (name === "done" || name === "failed") {
          finished.current = true;
          setFinishedAt(Date.now());
          source.close();
        }
      });
    }
    // EventSource would silently reconnect (and start a new analysis); treat any drop as final.
    source.onerror = () => {
      source.close();
      finished.current = true;
      setFinishedAt(Date.now());
      dispatch({ type: "lost" });
    };
    return () => source.close();
  }, [productUrl]);

  return { state, startedAt, finishedAt };
}

function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function LiveAnalysis({ productUrl }: { productUrl: string }) {
  const { state, startedAt, finishedAt } = useAnalysisStream(productUrl);
  const now = useNow(finishedAt === null);
  const end = finishedAt ?? now;
  const elapsed = startedAt && end ? Math.max(0, Math.round((end - startedAt) / 1000)) : 0;

  useEffect(() => {
    // Give the finished analysis its permanent address without reloading the page.
    if (state.result) window.history.replaceState(null, "", `/runs/${encodeURIComponent(state.result.run_id)}`);
  }, [state.result]);

  if (state.status === "done" && state.result) {
    return <Dashboard data={state.result} completedInSeconds={elapsed} />;
  }
  return <LiveView state={state} elapsed={elapsed} />;
}

function LiveView({ state, elapsed }: { state: LiveState; elapsed: number }) {
  const summary = liveSummary(state);
  const tracker = <ProgressTracker state={state} progress={summary.progress} elapsed={elapsed} />;
  const scoring = summary.scoredCount > 0;

  return (
    <div className="space-y-6">
      {state.product ? (
        <ProductHeader product={state.product} subtitle="Analysis in progress">
          {tracker}
        </ProductHeader>
      ) : (
        <div className="space-y-4" aria-busy aria-label="Loading product">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-8 w-full max-w-xl" />
          <Skeleton className="h-5 w-72" />
          {tracker}
        </div>
      )}

      {state.status === "failed" && state.error && (
        <div role="alert" className="animate-fade-up rounded-xl border border-neg/30 bg-neg-soft p-6">
          <p className="font-semibold text-neg-ink">The analysis stopped.</p>
          <p className="mt-1 text-sm text-text">{errorMessage(state.error.code, state.error.message)}</p>
          <div className="mt-4 flex gap-3 text-sm">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-ink px-3 py-1.5 font-medium text-ink-text hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Try again
            </button>
            <Link href="/" className="rounded-lg px-3 py-1.5 text-muted hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-ring">
              Use a different link
            </Link>
          </div>
        </div>
      )}

      {state.categories ? (
        <FeaturesSection features={summary.features} levelLabels={summary.levelLabels} selected={null} live />
      ) : (
        <SkeletonPanel title="Smart Feature Analysis" note="Identifying the features buyers care about…" height="h-72" />
      )}

      {scoring ? (
        <KpiRow
          netSentiment={summary.netSentiment}
          avgScore={summary.avgScore}
          sentiment={summary.sentiment}
          scoredCount={summary.scoredCount}
          unprocessed={0}
          maxLevel={summary.maxLevel}
          ratingCount={state.product?.rating_count ?? null}
          recency={null}
          trend={null}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonPanel title="Overall sentiment" height="h-48" />
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            {["Reviews analysed", "AI sentiment score", "Recent mood", "Sentiment breakdown"].map((t) => (
              <SkeletonPanel key={t} title={t} height="h-14" />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {scoring ? (
          <Panel title="Quick insight" description="Filling in as each review is read.">
            <InsightDonut sentiment={summary.sentiment} features={summary.features} live />
          </Panel>
        ) : (
          <SkeletonPanel title="Quick insight" height="h-56" />
        )}
        <SkeletonPanel title="Common themes" note="Appears once insights are compiled." height="h-56" className="lg:col-span-2" />
      </div>

      <SkeletonPanel title="Mood over time" note="Appears once insights are compiled." height="h-64" />

      {scoring ? <Ticker state={state} maxLevel={summary.maxLevel} labels={summary.levelLabels} /> : <SkeletonPanel title="Reviews" height="h-40" />}
    </div>
  );
}

/** The most recently read reviews, newest first, so there is always something real to look at. */
function Ticker({ state, maxLevel, labels }: { state: LiveState; maxLevel: number; labels: string[] }) {
  const latest = state.scored.slice(-TICKER_SIZE).reverse();
  return (
    <Panel title="Reviews being read" description={`${state.scored.length} of ${state.total} so far. The full, searchable list appears when the analysis finishes.`}>
      <ol className="space-y-2" aria-live="polite">
        {latest.map((r) => (
          <li key={r.review_id} className="animate-fade-up rounded-lg bg-surface-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <Stars rating={r.rating} />
              <ScoreBadge score={r.score} maxLevel={maxLevel} label={r.level == null ? null : labels[r.level]} prefix="AI" />
              {r.features.map((f) => (
                <span key={f.name} className="text-xs text-muted">
                  {f.name}
                </span>
              ))}
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm">{r.text}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
