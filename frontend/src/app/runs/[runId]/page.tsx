import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Dashboard } from "@/components/analysis/dashboard";
import { ApiError, getRun } from "@/lib/api";

export default function RunPage({ params }: PageProps<"/runs/[runId]">) {
  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="text-sm text-muted underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        ← All products
      </Link>
      <Suspense fallback={<DashboardSkeleton />}>
        {params.then(({ runId }) => (
          <RunDashboard runId={runId} />
        ))}
      </Suspense>
    </div>
  );
}

async function RunDashboard({ runId }: { runId: string }) {
  const result = await getRun(decodeURIComponent(runId)).then(
    (data) => ({ data }),
    (err: unknown) => ({ err }),
  );
  if ("data" in result) return <Dashboard data={result.data} />;

  if (result.err instanceof ApiError && result.err.code === "RUN_NOT_FOUND") notFound();
  const message = result.err instanceof ApiError ? result.err.message : "Could not load this analysis.";
  return (
    <div role="alert" className="rounded-lg border border-neg/40 bg-neg-soft p-4 text-sm">
      <p className="font-medium text-neg-ink">This analysis could not be loaded.</p>
      <p className="mt-1 text-text">{message}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading analysis">
      <div className="h-20 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-lg border border-border bg-surface" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}
