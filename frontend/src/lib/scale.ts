/**
 * One colour scale for the whole UI (CLAUDE.md §5.6).
 *
 * AI sentiment scores run 0..maxLevel, where maxLevel comes from the analysis
 * (`scale.max_level`): 2 for the current 3-level rubric (Negative, Neutral,
 * Positive), 4 for runs saved with the earlier 5-level one. Nothing here
 * hard-codes a range. A score's tone follows the backend's nearest-level
 * sentiment: it is positive when it rounds above the midpoint level and
 * negative when it rounds below it. On 0-2 that is >= 1.5 positive and < 0.5
 * negative; on 0-4, >= 2.5 and < 1.5.
 * Star ratings keep the original scale: >= 4.0 emerald, 3.0-3.9 amber, < 3.0 rose.
 */
import type { Sentiment } from "@/lib/schemas";

export type Tone = "pos" | "neu" | "neg" | "none";

export function thresholds(maxLevel: number): { positive: number; negative: number } {
  const mid = maxLevel / 2;
  return { positive: mid + 0.5, negative: mid - 0.5 };
}

export function scoreTone(score: number | null | undefined, maxLevel: number): Tone {
  if (score == null) return "none";
  const t = thresholds(maxLevel);
  if (score >= t.positive) return "pos";
  return score >= t.negative ? "neu" : "neg";
}

export function scoreSentiment(score: number, maxLevel: number): Sentiment {
  const tone = scoreTone(score, maxLevel);
  return tone === "pos" ? "positive" : tone === "neg" ? "negative" : "neutral";
}

/** Nearest level, rounding half up, as the backend does. */
export function nearestLevel(score: number, maxLevel: number): number {
  return Math.min(maxLevel, Math.max(0, Math.floor(score + 0.5)));
}

export function levelLabel(labels: string[], score: number | null): string | null {
  return score == null ? null : (labels[nearestLevel(score, labels.length - 1)] ?? null);
}

export function starTone(rating: number | null | undefined): Tone {
  if (rating == null) return "none";
  if (rating >= 4) return "pos";
  return rating >= 3 ? "neu" : "neg";
}

export function sentimentTone(sentiment: Sentiment | null | undefined): Tone {
  if (sentiment == null) return "none";
  return sentiment === "positive" ? "pos" : sentiment === "neutral" ? "neu" : "neg";
}

/** Static class strings so Tailwind can see them. */
export const TONE_TEXT: Record<Tone, string> = {
  pos: "text-pos-ink",
  neu: "text-neu-ink",
  neg: "text-neg-ink",
  none: "text-subtle",
};

export const TONE_CHIP: Record<Tone, string> = {
  pos: "bg-pos-soft text-pos-ink",
  neu: "bg-neu-soft text-neu-ink",
  neg: "bg-neg-soft text-neg-ink",
  none: "bg-surface-2 text-muted",
};

export const TONE_BG: Record<Tone, string> = {
  pos: "bg-pos",
  neu: "bg-neu",
  neg: "bg-neg",
  none: "bg-border-strong",
};

/** CSS colours for SVG fills/strokes in charts. */
export const TONE_COLOR: Record<Tone, string> = {
  pos: "var(--pos)",
  neu: "var(--neu)",
  neg: "var(--neg)",
  none: "var(--border-strong)",
};

type LevelShade = "neg-strong" | "neg" | "neu" | "pos" | "pos-strong";

/** Level colour by position: the midpoint is neutral; on 5+ levels the extremes get the strong shades. */
function levelShade(level: number, maxLevel: number): LevelShade {
  const mid = maxLevel / 2;
  if (level === mid) return "neu";
  const extreme = maxLevel >= 4 && (level === 0 || level === maxLevel);
  if (level < mid) return extreme ? "neg-strong" : "neg";
  return extreme ? "pos-strong" : "pos";
}

const SHADE_COLOR: Record<LevelShade, string> = {
  "neg-strong": "var(--neg-strong)",
  neg: "var(--neg)",
  neu: "var(--neu)",
  pos: "var(--pos)",
  "pos-strong": "var(--pos-strong)",
};

const SHADE_BG: Record<LevelShade, string> = {
  "neg-strong": "bg-neg-strong",
  neg: "bg-neg",
  neu: "bg-neu",
  pos: "bg-pos",
  "pos-strong": "bg-pos-strong",
};

export function levelColor(level: number, maxLevel: number): string {
  return SHADE_COLOR[levelShade(level, maxLevel)];
}

export function levelBg(level: number, maxLevel: number): string {
  return SHADE_BG[levelShade(level, maxLevel)];
}

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

// -- formatting ---------------------------------------------------------------------

export function fmtScore(score: number | null | undefined): string {
  return score == null ? "–" : score.toFixed(2);
}

export function fmtNet(net: number | null | undefined): string {
  if (net == null) return "–";
  const rounded = Math.round(net);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function fmtPct(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`;
}

export function fmtStars(rating: number | null | undefined): string {
  return rating == null ? "–" : rating.toFixed(rating % 1 === 0 ? 0 : 1);
}

export function fmtPrice(price: number | null): string {
  return price == null ? "–" : `Rs. ${price.toLocaleString("en-PK")}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

export function fmtDate(iso: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : "No date";
}

export function fmtMonth(yyyyMm: string): string {
  return monthFmt.format(new Date(`${yyyyMm}-01T00:00:00Z`));
}
