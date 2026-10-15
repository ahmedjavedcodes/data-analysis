"use client";

import { useState } from "react";
import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ChartTooltip, LegendItem, Segmented } from "@/components/ui/controls";
import type { FeatureInsight, SentimentCounts } from "@/lib/schemas";
import { fmtPct } from "@/lib/scale";

type Tab = "mix" | "pain" | "highlights";
type Slice = { name: string; value: number; fill: string };

// Categorical colours for features; sentiment colours stay reserved for the sentiment mix.
const FEATURE_COLORS = ["var(--accent)", "var(--star)", "var(--neu)", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b", "#f97316"];

const TABS: { value: Tab; label: string }[] = [
  { value: "mix", label: "Sentiment mix" },
  { value: "pain", label: "Pain points" },
  { value: "highlights", label: "Highlights" },
];

function featureSlices(features: FeatureInsight[], pick: (f: FeatureInsight) => number): Slice[] {
  return features
    .filter((f) => f.name !== "Overall")
    .map((f) => ({ name: f.name, value: pick(f) }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, fill: FEATURE_COLORS[i % FEATURE_COLORS.length]! }));
}

/** One donut, three readings: overall sentiment, where the complaints are, where the praise is. */
export function InsightDonut({ sentiment, features, live = false }: { sentiment: SentimentCounts; features: FeatureInsight[]; live?: boolean }) {
  const [tab, setTab] = useState<Tab>("mix");

  const views: Record<Tab, { slices: Slice[]; caption: string; empty: string }> = {
    mix: {
      slices: [
        { name: "Positive", value: sentiment.positive, fill: "var(--pos)" },
        { name: "Neutral", value: sentiment.neutral, fill: "var(--neu)" },
        { name: "Negative", value: sentiment.negative, fill: "var(--neg)" },
      ].filter((s) => s.value > 0),
      caption: "reviews analysed",
      empty: "No reviews analysed yet.",
    },
    pain: {
      slices: featureSlices(features, (f) => f.sentiment.negative),
      caption: "negative feature mentions",
      empty: "No feature has a negative mention.",
    },
    highlights: {
      slices: featureSlices(features, (f) => f.sentiment.positive),
      caption: "positive feature mentions",
      empty: "No feature has a positive mention yet.",
    },
  };
  const view = views[tab];
  const total = view.slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex h-full flex-col">
      <Segmented options={TABS} value={tab} onChange={setTab} label="Insight view" className="self-start" />
      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center py-12 text-sm text-muted">{view.empty}</p>
      ) : (
        <>
          <figure
            className="relative mx-auto mt-5 size-52"
            aria-label={view.slices.map((s) => `${s.name} ${s.value}`).join(", ")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[{ name: "track", value: 1, fill: "var(--surface-2)" }]}
                  dataKey="value"
                  innerRadius="70%"
                  outerRadius="100%"
                  stroke="none"
                  isAnimationActive={false}
                />
                <Pie
                  data={view.slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="70%"
                  outerRadius="100%"
                  paddingAngle={view.slices.length > 1 ? 2 : 0}
                  cornerRadius={6}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={!live}
                  animationDuration={700}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    const s = payload?.[0]?.payload as Slice | undefined;
                    if (!active || !s || s.name === "track") return null;
                    return <ChartTooltip rows={[{ label: s.name, value: `${s.value} · ${fmtPct(s.value / total)}`, swatch: s.fill }]} />;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">{total.toLocaleString()}</span>
              <span className="max-w-28 text-xs text-muted">{view.caption}</span>
            </figcaption>
          </figure>
          <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {view.slices.map((s) => (
              <LegendItem key={s.name} color={s.fill} label={s.name} value={s.value} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
