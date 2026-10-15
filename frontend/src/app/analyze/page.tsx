import { Suspense } from "react";

import { LiveAnalysisFromQuery } from "@/components/analysis/live-analysis-from-query";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4" aria-busy aria-label="Starting analysis">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-full max-w-xl" />
          <Skeleton className="h-32 w-full" />
        </div>
      }
    >
      <LiveAnalysisFromQuery />
    </Suspense>
  );
}
