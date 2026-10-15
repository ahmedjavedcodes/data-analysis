/**
 * Runtime mirror of the backend's AnalysisResult / RunSummary
 * (backend/app/models/api.py). Every API response is parsed through these,
 * so a contract change fails loudly at the boundary instead of deep in a chart.
 */
import { z } from "zod";

const datetime = z.iso.datetime({ offset: true });
const nullableNumber = z.number().nullable();

export const Sentiment = z.enum(["positive", "neutral", "negative"]);

export const RatingDistribution = z.object({
  one_star: z.number().int(),
  two_star: z.number().int(),
  three_star: z.number().int(),
  four_star: z.number().int(),
  five_star: z.number().int(),
});

export const SentimentCounts = z.object({
  positive: z.number().int(),
  neutral: z.number().int(),
  negative: z.number().int(),
});

export const ProductInfo = z.object({
  item_id: z.string(),
  url: z.string(),
  name: z.string(),
  category_breadcrumb: z.string(),
  product_category: z.string(),
  price: nullableNumber,
  overall_rating: nullableNumber,
  rating_count: z.number().int(),
  rating_distribution: RatingDistribution.nullable(),
});

export const ScoreScale = z.object({
  rubric_version: z.string(),
  max_level: z.number().int(),
  labels: z.array(z.string()),
  descriptions: z.array(z.string()),
});

export const LevelCount = z.object({ level: z.number().int(), label: z.string(), count: z.number().int() });

export const RecencyWindow = z.object({
  days: z.number().int().nullable(),
  review_count: z.number().int(),
  scored_count: z.number().int(),
  avg_score: nullableNumber,
  net_sentiment: nullableNumber,
  avg_rating: nullableNumber,
});

export const TrendPoint = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  review_count: z.number().int(),
  scored_count: z.number().int(),
  avg_score: nullableNumber,
  avg_rating: nullableNumber,
  net_sentiment: nullableNumber,
  sentiment: SentimentCounts,
});

export const TermFrequency = z.object({
  term: z.string(),
  review_count: z.number().int(),
  share: z.number(),
  avg_rating: z.number(),
  avg_score: nullableNumber,
  net_sentiment: nullableNumber,
});

export const FeatureQuote = z.object({
  review_id: z.string(),
  rating: z.number().int(),
  score: z.number(),
  sentiment: Sentiment,
  text: z.string(),
});

export const FeatureInsight = z.object({
  name: z.string(),
  description: z.string(),
  mention_count: z.number().int(),
  mention_share: z.number(),
  avg_score: nullableNumber,
  net_sentiment: nullableNumber,
  sentiment: SentimentCounts,
  avg_rating: nullableNumber,
  quotes: z.array(FeatureQuote),
});

export const ReviewFeature = z.object({
  name: z.string(),
  score: z.number(),
  level: z.number().int(),
  sentiment: Sentiment,
});

export const Review = z.object({
  review_id: z.string(),
  rating: z.number().int(),
  text: z.string(),
  review_date: datetime.nullable(),
  helpful_count: z.number().int(),
  score: nullableNumber,
  level: z.number().int().nullable(),
  confidence: nullableNumber,
  sentiment: Sentiment.nullable(),
  features: z.array(ReviewFeature),
});

export const RunStats = z.object({
  reviews_scraped: z.number().int(),
  reviews_analysed: z.number().int(),
  reviews_scored: z.number().int(),
  unprocessed_reviews: z.number().int(),
  partial: z.boolean(),
  used_fallback_features: z.boolean(),
  jev_model: z.string().nullable(),
  input_tokens: z.number().int().nullable(),
});

export const AnalysisResult = z.object({
  run_id: z.string(),
  generated_at: datetime,
  scraped_at: datetime,
  product: ProductInfo,
  features: z.array(FeatureInsight),
  scale: ScoreScale,
  avg_score: nullableNumber,
  net_sentiment: nullableNumber,
  sentiment: SentimentCounts,
  levels: z.array(LevelCount),
  recency: z.array(RecencyWindow),
  trend: z.array(TrendPoint),
  rating_distribution: RatingDistribution,
  terms: z.array(TermFrequency),
  reviews: z.array(Review),
  stats: RunStats,
});

export const RunSummary = z.object({
  run_id: z.string(),
  item_id: z.string(),
  product_name: z.string(),
  product_category: z.string(),
  url: z.string(),
  scraped_at: datetime,
  reviews_scored: z.number().int(),
  avg_score: nullableNumber,
  max_level: z.number().int(),
  net_sentiment: nullableNumber,
});

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()) }),
});

export type Sentiment = z.infer<typeof Sentiment>;
export type SentimentCounts = z.infer<typeof SentimentCounts>;
export type ScoreScale = z.infer<typeof ScoreScale>;
export type RecencyWindow = z.infer<typeof RecencyWindow>;
export type TrendPoint = z.infer<typeof TrendPoint>;
export type TermFrequency = z.infer<typeof TermFrequency>;
export type FeatureInsight = z.infer<typeof FeatureInsight>;
export type Review = z.infer<typeof Review>;
export type AnalysisResult = z.infer<typeof AnalysisResult>;
export type RunSummary = z.infer<typeof RunSummary>;
