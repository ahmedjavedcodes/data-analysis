import { Suspense } from "react";

import { AnalyzeForm } from "@/components/analysis/analyze-form";
import { RunList } from "@/components/analysis/run-list";
import { cardClass } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, listRuns } from "@/lib/api";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/copy";

export default function Home() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs text-muted">Analyses</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted">
          See what buyers think of any Daraz.pk product, feature by feature, and whether the mood is shifting.
        </p>
      </header>

      <section className={cn(cardClass, "p-6")} aria-label="Analyse a product">
        <AnalyzeForm />
        <p className="text-xs text-subtle">
          Every review is read by AI and scored Negative, Neutral or Positive, overall and for each feature buyers mention.
        </p>
      </section>

      <section aria-labelledby="recent-title" className="space-y-3">
        <h2 id="recent-title" className="text-[15px] font-semibold tracking-tight">
          Analysed products
        </h2>
        <Suspense fallback={<Skeleton className="h-24 w-full rounded-xl" />}>
          <RecentRuns />
        </Suspense>
      </section>
    </div>
  );
}

async function RecentRuns() {
  const result = await listRuns().then(
    (runs) => ({ runs }),
    (err: unknown) => ({ code: err instanceof ApiError ? err.code : "INTERNAL_ERROR" }),
  );
  if ("code" in result) {
    return <p className="text-sm text-muted">{errorMessage(result.code)}</p>;
  }
  return <RunList runs={result.runs} />;
}
