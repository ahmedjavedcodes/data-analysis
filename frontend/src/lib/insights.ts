/**
 * Small, explainable judgements the dashboard makes on top of AnalysisResult.
 * Every threshold is named here so the UI copy can quote it, and every one is
 * relative to the analysis's own score range (0..maxLevel).
 */
import type { FeatureInsight, RecencyWindow, Review } from "@/lib/schemas";
import { thresholds } from "@/lib/scale";

// -- mood verdict -------------------------------------------------------------------

/** Fewer scored reviews than this in a window and we don't call a direction. */
export const MIN_RECENT_REVIEWS = 5;

/** Avg-score change that counts as a real move rather than noise: 5% of the range (0.1 on 0-2). */
export function moodDelta(maxLevel: number): number {
  return 0.05 * maxLevel;
}

export type MoodVerdict = {
  kind: "improving" | "dropping" | "stable" | "insufficient";
  window: RecencyWindow | null;
  delta: number | null;
};

/**
 * Compares the most recent window with enough reviews (30 days, else 90) against
 * all time, on the average AI sentiment score.
 */
export function moodVerdict(recency: RecencyWindow[], maxLevel: number): MoodVerdict {
  const allTime = recency.find((w) => w.days === null);
  const recent = [30, 90]
    .map((days) => recency.find((w) => w.days === days))
    .find((w): w is RecencyWindow => w != null && w.scored_count >= MIN_RECENT_REVIEWS);

  if (!allTime || allTime.avg_score == null || !recent || recent.avg_score == null) {
    return { kind: "insufficient", window: recent ?? null, delta: null };
  }
  const delta = recent.avg_score - allTime.avg_score;
  const step = moodDelta(maxLevel);
  const kind = delta >= step ? "improving" : delta <= -step ? "dropping" : "stable";
  return { kind, window: recent, delta };
}

// -- features: friction vs risk ------------------------------------------------------

export type FeatureClass = "risk" | "common-friction" | "isolated-friction" | "strength" | "unmentioned";

export const FEATURE_CLASS_LABEL: Record<FeatureClass, string> = {
  risk: "Risk",
  "common-friction": "Common friction",
  "isolated-friction": "Isolated friction",
  strength: "Strength",
  unmentioned: "Not mentioned",
};

export const FEATURE_CLASS_HELP: Record<FeatureClass, string> = {
  risk: "Mentions average Negative",
  "common-friction": "Below Positive, and mentioned more than most features",
  "isolated-friction": "Below Positive, but mentioned by few buyers",
  strength: "Mentions average Positive",
  unmentioned: "No review talks about it",
};

/** Median mention share of the specific (non-Overall) features that are mentioned at all. */
export function shareSplit(features: FeatureInsight[]): number {
  const shares = features
    .filter((f) => f.name !== "Overall" && f.mention_count > 0)
    .map((f) => f.mention_share)
    .sort((a, b) => a - b);
  if (shares.length === 0) return 0;
  const mid = Math.floor(shares.length / 2);
  return shares.length % 2 ? (shares[mid] ?? 0) : ((shares[mid - 1] ?? 0) + (shares[mid] ?? 0)) / 2;
}

export function classifyFeature(feature: FeatureInsight, split: number, maxLevel: number): FeatureClass {
  if (feature.mention_count === 0 || feature.avg_score == null) return "unmentioned";
  const t = thresholds(maxLevel);
  if (feature.avg_score < t.negative) return "risk";
  if (feature.avg_score < t.positive) {
    return feature.mention_share >= split ? "common-friction" : "isolated-friction";
  }
  return "strength";
}

/** Stars say one thing, the words another: 4-5 stars over a below-Positive feature score. */
export function starsHideFriction(feature: FeatureInsight, maxLevel: number): boolean {
  return (
    feature.avg_rating != null &&
    feature.avg_score != null &&
    feature.avg_rating >= 4 &&
    feature.avg_score < thresholds(maxLevel).positive
  );
}

// -- reviews ------------------------------------------------------------------------

export type Mismatch = "words-worse" | "words-better" | null;

/** A review whose star rating and words disagree. */
export function reviewMismatch(review: Review, maxLevel: number): Mismatch {
  if (review.score == null) return null;
  const t = thresholds(maxLevel);
  if (review.rating >= 4 && review.score < t.negative) return "words-worse";
  if (review.rating <= 2 && review.score >= t.positive) return "words-better";
  return null;
}
