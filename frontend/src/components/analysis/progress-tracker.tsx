"use client";

import { Check, LoaderCircle } from "lucide-react";

import { cardClass } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { STAGE_COPY } from "@/lib/copy";
import { STAGES, type LiveState, type Stage } from "@/lib/stream";

function stageDetail(stage: Stage, state: LiveState): string | null {
  switch (stage) {
    case "scraping":
      return state.collected ? `${state.collected} reviews collected` : null;
    case "cleaning":
      return state.cleaned
        ? `${state.cleaned.clean} kept${state.cleaned.dropped ? ` · ${state.cleaned.dropped} duplicates removed` : ""}`
        : null;
    case "categorizing": {
      const n = state.categories?.features.filter((f) => f.name !== "Overall").length;
      return n ? `${n} features identified` : null;
    }
    case "scoring":
      return state.total ? `${state.scored.length} of ${state.total} analysed` : null;
    default:
      return null;
  }
}

/** "AI processing progress": every pipeline step with what it has produced so far. */
export function ProgressTracker({ state, progress, elapsed }: { state: LiveState; progress: number; elapsed: number }) {
  const current = state.stage ? STAGES.indexOf(state.stage) : -1;
  const done = state.status === "done";
  const working = state.stage ? STAGE_COPY[state.stage].working : "Connecting";

  return (
    <section aria-label="AI processing progress" className={cn(cardClass, "p-6")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium" aria-live="polite">
          {done ? "Analysis complete" : `${working}…`}
        </p>
        <p className="font-mono text-xs text-muted tabular-nums">
          {Math.round(progress * 100)}% · {elapsed}s
        </p>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label="AI processing progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(2, progress * 100)}%` }}
        />
      </div>

      <ol className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((stage, i) => {
          const status = done || i < current ? "done" : i === current ? "active" : "pending";
          const detail = stageDetail(stage, state);
          return (
            <li key={stage} className="flex gap-2.5" aria-current={status === "active" ? "step" : undefined}>
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                  status === "done" && "border-transparent bg-pos-soft text-pos-ink",
                  status === "active" && "border-transparent bg-accent-soft text-accent",
                  status === "pending" && "border-border text-subtle",
                )}
                aria-hidden
              >
                {status === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : status === "active" ? (
                  <LoaderCircle className="size-3 animate-spin" strokeWidth={3} />
                ) : (
                  <span className="text-[10px] tabular-nums">{i + 1}</span>
                )}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm", status === "pending" ? "text-subtle" : "font-medium")}>
                  {STAGE_COPY[stage].label}
                </span>
                {detail && <span className="block text-xs text-muted tabular-nums">{detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
