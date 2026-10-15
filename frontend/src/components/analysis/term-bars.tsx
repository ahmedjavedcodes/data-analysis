"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";

import { ChartTooltip, LegendItem } from "@/components/ui/controls";
import type { TermFrequency } from "@/lib/schemas";
import { fmtNet, fmtPct, fmtScore, fmtStars, scoreTone, TONE_COLOR } from "@/lib/scale";

const AXIS = { fill: "var(--chart-axis)", fontSize: 11 };

/** Most common themes; each bar is coloured by the average AI sentiment score of the reviews using the word. */
export function TermBars({ terms, maxLevel }: { terms: TermFrequency[]; maxLevel: number }) {
  const [active, setActive] = useState<number | null>(null);
  if (terms.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">No word appears in two or more reviews.</p>;
  }
  const height = Math.max(180, terms.length * 26 + 16);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        <LegendItem color="var(--pos)" label="Mostly positive" />
        <LegendItem color="var(--neu)" label="Mixed" />
        <LegendItem color="var(--neg)" label="Mostly negative" />
      </div>
      <figure aria-label="Most common themes in reviews, by number of reviews using each word" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={terms}
            layout="vertical"
            margin={{ top: 0, right: 36, bottom: 0, left: 0 }}
            barCategoryGap={6}
            onMouseMove={(state) => setActive(typeof state.activeTooltipIndex === "number" ? state.activeTooltipIndex : null)}
            onMouseLeave={() => setActive(null)}
          >
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="term" width={92} tick={{ ...AXIS, fill: "var(--text)" }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={false}
              content={({ active: on, payload }) => {
                const t = payload?.[0]?.payload as TermFrequency | undefined;
                if (!on || !t) return null;
                return (
                  <ChartTooltip
                    title={`“${t.term}”`}
                    rows={[
                      { label: "Reviews", value: `${t.review_count} · ${fmtPct(t.share)}` },
                      { label: "Sentiment", value: `${fmtScore(t.avg_score)} / ${maxLevel}`, swatch: TONE_COLOR[scoreTone(t.avg_score, maxLevel)] },
                      { label: "Stars", value: `${fmtStars(t.avg_rating)} / 5` },
                      { label: "Net", value: fmtNet(t.net_sentiment) },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="review_count"
              animationDuration={600}
              background={{ fill: "var(--surface-2)", radius: 6 }}
              shape={(props: BarShapeProps) => {
                const term = props.payload as TermFrequency;
                const dim = active !== null && active !== props.index;
                return (
                  <Rectangle
                    {...props}
                    radius={6}
                    fill={TONE_COLOR[scoreTone(term.avg_score, maxLevel)]}
                    fillOpacity={dim ? 0.35 : 0.9}
                    className="transition-[fill-opacity] duration-200"
                  />
                );
              }}
            >
              <LabelList dataKey="review_count" position="right" style={{ fontSize: 11, fill: "var(--muted)", fontFamily: "var(--font-geist-mono)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>
    </div>
  );
}
