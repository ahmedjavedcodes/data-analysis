# 0001 — Review sentiment via TypeSafe Jev, and how it is aggregated

Date: 2026-10-16. Status: accepted.

## Context

Review classification first ran on Groq (`gpt-oss-20b`): a LangGraph prompt → JSON → validate → repair loop that mapped each review to features with a sentiment. On the real Sensodyne run (78 reviews), this key's tier allows 8,000 tokens per minute. 3 of 8 batches hit 429s, and 28 reviews fell back to star ratings.

## Decision

- Groq is kept only for generating feature categories (one call per product).
- Each review is scored by **Jev** (`jev-1.14.0`, `POST https://api.typesafe.ai/v1/systemone`) with one Score question. Its five levels are in `backend/app/llm/prompts/jev_sentiment_v1.json`: 0 Hostile, 1 Negative, 2 Neutral, 3 Positive, 4 Enthusiastic.
- Jev returns typed JSON. All JSON-repair and 429-backoff code was removed, and there are no retries: a failed request leaves the review unscored.

Measured on the same run: 78/78 scored in 3.0 s, at about 415 input tokens per review.

## Metric definitions (`app/pipeline/aggregation.py`)

| Metric | Definition |
|---|---|
| `score` | Jev's probability-weighted level index, 0.0–4.0, stored per review |
| `level` | nearest level, rounding half up (2.5 → 3) |
| sentiment | level below the rubric midpoint → negative, at it → neutral, above it → positive (0–1 / 2 / 3–4) |
| `avg_score` | mean `score` of scored reviews |
| `net_sentiment` | 100 × (positive − negative) / scored reviews, range −100..100 |
| recency windows | the same metrics over reviews dated within 7 / 30 / 90 days of `scraped_at`, plus all time |
| monthly trend | per calendar month (UTC), first to last dated review. Empty months are kept, with count 0 and null metrics. |
| terms | tokens counted once per review, after removing Daraz's Title-Case form labels ("Freshness:") and English, Roman Urdu and Urdu filler words. Top 15 that appear in ≥ 2 reviews, each with avg stars, avg score and net sentiment. |

- Unscored reviews count in `review_count` but never in score or sentiment metrics. They are never replaced by a star-rating guess, so a failed request can't quietly change the sentiment.
- Cleaning deduplicates by `review_id` only. Identical short reviews from different buyers ("good" ×4 on Sensodyne) all count.

## Consequences

- **Feature-level views are gone for now.** Nothing maps reviews to the generated categories. Candidate fix: in the same Jev request, add one Noul question per category ("Does the review talk about X?") plus a per-category Score. This needs a decision on cost and latency (one larger request per review).
- `jev_mentions.csv` and `feature_summary.csv` are replaced by `jev_scores.csv`. `AnalysisResult` changed shape. No frontend consumed it yet.
- The model is pinned to `jev-1.14.0`: `jev-latest` resolved to 1.13.0 on 2026-10-16, so the alias isn't safe to rely on for reproducible scores.
