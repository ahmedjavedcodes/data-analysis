"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { FeaturesSection } from "@/components/analysis/features-section";
import { InsightDonut } from "@/components/analysis/insight-donut";
import { KpiRow } from "@/components/analysis/kpi-row";
import { ProductHeader } from "@/components/analysis/product-header";
import { ReviewFeed } from "@/components/analysis/review-feed";
import { TermBars } from "@/components/analysis/term-bars";
import { TrendChart } from "@/components/analysis/trend-chart";
import { Panel } from "@/components/ui/panel";
import type { AnalysisResult } from "@/lib/schemas";
import { fmtDate } from "@/lib/scale";

export function runNotices(data: AnalysisResult): string[] {
  const notices: string[] = [];
  if (data.stats.partial) notices.push("Daraz limited how many reviews we could collect, so this covers part of the reviews.");
  if (data.stats.used_fallback_features) {
    notices.push("We couldn't identify product-specific features, so general features are shown.");
  }
  const n = data.stats.unprocessed_reviews;
  if (n > 0) notices.push(`${n} review${n === 1 ? "" : "s"} couldn't be analysed and ${n === 1 ? "is" : "are"} left out of the sentiment figures.`);
  return notices;
}

export function Dashboard({ data, completedInSeconds }: { data: AnalysisResult; completedInSeconds?: number }) {
  // Shared by the feature matrix and the review feed: picking a feature filters the reviews.
  const [feature, setFeature] = useState<string | null>(null);
  const selectFeature = (name: string | null) => {
    setFeature(name);
    if (name) document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const maxLevel = data.scale.max_level;

  return (
    <div className="space-y-6">
      <ProductHeader
        product={{ ...data.product, category_breadcrumb: data.product.category_breadcrumb || data.product.product_category }}
        subtitle={`${data.stats.reviews_scored} reviews analysed · collected ${fmtDate(data.scraped_at)}`}
        notices={runNotices(data)}
      >
        {completedInSeconds !== undefined && (
          <p className="inline-flex animate-fade-up items-center gap-2 rounded-full bg-pos-soft px-3 py-1 text-sm text-pos-ink">
            <CheckCircle2 className="size-4" aria-hidden />
            Analysis complete in <span className="font-mono tabular-nums">{completedInSeconds}s</span>
          </p>
        )}
      </ProductHeader>

      <FeaturesSection features={data.features} levelLabels={data.scale.labels} selected={feature} onSelect={selectFeature} />

      <KpiRow
        netSentiment={data.net_sentiment}
        avgScore={data.avg_score}
        sentiment={data.sentiment}
        scoredCount={data.stats.reviews_scored}
        unprocessed={data.stats.unprocessed_reviews}
        maxLevel={maxLevel}
        ratingCount={data.product.rating_count}
        recency={data.recency}
        trend={data.trend}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Quick insight" description="Overall mood, and which features draw complaints or praise.">
          <InsightDonut sentiment={data.sentiment} features={data.features} />
        </Panel>
        <Panel
          title="Common themes"
          description="Words used in two or more reviews, coloured by how those reviews feel."
          className="lg:col-span-2"
        >
          <TermBars terms={data.terms} maxLevel={maxLevel} />
        </Panel>
      </div>

      <Panel title="Mood over time" description="Monthly reviews by sentiment, or the average sentiment against the stars given.">
        <TrendChart trend={data.trend} maxLevel={maxLevel} />
      </Panel>

      <ReviewFeed
        reviews={data.reviews}
        featureNames={data.features.map((f) => f.name)}
        scale={data.scale}
        feature={feature}
        onFeatureChange={setFeature}
      />

      <p className="font-mono text-xs text-subtle">
        Analysis {data.run_id} · {new Date(data.generated_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </p>
    </div>
  );
}
