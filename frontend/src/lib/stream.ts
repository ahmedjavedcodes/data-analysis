/**
 * The live analysis stream (GET /api/v1/analyze/stream, Server-Sent Events).
 * Mirrors backend/app/pipeline/progress.py: each event is parsed with zod,
 * folded into LiveState by reduceStream, and summarised for the UI by
 * liveSummary, which applies the same rules as backend aggregation so live
 * numbers settle into the final ones instead of jumping.
 */
import { z } from "zod";

import { AnalysisResult, Sentiment, type FeatureInsight, type SentimentCounts } from "@/lib/schemas";
import { scoreSentiment } from "@/lib/scale";

export const STAGES = ["validating", "scraping", "cleaning", "categorizing", "scoring", "compiling"] as const;
export type Stage = (typeof STAGES)[number];

const StageEvent = z.object({ stage: z.enum(STAGES), message: z.string() });
export const ProductEvent = z.object({
  name: z.string(),
  category_breadcrumb: z.string(),
  price: z.number().nullable(),
  overall_rating: z.number().nullable(),
  rating_count: z.number().int(),
  url: z.string(),
});
const ReviewsEvent = z.object({ collected: z.number().int() });
const ScaleEvent = z.object({
  rubric_version: z.string(),
  max_level: z.number().int().min(1),
  labels: z.array(z.string()),
});
const CleanedEvent = z.object({ clean: z.number().int(), dropped: z.number().int() });
const CategoriesEvent = z.object({
  product_category: z.string(),
  used_fallback: z.boolean(),
  features: z.array(z.object({ name: z.string(), description: z.string() })),
});
export const ScoredEvent = z.object({
  done: z.number().int(),
  total: z.number().int(),
  review_id: z.string(),
  rating: z.number().int(),
  text: z.string(),
  score: z.number().nullable(),
  level: z.number().int().nullable(),
  sentiment: Sentiment.nullable(),
  features: z.array(z.object({ name: z.string(), score: z.number() })),
});
const FailedEvent = z.object({ code: z.string(), message: z.string() });

export type ProductEvent = z.infer<typeof ProductEvent>;
export type ScoredEvent = z.infer<typeof ScoredEvent>;
type CategoriesEvent = z.infer<typeof CategoriesEvent>;

export type StreamEvent =
  | { type: "stage"; data: z.infer<typeof StageEvent> }
  | { type: "product"; data: ProductEvent }
  | { type: "reviews"; data: z.infer<typeof ReviewsEvent> }
  | { type: "cleaned"; data: z.infer<typeof CleanedEvent> }
  | { type: "categories"; data: CategoriesEvent }
  | { type: "scale"; data: z.infer<typeof ScaleEvent> }
  | { type: "scored"; data: ScoredEvent }
  | { type: "done"; data: AnalysisResult }
  | { type: "failed"; data: z.infer<typeof FailedEvent> };

export const EVENT_NAMES = [
  "stage",
  "product",
  "reviews",
  "cleaned",
  "categories",
  "scale",
  "scored",
  "done",
  "failed",
] as const;

const SCHEMAS = {
  stage: StageEvent,
  product: ProductEvent,
  reviews: ReviewsEvent,
  cleaned: CleanedEvent,
  categories: CategoriesEvent,
  scale: ScaleEvent,
  scored: ScoredEvent,
  done: AnalysisResult,
  failed: FailedEvent,
} as const;

/** Parses one SSE message; returns null for anything malformed. */
export function parseEvent(name: string, raw: string): StreamEvent | null {
  if (!(name in SCHEMAS)) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = SCHEMAS[name as keyof typeof SCHEMAS].safeParse(json);
  return parsed.success ? ({ type: name, data: parsed.data } as StreamEvent) : null;
}

// -- state ------------------------------------------------------------------------------

export type LiveState = {
  status: "connecting" | "running" | "done" | "failed";
  stage: Stage | null;
  product: ProductEvent | null;
  collected: number;
  cleaned: z.infer<typeof CleanedEvent> | null;
  categories: CategoriesEvent | null;
  /** Score range of this run; arrives just before the first scored review. */
  scale: { maxLevel: number; labels: string[] } | null;
  scored: ScoredEvent[];
  total: number;
  result: AnalysisResult | null;
  error: { code: string; message?: string } | null;
};

export const INITIAL_STATE: LiveState = {
  status: "connecting",
  stage: null,
  product: null,
  collected: 0,
  cleaned: null,
  categories: null,
  scale: null,
  scored: [],
  total: 0,
  result: null,
  error: null,
};

export type StreamAction = StreamEvent | { type: "lost" };

export function reduceStream(state: LiveState, action: StreamAction): LiveState {
  if (state.status === "done" || state.status === "failed") return state;
  switch (action.type) {
    case "stage":
      return { ...state, status: "running", stage: action.data.stage };
    case "product":
      return { ...state, status: "running", product: action.data };
    case "reviews":
      return { ...state, collected: action.data.collected };
    case "cleaned":
      return { ...state, cleaned: action.data };
    case "categories":
      return { ...state, categories: action.data };
    case "scale":
      return { ...state, scale: { maxLevel: action.data.max_level, labels: action.data.labels } };
    case "scored":
      return { ...state, scored: [...state.scored, action.data], total: action.data.total };
    case "done":
      return { ...state, status: "done", result: action.data };
    case "failed":
      return { ...state, status: "failed", error: action.data };
    case "lost":
      return { ...state, status: "failed", error: { code: state.status === "connecting" ? "BACKEND_UNREACHABLE" : "STREAM_LOST" } };
  }
}

// -- live summary ----------------------------------------------------------------------

function counts(sentiments: ("positive" | "neutral" | "negative")[]): SentimentCounts {
  return {
    positive: sentiments.filter((s) => s === "positive").length,
    neutral: sentiments.filter((s) => s === "neutral").length,
    negative: sentiments.filter((s) => s === "negative").length,
  };
}

function net(c: SentimentCounts): number | null {
  const total = c.positive + c.neutral + c.negative;
  return total ? (100 * (c.positive - c.negative)) / total : null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

type Row = { review_id: string; rating: number; text: string; score: number };

function insight(name: string, description: string, rows: Row[], scoredTotal: number, maxLevel: number): FeatureInsight {
  const tone = (score: number) => scoreSentiment(score, maxLevel);
  const c = counts(rows.map((r) => tone(r.score)));
  const lowest = [...rows].sort((a, b) => a.score - b.score)[0];
  return {
    name,
    description,
    mention_count: rows.length,
    mention_share: scoredTotal ? rows.length / scoredTotal : 0,
    avg_score: mean(rows.map((r) => r.score)),
    net_sentiment: net(c),
    sentiment: c,
    avg_rating: mean(rows.map((r) => r.rating)),
    quotes: lowest
      ? [{ review_id: lowest.review_id, rating: lowest.rating, score: lowest.score, sentiment: tone(lowest.score), text: lowest.text }]
      : [],
  };
}

export type LiveSummary = {
  maxLevel: number;
  levelLabels: string[];
  scoredCount: number;
  sentiment: SentimentCounts;
  netSentiment: number | null;
  avgScore: number | null;
  levels: number[];
  features: FeatureInsight[];
  progress: number;
};

/** Used only before the scale event arrives, when there are no scores to place on it yet. */
const FALLBACK_SCALE = { maxLevel: 2, labels: ["Negative", "Neutral", "Positive"] };

export function liveSummary(state: LiveState): LiveSummary {
  const { maxLevel, labels } = state.scale ?? FALLBACK_SCALE;
  const scored = state.scored.filter((s): s is ScoredEvent & { score: number } => s.score != null);
  // The server sends each review's sentiment; fall back to the score for older servers.
  const sentiment = counts(scored.map((s) => s.sentiment ?? scoreSentiment(s.score, maxLevel)));
  const levels = Array.from({ length: maxLevel + 1 }, () => 0);
  for (const s of scored) if (s.level != null && s.level <= maxLevel) levels[s.level]! += 1;

  const specific = (state.categories?.features ?? []).filter((f) => f.name !== "Overall");
  const overall = state.categories?.features.find((f) => f.name === "Overall");
  const features = specific
    .map((f) =>
      insight(
        f.name,
        f.description,
        scored.flatMap((s) => {
          const hit = s.features.find((x) => x.name === f.name);
          return hit ? [{ review_id: s.review_id, rating: s.rating, text: s.text, score: hit.score }] : [];
        }),
        scored.length,
        maxLevel,
      ),
    )
    .sort((a, b) => b.mention_count - a.mention_count);
  if (overall) {
    features.push(insight(overall.name, overall.description, scored.filter((s) => s.features.length === 0), scored.length, maxLevel));
  }

  return {
    maxLevel,
    levelLabels: labels,
    scoredCount: scored.length,
    sentiment,
    netSentiment: net(sentiment),
    avgScore: mean(scored.map((s) => s.score)),
    levels,
    features,
    progress: progressOf(state),
  };
}

/** 0-1. Each stage owns a slice of the bar; collecting reviews has no known total, so it eases toward its end. */
export function progressOf(state: LiveState): number {
  if (state.status === "done") return 1;
  const slices: Record<Stage, [number, number]> = {
    validating: [0, 0.03],
    scraping: [0.03, 0.35],
    cleaning: [0.35, 0.4],
    categorizing: [0.4, 0.5],
    scoring: [0.5, 0.95],
    compiling: [0.95, 1],
  };
  if (!state.stage) return 0;
  const [from, to] = slices[state.stage];
  let within = 0.5;
  if (state.stage === "scraping") within = 1 - Math.exp(-state.collected / 40);
  if (state.stage === "scoring") within = state.total ? state.scored.length / state.total : 0;
  return from + (to - from) * within;
}
