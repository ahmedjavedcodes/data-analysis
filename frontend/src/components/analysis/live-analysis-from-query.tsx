"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { LiveAnalysis } from "@/components/analysis/live-analysis";
import { checkDarazUrl } from "@/lib/daraz-url";

/** Reads ?url= and starts a live analysis; keyed by URL so a new link starts fresh. */
export function LiveAnalysisFromQuery() {
  const param = useSearchParams().get("url");
  // When the analysis finishes, the address becomes /runs/<id> (history.replaceState), and
  // Next syncs useSearchParams to it, so ?url= disappears. Keep the link this view started with.
  const [url, setUrl] = useState(param);
  if (param && param !== url) setUrl(param);

  const check = checkDarazUrl(url ?? "");
  if (!check.ok) {
    return (
      <div className="max-w-xl space-y-2 py-10">
        <h1 className="text-lg font-semibold">Nothing to analyse</h1>
        <p className="text-sm text-muted">{check.message}</p>
        <Link href="/" className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
          Paste a product link
        </Link>
      </div>
    );
  }
  return <LiveAnalysis key={check.url} productUrl={check.url} />;
}
