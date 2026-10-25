# Daraz AI Review Analyzer: Backend

**Repository:** https://github.com/ahmedjavedcodes/data-analysis

You paste a Daraz.pk product link and get back what buyers think of the product, feature by feature. The backend:
- scrapes the product and all of its public reviews;
- has an LLM (Groq) invent feature categories that fit the product (e.g. *Cleaning*, *Freshness* and *Value for Money* for toothpaste);
- has TypeSafe **Jev** score every review's sentiment overall and for each category it mentions;
- aggregates the results with pandas into dashboard-ready metrics.

The Next.js dashboard in `frontend/` consumes this API. `CLAUDE.md` is the full engineering guide; this file summarises what has been built in the backend.

---

## Pipeline

```
URL ─▶ validate ─▶ scrape ─▶ clean ─▶ feature categories ─▶ Jev scoring ─▶ aggregate ─▶ AnalysisResult
        (regex)   (Playwright  (pandas)    (Groq, 1 call)      (1 request    (pandas,
                   + httpx)                                     per review)   pure functions)
```

| Stage | Module | What it does |
|---|---|---|
| URL validation | `app/core/url_validator.py` | Accepts only `daraz.pk` product URLs (`www`, `m.`, bare host; tracking params stripped) and extracts `item_id` / `sku_id`. Rebuilds the canonical URL from the id, so no user-supplied URL is ever fetched (SSRF-safe). |
| Scraping | `app/scraper/` | Headless Chromium loads the product page. The product header comes from the page's own `getDetailInfo` response. Reviews are paged directly from `my.daraz.pk/pdp/review/getReviewList` (50 per page) with `httpx`, with a click-through DOM fallback. Polite delays, `tenacity` retries on timeouts / 429 / 5xx, bot-wall detection, bounded pagination. |
| Cleaning | `app/pipeline/cleaning.py` | Vectorised pandas steps: strip HTML, NFKC-normalise, trim whitespace, drop empty rows, dedupe by `review_id` only, clip ratings to 1–5, and parse dates as ISO 8601 in UTC. Roman Urdu / Urdu text is kept as-is. |
| Feature generation | `app/llm/feature_generator.py` | One Groq call (`openai/gpt-oss-120b`, structured output) returns 4–8 non-overlapping categories. `Overall` is added by code. One repair attempt; if that fails, falls back to a generic set and flags it. |
| Jev scoring | `app/llm/jev/` | One `POST /v1/systemone` request per review, asking all of these in a single pass: an overall sentiment **Score**, plus for each category a **Noul** ("does it mention X?") and a category Score. Concurrency is bounded by a semaphore inside a `TaskGroup`. |
| Aggregation | `app/pipeline/aggregation.py` | Pure, deterministic pandas functions build the `AnalysisResult` (metrics below). |
| Orchestration | `app/pipeline/orchestrator.py` | Runs the stages, writes every intermediate file, and emits progress events for streaming. |

### Sentiment rubric (`app/llm/prompts/jev_sentiment_v3.json`)
- Three levels: **Negative (0) · Neutral (1) · Positive (2)**. Scores are probability-weighted, 0.0–2.0.
- The instructions treat Roman Urdu complaints such as *"kaha kuch bheja kuch"* (wrong item sent), *"farig"* (useless) and *"dhoka"* (scam) as Negative.
- A category counts as mentioned when Jev's Noul probability is ≥ 0.5. Its score is stored only then, because scores for unmentioned categories are filler.
- Older rubrics (v1: 5 levels, v2) are kept, so earlier runs still render. Everything downstream reads `scale.max_level` instead of assuming a range.
- Jev returns typed JSON, so there is no LLM-text parsing, no repair loop and no retry. A failed request leaves that review unscored, and it is never replaced by a star-rating guess.

### Metrics in `AnalysisResult`
- **Product:** name, breadcrumb, price, Daraz rating, rating count and star distribution.
- **Sentiment:**
  - average AI score;
  - net sentiment (100 × (positive − negative) / scored reviews);
  - positive / neutral / negative counts;
  - score-level distribution.
- **Recency:** the same metrics over the last 7 / 30 / 90 days and all time.
- **Monthly trend:** per calendar month. Empty months are kept.
- **Per feature:**
  - mention count, and its share of scored reviews;
  - average category score and net sentiment;
  - average stars of the reviewers who mention it (the gap between stars and score is a "friction" signal);
  - up to 3 representative quotes.
- **Top terms:** after removing Daraz form labels and English / Roman Urdu / Urdu filler words, each term's average score and net sentiment.
- **Review feed:** each review with its stars, overall score and per-feature scores.

Metric definitions: `docs/decisions/0001-jev-sentiment-metrics.md`.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/api/v1/analyze` | Run the full pipeline and return `AnalysisResult` |
| `GET` | `/api/v1/analyze/stream?product_url=…` | Same pipeline as Server-Sent Events. Events: `stage`, `product`, `reviews`, `cleaned`, `categories`, `scale`, `scored` (one per review), `done`, `failed`. 15 s keep-alive; the job is cancelled if the client disconnects. |
| `GET` | `/api/v1/runs` | List saved analyses |
| `GET` | `/api/v1/runs/{run_id}` | Load a saved analysis |

Errors share one JSON shape, `{"error": {"code", "message", "details"}}`, with these codes: `INVALID_URL`, `PRODUCT_NOT_FOUND`, `SCRAPE_BLOCKED`, `SCRAPE_TIMEOUT`, `LLM_UNAVAILABLE`, `LLM_OUTPUT_INVALID`, `RUN_NOT_FOUND`, `INTERNAL_ERROR`. A middleware turns unexpected exceptions into JSON that keeps CORS headers, so the browser sees a real error instead of "unreachable".

---

## Run files

Each analysis is saved in `backend/data/runs/<item_id>_<timestamp>/` (git-ignored), so any stage can be inspected or re-run alone:

```
product.json  raw_reviews.csv  clean_reviews.csv  run_meta.json
features.json  jev_scores.csv  jev_category_scores.csv  analysis.json
```

All CSV reads and writes go through `app/pipeline/io.py`, with explicit dtypes (`review_id` is always a string) and a column check on load. Each stage also has a script (`scripts/run_scraper.py`, `run_clean.py`, `run_features.py`, `run_jev.py`, `run_aggregate.py`).

---

## Engineering notes

- **Windows + reload:** Playwright runs on its own Proactor event-loop thread, because uvicorn's reload loop can't start subprocesses on Windows.
- **Small hosts:** Chromium starts with low-memory flags, and image, font and media requests are blocked. Page-load and wait timeouts are configurable (`SCRAPER_NAV_TIMEOUT_S`, `SCRAPER_WAIT_TIMEOUT_S`).
- **Daraz specifics** are documented in `app/scraper/README.md`:
  - the review endpoint counts hidden reviews in its totals, so a short page is treated as the last one;
  - `getDetailInfo` is signed and can only be read from the page, not replayed.
- **Privacy:** reviewer names and IDs are never read or stored.
- **Config:** everything goes through `pydantic-settings` (`app/core/config.py`). Secrets live only in `backend/.env`.

## Measured results
- **Sensodyne toothpaste (78 reviews):** all 78 scored in about 3 s with 6 categories (13 questions per request). The full streamed analysis took about 13 s and gave 1.72 / 2 with net sentiment +74.
- **Before Jev:** review classification ran on Groq and hit its token-per-minute limit, so 28 of 78 reviews fell back to star ratings. That limit is why Jev now scores the reviews.

## Quality
- `ruff` (lint + format) and `mypy --strict` are clean on `app/` and `scripts/`.
- **110 pytest tests** (`pytest -m "not live"`):
  - unit tests for the URL validator, parser fixtures, review pagination, cleaning, IO, feature-generation repair/fallback, the Jev client and runner (mocked System One API), and aggregation math;
  - FastAPI integration tests with the scraper, Groq and Jev mocked.

## Run locally

```bash
cd backend
cp .env.example .env              # add GROQ_API_KEY and JEV_API_KEY
uv sync
uv run playwright install chromium
uv run fastapi dev app/main.py    # http://localhost:8000
```

## Deployment status
- Backend (Render) and frontend (Vercel) deploy from separate repos, which are subtree splits of this one.
- On Render's free tier (512 MB, 0.1 CPU), Chromium can't finish loading the Daraz page: it times out, or the instance runs out of memory. Live scraping needs a larger instance or a browser-free product scraper.
