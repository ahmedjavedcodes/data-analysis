"use client";

import { AlertTriangle } from "lucide-react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  type ScatterShapeProps,
} from "recharts";

import { ChartTooltip } from "@/components/ui/controls";
import { Panel } from "@/components/ui/panel";
import { ScoreBadge } from "@/components/ui/score-badge";
import { SentimentBar } from "@/components/ui/sentiment-bar";
import { cn } from "@/lib/cn";
import { SCORE_NAME } from "@/lib/copy";
import {
  classifyFeature,
  FEATURE_CLASS_HELP,
  FEATURE_CLASS_LABEL,
  shareSplit,
  starsHideFriction,
  type FeatureClass,
} from "@/lib/insights";
import type { FeatureInsight } from "@/lib/schemas";
import { fmtPct, fmtScore, fmtStars, levelLabel, scoreTone, thresholds, TONE_CHIP, TONE_COLOR } from "@/lib/scale";

const CLASS_TONE: Record<FeatureClass, keyof typeof TONE_CHIP> = {
  risk: "neg",
  "common-friction": "neu",
  "isolated-friction": "neu",
  strength: "pos",
  unmentioned: "none",
};

const AXIS = { fill: "var(--chart-axis)", fontSize: 11 };
const ZONE_LABEL = { fontSize: 11, fontWeight: 600 };

type LabelPlacement = "right" | "left" | "above" | "below" | "none";

type Point = {
  name: string;
  share: number;
  score: number;
  count: number;
  stars: number | null;
  cls: FeatureClass;
  label: string;
  placement: LabelPlacement;
};

/**
 * Labels without collisions: points that practically coincide share one label
 * ("Cleaning · Freshness"). A label goes beside its dot (left of it on the right
 * half of the chart) unless another dot sits on that side within a label's
 * length; then it goes above, or below if a nearby label already took above.
 */
function placeLabels(points: Omit<Point, "label" | "placement">[], xMax: number, yMax: number): Point[] {
  type XY = { share: number; score: number };
  const sameSpot = (a: XY, b: XY) => Math.abs(a.share - b.share) < xMax * 0.02 && Math.abs(a.score - b.score) < 0.12;
  const labelReach = xMax * 0.3;

  const placed: Point[] = [];
  for (const p of [...points].sort((a, b) => b.count - a.count)) {
    const twin = placed.find((q) => q.placement !== "none" && sameSpot(p, q));
    if (twin) {
      twin.label = `${twin.label} · ${p.name}`;
      placed.push({ ...p, label: "", placement: "none" });
      continue;
    }
    const side: "left" | "right" = p.share > xMax * 0.55 ? "left" : "right";
    const blocked = points.some(
      (q) =>
        q !== p &&
        !sameSpot(p, q) &&
        Math.abs(q.score - p.score) < 0.3 &&
        (side === "left" ? q.share < p.share && p.share - q.share < labelReach : q.share > p.share && q.share - p.share < labelReach),
    );
    let placement: LabelPlacement = side;
    if (blocked) {
      const aboveTaken = placed.some(
        (q) => q.placement === "above" && Math.abs(q.share - p.share) < labelReach && Math.abs(q.score - p.score) < 0.3,
      );
      // A dot near the top edge has no room above it.
      placement = aboveTaken || p.score > yMax * 0.85 ? "below" : "above";
    }
    placed.push({ ...p, label: p.name, placement });
  }
  return placed;
}

type Props = {
  features: FeatureInsight[];
  levelLabels: string[];
  selected: string | null;
  onSelect?: (name: string | null) => void;
  /** Live mode: data is still streaming in, rows are not yet selectable. */
  live?: boolean;
};

export function FeaturesSection({ features, levelLabels, selected, onSelect, live = false }: Props) {
  const maxLevel = levelLabels.length - 1;
  const { positive: SCORE_POSITIVE, negative: SCORE_NEGATIVE } = thresholds(maxLevel);
  const yTicks = Array.from({ length: maxLevel + 1 }, (_, i) => i);
  const split = shareSplit(features);
  const specific = features.filter((f) => f.name !== "Overall");
  const overall = features.find((f) => f.name === "Overall");
  const raw = specific
    .filter((f) => f.mention_count > 0 && f.avg_score != null)
    .map((f) => ({
      name: f.name,
      share: f.mention_share * 100,
      score: f.avg_score ?? 0,
      count: f.mention_count,
      stars: f.avg_rating,
      cls: classifyFeature(f, split, maxLevel),
    }));
  const maxShare = Math.max(10, ...raw.map((p) => p.share));
  const xMax = Math.ceil((maxShare * 1.15) / 5) * 5;
  const xSplit = split * 100;
  const points = placeLabels(raw, xMax, maxLevel);
  const select = (name: string) => onSelect?.(name === selected ? null : name);

  return (
    <Panel
      id="features"
      title="Smart Feature Analysis"
      description={
        live
          ? "The features that matter for this product, filling in as each review is read."
          : "The features that matter for this product, and how buyers who mention each one feel about it. Bottom-right is common friction (many buyers, below Positive); bottom-left is isolated friction; the red band is outright risk. Select a feature to see its reviews."
      }
    >
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{live ? "Waiting for the first mentions…" : "No review mentions a specific feature."}</p>
      ) : (
        <figure className="h-80" aria-label={`Feature risk matrix: share of reviews mentioning each feature against its average ${SCORE_NAME}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 24, bottom: 20, left: -4 }}>
              <ReferenceArea x1={0} x2={xSplit} y1={SCORE_POSITIVE} y2={maxLevel} fill="var(--pos)" fillOpacity={0.04} ifOverflow="hidden"
                label={{ value: "Niche praise", position: "insideTopLeft", style: { ...ZONE_LABEL, fill: "var(--pos-ink)", opacity: 0.7 } }} />
              <ReferenceArea x1={xSplit} x2={xMax} y1={SCORE_POSITIVE} y2={maxLevel} fill="var(--pos)" fillOpacity={0.09} ifOverflow="hidden"
                label={{ value: "Core strengths", position: "insideTopRight", style: { ...ZONE_LABEL, fill: "var(--pos-ink)" } }} />
              <ReferenceArea x1={0} x2={xSplit} y1={0} y2={SCORE_POSITIVE} fill="var(--neu)" fillOpacity={0.06} ifOverflow="hidden"
                label={{ value: "Isolated friction", position: "insideTopLeft", style: { ...ZONE_LABEL, fill: "var(--neu-ink)", opacity: 0.8 } }} />
              <ReferenceArea x1={xSplit} x2={xMax} y1={0} y2={SCORE_POSITIVE} fill="var(--neu)" fillOpacity={0.12} ifOverflow="hidden"
                label={{ value: "Common friction", position: "insideTopRight", style: { ...ZONE_LABEL, fill: "var(--neu-ink)" } }} />
              <ReferenceArea x1={0} x2={xMax} y1={0} y2={SCORE_NEGATIVE} fill="var(--neg)" fillOpacity={0.08} ifOverflow="hidden"
                label={{ value: "Risk: negative", position: "insideBottomRight", style: { ...ZONE_LABEL, fill: "var(--neg-ink)" } }} />
              <CartesianGrid stroke="var(--chart-grid)" strokeOpacity={0.6} />
              <XAxis
                type="number"
                dataKey="share"
                domain={[0, xMax]}
                unit="%"
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                label={{ value: "How many buyers mention it →", position: "insideBottom", offset: -12, style: AXIS }}
              />
              <YAxis
                type="number"
                dataKey="score"
                domain={[0, maxLevel]}
                ticks={yTicks}
                tick={AXIS}
                tickLine={false}
                axisLine={false}
                label={{ value: "How they feel about it →", angle: -90, position: "insideLeft", offset: 16, style: { ...AXIS, textAnchor: "middle" } }}
              />
              <ZAxis type="number" dataKey="count" range={[80, 520]} />
              <ReferenceLine x={xSplit} stroke="var(--border-strong)" strokeDasharray="4 4" />
              <ReferenceLine y={SCORE_POSITIVE} stroke="var(--border-strong)" strokeDasharray="4 4" />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => (
                  <PointTooltip active={active} point={payload?.[0]?.payload as Point | undefined} maxLevel={maxLevel} />
                )}
              />
              <Scatter
                data={points}
                isAnimationActive={false}
                onClick={(p: { payload?: Point }) => p.payload && select(p.payload.name)}
                shape={(props: ScatterShapeProps) => {
                  const p = props.payload as Point;
                  const r = Math.sqrt((props.size ?? 64) / Math.PI);
                  const cx = props.cx ?? 0;
                  const cy = props.cy ?? 0;
                  const label =
                    p.placement === "none" ? null : p.placement === "above" || p.placement === "below" ? (
                      <text x={cx} y={p.placement === "above" ? cy - r - 6 : cy + r + 14} textAnchor="middle" fontSize={11} fontWeight={500} fill="var(--text)">
                        {p.label}
                      </text>
                    ) : (
                      <text
                        x={p.placement === "left" ? cx - r - 6 : cx + r + 6}
                        y={cy}
                        dy="0.35em"
                        textAnchor={p.placement === "left" ? "end" : "start"}
                        fontSize={11}
                        fontWeight={500}
                        fill="var(--text)"
                      >
                        {p.label}
                      </text>
                    );
                  return (
                    <g className={live ? undefined : "cursor-pointer"}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={TONE_COLOR[scoreTone(p.score, maxLevel)]}
                        fillOpacity={selected && selected !== p.name ? 0.25 : 0.9}
                        stroke={selected === p.name ? "var(--text)" : "var(--surface)"}
                        strokeWidth={2}
                        className="transition-[cx,cy,r] duration-500 ease-out"
                      />
                      {label}
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </figure>
      )}

      <div
        aria-hidden
        className="mt-6 hidden gap-x-4 px-3 pb-2 text-xs font-medium text-subtle sm:grid sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))_minmax(0,1fr)]"
      >
        <span>Feature</span>
        <span>Mentions</span>
        <span>{SCORE_NAME}</span>
        <span>Their stars</span>
        <span>Sentiment split</span>
      </div>
      <ul className="space-y-2">
        {[...specific, ...(overall ? [overall] : [])].map((f) => {
          const isOverall = f.name === "Overall";
          const cls = isOverall ? null : classifyFeature(f, split, maxLevel);
          const worst = f.quotes[0];
          const isSelected = selected === f.name;
          const content = (
            <>
              <span className="col-span-3 min-w-0 sm:col-span-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{isOverall ? "General comments" : f.name}</span>
                  {cls && !(live && cls === "unmentioned") && (
                    <span title={FEATURE_CLASS_HELP[cls]} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TONE_CHIP[CLASS_TONE[cls]])}>
                      {FEATURE_CLASS_LABEL[cls]}
                    </span>
                  )}
                  {!isOverall && starsHideFriction(f, maxLevel) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neu-ink" title="Buyers mentioning it give 4+ stars, but what they write about it is below Positive">
                      <AlertTriangle className="size-3" aria-hidden />
                      Stars hide it
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {isOverall ? "Reviews that don't mention any feature above, scored on the whole review." : f.description}
                </span>
              </span>
              <Stat label="Mentions" value={`${f.mention_count}`} sub={fmtPct(f.mention_share)} />
              <span className="flex flex-col items-start gap-1">
                <span className="text-[11px] text-subtle sm:hidden">{SCORE_NAME}</span>
                <ScoreBadge score={f.avg_score} maxLevel={maxLevel} label={levelLabel(levelLabels, f.avg_score)} />
              </span>
              <Stat label="Their stars" value={f.avg_rating == null ? "–" : `${fmtStars(f.avg_rating)}/5`} />
              <span className="col-span-3 flex flex-col justify-center gap-1.5 sm:col-span-1">
                <SentimentBar counts={f.sentiment} />
                <span className="text-[11px] text-subtle tabular-nums">
                  {f.sentiment.positive} positive · {f.sentiment.neutral} neutral · {f.sentiment.negative} negative
                </span>
              </span>
              {worst && worst.score < SCORE_POSITIVE && (
                <span className="col-span-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted sm:col-span-5">
                  Lowest: <span className="text-text">&ldquo;{worst.text}&rdquo;</span>{" "}
                  <span className="tabular-nums">
                    ({fmtScore(worst.score)}, {worst.rating}★)
                  </span>
                </span>
              )}
            </>
          );
          const rowClass = cn(
            "grid w-full grid-cols-3 gap-x-4 gap-y-2 rounded-xl px-3 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.7fr))_minmax(0,1fr)]",
            isSelected ? "bg-accent-soft" : "hover:bg-surface-2",
          );
          return (
            <li key={f.name} className="animate-fade-up">
              {live ? (
                <div className={rowClass}>{content}</div>
              ) : (
                <button
                  type="button"
                  onClick={() => select(f.name)}
                  aria-pressed={isSelected}
                  className={cn(rowClass, "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
                >
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <span className="flex flex-col tabular-nums">
      <span className="text-[11px] text-subtle sm:hidden">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
      {sub && <span className="text-[11px] text-subtle">{sub}</span>}
    </span>
  );
}

function PointTooltip({ active, point, maxLevel }: { active?: boolean; point?: Point; maxLevel: number }) {
  if (!active || !point) return null;
  return (
    <ChartTooltip
      title={point.name}
      rows={[
        { label: "Mentions", value: `${point.count} (${point.share.toFixed(0)}%)` },
        { label: "Sentiment", value: `${fmtScore(point.score)} / ${maxLevel}` },
        { label: "Their stars", value: point.stars == null ? "–" : `${fmtStars(point.stars)} / 5` },
        { label: "Zone", value: FEATURE_CLASS_LABEL[point.cls] },
      ]}
    />
  );
}
