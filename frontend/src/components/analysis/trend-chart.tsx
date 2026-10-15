"use client";

import { useId, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  Rectangle,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type DotItemDotProps,
} from "recharts";

import { ChartTooltip, LegendItem, Segmented } from "@/components/ui/controls";
import type { TrendPoint } from "@/lib/schemas";
import { fmtMonth, fmtNet, fmtScore, fmtStars, scoreTone, thresholds, TONE_COLOR } from "@/lib/scale";

type View = "volume" | "score";

type Row = {
  month: string;
  label: string;
  positive: number;
  neutral: number;
  negative: number;
  n: number;
  avg_score: number | null;
  avg_rating: number | null;
  net: number | null;
};

const AXIS = { fill: "var(--chart-axis)", fontSize: 11 };
const BRUSH_FROM = 13;
const SEGMENTS = [
  { key: "negative", label: "Negative", color: "var(--neg)" },
  { key: "neutral", label: "Neutral", color: "var(--neu)" },
  { key: "positive", label: "Positive", color: "var(--pos)" },
] as const;

function MonthTooltip({ row, maxLevel }: { row: Row; maxLevel: number }) {
  if (row.n === 0) return <ChartTooltip title={fmtMonth(row.month)} rows={[{ label: "Reviews", value: "0" }]} />;
  return (
    <ChartTooltip
      title={fmtMonth(row.month)}
      rows={[
        { label: "Positive", value: row.positive, swatch: "var(--pos)" },
        { label: "Neutral", value: row.neutral, swatch: "var(--neu)" },
        { label: "Negative", value: row.negative, swatch: "var(--neg)" },
        { label: "Sentiment", value: `${fmtScore(row.avg_score)} / ${maxLevel}` },
        { label: "Stars", value: `${fmtStars(row.avg_rating)} / 5` },
        { label: "Net", value: fmtNet(row.net) },
      ]}
    />
  );
}

/** The dashed average line's label: a small dark pill, as in the tooltips. */
function AvgLabel({ viewBox, text }: { viewBox?: { x?: number; y?: number; width?: number }; text: string }) {
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) - 4;
  const y = viewBox?.y ?? 0;
  const w = text.length * 6.2 + 14;
  return (
    <g>
      <rect x={x - w} y={y - 20} width={w} height={18} rx={5} fill="var(--tooltip-bg)" />
      <text x={x - w / 2} y={y - 8} textAnchor="middle" fontSize={10.5} fill="var(--tooltip-text)" fontFamily="var(--font-geist-mono)">
        {text}
      </text>
    </g>
  );
}

export function TrendChart({ trend, maxLevel }: { trend: TrendPoint[]; maxLevel: number }) {
  const [view, setView] = useState<View>("volume");
  const gradientId = useId();
  const rows: Row[] = trend.map((p) => ({
    month: p.month,
    label: fmtMonth(p.month),
    positive: p.sentiment.positive,
    neutral: p.sentiment.neutral,
    negative: p.sentiment.negative,
    n: p.scored_count,
    avg_score: p.avg_score,
    avg_rating: p.avg_rating,
    net: p.net_sentiment,
  }));
  // Matched by label, not index: with the brush showing a window, bar indexes are offsets into it.
  const latestLabel = rows.findLast((r) => r.n > 0)?.label ?? null;
  const [hovered, setHovered] = useState<string | null>(null);
  const active = hovered ?? latestLabel;

  if (rows.length < 2) {
    return <p className="py-10 text-center text-sm text-muted">Not enough dated reviews to draw a trend.</p>;
  }
  const totals = SEGMENTS.map((s) => rows.reduce((sum, r) => sum + r[s.key], 0));
  const avgPerMonth = rows.reduce((sum, r) => sum + r.n, 0) / rows.length;
  const startIndex = rows.length > BRUSH_FROM ? rows.length - 12 : undefined;
  const t = thresholds(maxLevel);
  const scoreTicks = Array.from({ length: maxLevel + 1 }, (_, i) => i);
  const hover = {
    onMouseMove: (state: { activeLabel?: string | number }) =>
      setHovered(state.activeLabel == null ? null : String(state.activeLabel)),
    onMouseLeave: () => setHovered(null),
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {view === "volume" ? (
            [...SEGMENTS].reverse().map((s) => (
              <LegendItem key={s.key} color={s.color} label={s.label} value={totals[SEGMENTS.indexOf(s)]} />
            ))
          ) : (
            <>
              <LegendItem color="var(--accent)" label="Sentiment (what they wrote)" />
              <LegendItem color="var(--chart-secondary)" label="Stars (what they clicked)" />
            </>
          )}
        </div>
        <Segmented
          options={[
            { value: "volume", label: "Reviews" },
            { value: "score", label: "Score" },
          ]}
          value={view}
          onChange={setView}
          label="Trend view"
        />
      </div>

      <figure className="h-80" aria-label={`Monthly reviews and sentiment, ${rows[0]?.label} to ${rows.at(-1)?.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          {view === "volume" ? (
            <BarChart data={rows} margin={{ top: 24, right: 8, bottom: 0, left: -16 }} barCategoryGap="22%" {...hover}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={false}
                content={({ active: on, payload }) => {
                  const row = payload?.[0]?.payload as Row | undefined;
                  return on && row ? <MonthTooltip row={row} maxLevel={maxLevel} /> : null;
                }}
              />
              <ReferenceLine
                y={avgPerMonth}
                stroke="var(--muted)"
                strokeDasharray="5 5"
                label={<AvgLabel text={`Avg ${avgPerMonth.toFixed(1)}/mo`} />}
              />
              {SEGMENTS.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="sentiment"
                  animationDuration={600}
                  shape={(props: BarShapeProps) => (
                    <Rectangle
                      {...props}
                      radius={i === SEGMENTS.length - 1 ? [5, 5, 0, 0] : i === 0 ? [0, 0, 5, 5] : 0}
                      fill={(props.payload as Row).label === active ? s.color : "var(--bar-idle)"}
                      className="transition-[fill] duration-300"
                    />
                  )}
                />
              ))}
              {startIndex !== undefined && (
                <Brush dataKey="label" height={20} startIndex={startIndex} stroke="var(--border-strong)" fill="var(--surface)" travellerWidth={8} />
              )}
            </BarChart>
          ) : (
            <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: -16 }} {...hover}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis yAxisId="score" domain={[0, maxLevel]} ticks={scoreTicks} tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis yAxisId="stars" orientation="right" domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS} tickLine={false} axisLine={false} />
              <ReferenceLine yAxisId="score" y={t.positive} stroke="var(--pos)" strokeOpacity={0.45} strokeDasharray="3 4" />
              <ReferenceLine yAxisId="score" y={t.negative} stroke="var(--neg)" strokeOpacity={0.45} strokeDasharray="3 4" />
              <Tooltip
                cursor={{ stroke: "var(--border-strong)", strokeDasharray: "3 3" }}
                content={({ active: on, payload }) => {
                  const row = payload?.[0]?.payload as Row | undefined;
                  return on && row ? <MonthTooltip row={row} maxLevel={maxLevel} /> : null;
                }}
              />
              <Area
                yAxisId="score"
                type="monotone"
                dataKey="avg_score"
                name="Sentiment"
                stroke="var(--accent)"
                strokeWidth={2.25}
                fill={`url(#${gradientId})`}
                dot={(props: DotItemDotProps) => {
                  const row = props.payload as Row | undefined;
                  if (props.cx == null || props.cy == null || row?.avg_score == null) return <g key={props.index} />;
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={2.5 + Math.sqrt(row.n) * 1.4}
                      fill={TONE_COLOR[scoreTone(row.avg_score, maxLevel)]}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={false}
                connectNulls={false}
                animationDuration={700}
              />
              <Line
                yAxisId="stars"
                type="monotone"
                dataKey="avg_rating"
                name="Stars"
                stroke="var(--chart-secondary)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                connectNulls={false}
                animationDuration={700}
              />
              {startIndex !== undefined && (
                <Brush dataKey="label" height={20} startIndex={startIndex} stroke="var(--border-strong)" fill="var(--surface)" travellerWidth={8} />
              )}
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </figure>
      <p className="mt-3 text-xs text-muted">
        {view === "volume"
          ? "Hover a month to see its mix; the highlighted month defaults to the latest one with reviews."
          : `Dot size is the number of reviews that month; dotted lines mark the Positive (${t.positive}) and Negative (${t.negative}) boundaries; gaps are months without reviews.`}
      </p>
    </div>
  );
}
