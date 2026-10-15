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

## Update 2026-10-16: category linkage (rubric `jev_sentiment_v2`)

The same request now also carries, for each generated category except `Overall`:
- a **Noul** "does this review say anything about {name} ({description})?" (Jev rejects `type: "boolean"`; its answer is `{"noul": <probability>}`);
- a **Score** "how does this customer feel about the product's {name}?" on the same 5 levels.

| Metric | Definition |
|---|---|
| mentioned | `noul ≥ 0.5`. On Sensodyne the probabilities split cleanly: 0.86–0.98 vs. < 0.15. |
| category score | stored only when mentioned. Jev answers it for unmentioned categories too, with filler values (about 2.x). |
| `mention_share` | reviews mentioning the category ÷ scored reviews |
| feature `avg_score` / `net_sentiment` | over the category scores of the reviews that mention it |
| feature `avg_rating` | stars of those reviews. The gap from `avg_score` is the friction signal: on Sensodyne, Packaging, Taste and Value for Money score about 2.2–2.4 from reviewers averaging 4.6–5.0 stars. |
| `Overall` | scored reviews that mention no other category, using their overall score |
| quotes | up to 3 reviews: lowest category score first, then highest, then next lowest |

Measured with 6 categories (13 questions): still 3.0 s for 78 reviews. Input grew from about 415 to about 1,500 tokens per review.

## Consequences

- `jev_mentions.csv` and `feature_summary.csv` are replaced by `jev_scores.csv` and `jev_category_scores.csv`. `AnalysisResult` changed shape. No frontend consumed it yet.
- The model is pinned to `jev-1.14.0`: `jev-latest` resolved to 1.13.0 on 2026-10-16, so the alias isn't safe to rely on for reproducible scores.

## Update 2026-10-16: 3-level rubric (`jev_sentiment_v3`)

The rubric is now Negative / Neutral / Positive, so scores run 0.0–2.0, with instructions that treat Roman Urdu complaints such as "kaha kuch bheja kuch" (wrong item sent), "farig" (useless) and "dhoka" (scam) as Negative. The request keeps the `questions`/`criteria` shape the API accepts; a `task`/`levels` body is rejected with "Invalid request."

- Sentiment is the nearest level against the midpoint (0 negative, 1 neutral, 2 positive).
- The frontend reads `scale.max_level` from each result (and from the `scale` stream event), never a fixed range:
  - tone thresholds are `max/2 ± 0.5`;
  - "stable" mood means moves under 5% of the range.
- Runs saved on the 0–4 rubric still render correctly.
