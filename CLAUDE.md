# CLAUDE.md — Daraz AI Review Analyzer

Central guide, memory, and coding standard for this repository. Read this before making changes. Update it when architecture, commands, or conventions change.

---

## 1. Project Overview

**Daraz AI Review Analyzer** takes a Daraz.pk product URL, scrapes the product and **all** of its reviews, uses a Groq-hosted LLM to generate product-specific feature categories (e.g. Camera, Battery, Value for Money for a phone), and scores every review with **Jev**, TypeSafe's decision model, on a 3-level sentiment rubric (Negative, Neutral, Positive; scores 0.0–2.0). In the same Jev request, each review is also checked against every generated category ("does it talk about Packaging?") and scored for that category. The results are aggregated (EDA) and shown in a Next.js dashboard: net sentiment, score distribution, recency windows, monthly trend, per-feature mention share and score, common terms, and the review feed.

**Core value:** turn hundreds of unstructured reviews into "how do buyers feel about each feature, and is it getting better or worse" in seconds.

---

## 2. System Architecture

```
┌──────────────┐   POST /api/v1/analyze   ┌──────────────────────────── FastAPI backend ────────────────────────────┐
│  Next.js UI  │ ───────────────────────▶ │ 1. Validate URL                                                         │
│  (URL input, │                          │ 2. Scrape product + paginated reviews  (Playwright → BeautifulSoup)     │
│  dashboard)  │ ◀─── SSE progress ────── │ 3. Clean & normalize                                                    │
│              │ ◀─── AnalysisResult ──── │ 4. Generate feature categories        (Groq LLM, structured output)     │
└──────────────┘                          │ 5. Score reviews → Jev (parallel)     (TypeSafe Jev, Score + Noul)      │
                                          │ 6. EDA / aggregation                  (pandas, pure functions)          │
                                          │ 7. Return AnalysisResult JSON                                           │
                                          └─────────────────────────────────────────────────────────────────────────┘
```

### Pipeline stages

| # | Stage | Module | Input → Output |
|---|-------|--------|----------------|
| 1 | URL validation | `app/core/url_validator.py` | `str` → `DarazProductRef(item_id, sku_id, canonical_url)` |
| 2 | Scraping | `app/scraper/` | `DarazProductRef` → `RawProduct` + `list[RawReview]` |
| 3 | Cleaning (pandas) | `app/pipeline/cleaning.py` | `raw_reviews.csv` → `clean_reviews.csv` |
| 4 | Feature generation | `app/llm/feature_generator.py` | `Product` → `FeatureSet` (4–8 features + `Overall`) |
| 5 | Jev scoring | `app/llm/jev/` | `clean_reviews.csv` rows + `features.json` → one request per review → `jev_scores.csv` + `jev_category_scores.csv` |
| 6 | EDA / aggregation (pandas) | `app/pipeline/aggregation.py` | `jev_scores.csv` + `jev_category_scores.csv` + `clean_reviews.csv` → `AnalysisResult` (`analysis.json`) |
| 7 | UI rendering | `frontend/` | `AnalysisResult` → dashboard |

### Stage details

1. **URL validation** — Accept only `daraz.pk` product URLs. Canonical shape:
   `https://www.daraz.pk/products/<slug>-i<itemId>-s<skuId>.html` (query string optional and stripped).
   Also accept mobile (`m.daraz.pk`) and missing `www`. Extract `itemId` (required) and `skuId` (optional). Reject everything else **before** launching a browser.

2. **Scraping** — Playwright (async, Chromium, headless) renders the PDP. Extract product name, category breadcrumb, price, overall rating, total rating count, and rating distribution.
   For reviews, **prefer the JSON review endpoint the page itself calls** (intercept it via Playwright network listeners, then page through it with `httpx` using the same cookies/headers). Fall back to clicking the review pagination control and parsing the DOM with BeautifulSoup only if the endpoint is unavailable. Stop when a page returns no new reviews, the reported total is reached, or `MAX_REVIEW_PAGES` is hit. The exact endpoint and parameters must be confirmed against live Daraz traffic and recorded in `app/scraper/README.md`, since Daraz can change them.

3. **Cleaning (pandas)** — The scraper writes every review to `raw_reviews.csv`; `clean_reviews(df: pd.DataFrame) -> pd.DataFrame` loads it and applies vectorized steps: strip HTML (`str.replace` regex), normalize Unicode (`str.normalize("NFKC")`) and whitespace, drop empty rows and duplicates by `review_id` **only** (identical texts from different buyers are separate reviews; DOM-fallback ids carry a per-page occurrence number so they stay unique), coerce ratings with `pd.to_numeric(...).clip(1, 5).astype("Int64")`, parse dates with `pd.to_datetime(..., utc=True, errors="coerce")`. Keep Roman Urdu / Urdu text as-is (the LLM handles it) and keep the original in `raw_text`. Output: `clean_reviews.csv`.

4. **Feature generation (Groq)** — One LLM call with product name + breadcrumb category + a sample of ~20 reviews. Returns a `FeatureSet` of 4–8 concise, non-overlapping feature names with one-line descriptions. `Overall` is always appended by code (never trust the LLM to include it). Cache by `item_id` (TTL 24h).

5. **Jev scoring** — [TypeSafe Jev](https://docs.typesafe.ai/api) is a decision model, not a generative LLM: no chat endpoint, no system prompt, no JSON to parse.
   - Each review is one `POST {JEV_BASE_URL}/systemone` request: `state` = review text, plus a `questions` map that Jev answers in a single pass:
     - `sentiment`: Score whose `criteria` are the 3 levels in `app/llm/prompts/jev_sentiment_v3.json` (Negative, Neutral, Positive), with instructions covering Roman Urdu complaint phrases.
     - per generated category `i` except `Overall`: `c{i}_mentioned`, a **Noul** (Jev's yes/no type; `"boolean"` is rejected), returning `{"noul": <probability>}`; and `c{i}_score`, a Score on the same levels.
   - Score answers are a probability-weighted value on the **0-based** level index (0.0–2.0 for v3), plus per-level probabilities and a confidence. The overall score goes to `jev_scores.csv`; category rows go to `jev_category_scores.csv`.
   - A category counts as mentioned when `noul ≥ 0.5`. Its score is stored **only** when mentioned. Jev still answers the category Score for reviews that never mention it, and those values are filler (about 2.x).
   - On Sensodyne, adding 6 categories (13 questions) left latency unchanged (~0.35 s per request, 3.0 s for 78 reviews) and raised input tokens from about 415 to about 1,500 per review.
   - The direct API uses bare model ids (`jev-1.14.0`; `GET /v1/models` lists aliases). `typesafe/jev-1.14` is the OpenRouter form and needs an OpenRouter key.
   - No retries: a failed request leaves that review unscored (counted as unprocessed). A rejected key, or no review scored at all, raises `LLM_UNAVAILABLE`.

6. **EDA / aggregation** — Pure, deterministic functions (no model calls). Definitions in `docs/decisions/0001-jev-sentiment-metrics.md`. Reviews map to sentiment by nearest level relative to the rubric midpoint (v3: 0 negative, 1 neutral, 2 positive). Everything downstream reads `scale.max_level` instead of assuming a range, so runs saved on the older 0–4 rubric still display correctly. Outputs: average score, net sentiment (% positive − % negative of scored reviews), level counts, 7/30/90-day and all-time windows, monthly trend (empty months kept), top terms with their average score, the analysed reviews' star distribution, and the review feed (each review with the features it mentions). Per feature: mention count and share of scored reviews, average category score, net sentiment, average stars of the reviewers who mention it, and up to 3 quotes (lowest-scored first). `Overall` covers scored reviews that mention no other category, using their overall score. Star ratings are reported alongside but never substituted for a missing score.

7. **UI** — Product header, KPI row (net sentiment, average Jev score, recency windows, positive/neutral/negative counts), score-level distribution, monthly score trend, feature cards (mention share vs. score, so common friction stands apart from rare but severe risk), term frequency coloured by average score, and the review feed pairing stars with each review's overall and per-feature Jev scores. Progress is streamed via Server-Sent Events while the pipeline runs.

### Data flow & run files (pandas + CSV)

Each analysis gets its own folder so stages can be inspected and re-run independently:

```
backend/data/runs/<item_id>_<YYYYmmdd-HHMMSS>/
├── product.json          # one product's metadata (name, category, ratings) — not tabular, so JSON
├── raw_reviews.csv       # scraper output, untouched
├── clean_reviews.csv     # after pandas cleaning
├── run_meta.json         # scraped_at, reviews_scraped, partial — scrape facts no CSV carries
├── features.json         # FeatureGenerationOutcome from Groq
├── jev_scores.csv        # Jev overall score: ONE ROW PER REVIEW sent to Jev
├── jev_category_scores.csv  # Jev per category: ONE ROW PER (scored review, category except Overall)
└── analysis.json         # the AnalysisResult returned by the API
```

CSV columns (keep these names stable; they are the contract between stages):

| File | Columns |
|------|---------|
| `raw_reviews.csv` / `clean_reviews.csv` | `review_id, rating, text, raw_text, review_date, sku_info, helpful_count` |
| `jev_scores.csv` | `review_id, score (0..max_level), level (nearest), confidence, model, rubric_version` |
| `jev_category_scores.csv` | `review_id, feature, mention_probability, mentioned, score, level, confidence` |

- `score`, `level` and `confidence` are empty for a review whose Jev request failed (it then has no category rows); aggregation treats it as unscored.
- In `jev_category_scores.csv`, `score`/`level`/`confidence` are empty unless `mentioned`.

---

## 3. Repository Layout

```
.
├── CLAUDE.md
├── backend/
│   ├── pyproject.toml            # uv-managed
│   ├── uv.lock
│   ├── .env.example
│   ├── app/
│   │   ├── main.py               # FastAPI app factory
│   │   ├── config.py             # pydantic-settings
│   │   ├── api/v1/               # routers (analyze, health)
│   │   ├── core/                 # url_validator, errors, logging
│   │   ├── models/               # Pydantic models (domain, jev, api)
│   │   ├── scraper/              # playwright client, parsers, pagination
│   │   ├── llm/
│   │   │   ├── groq_client.py
│   │   │   ├── feature_generator.py
│   │   │   ├── prompts/          # versioned prompt + Jev rubric files
│   │   │   └── jev/              # client.py (System One API), runner.py (bounded scoring)
│   │   └── pipeline/             # io, cleaning, jev_inputs, aggregation, orchestrator
│   ├── data/runs/                # per-run CSV/JSON files (git-ignored)
│   ├── scripts/                  # run_scraper/clean/features/jev/aggregate.py (isolated runs)
│   └── tests/
│       ├── fixtures/             # saved HTML + JSON review pages, LLM outputs
│       ├── unit/
│       └── integration/
└── frontend/
    ├── package.json
    ├── src/
    │   ├── app/                  # Next.js App Router
    │   ├── components/           # ui/, analysis/
    │   ├── lib/                  # api client, zod schemas, utils
    │   └── types/                # generated/handwritten TS types
    └── tests/
```

---

## 4. Build & Run Commands

### Prerequisites
- Python 3.12+, [`uv`](https://docs.astral.sh/uv/)
- Node.js 20+, `pnpm` (preferred) or `npm`
- A Groq API key (feature categories) and a TypeSafe API key (Jev scoring)

### Environment
`backend/.env` (copy from `.env.example`; never commit real keys):
```
GROQ_API_KEY=
GROQ_MODEL_FEATURES=openai/gpt-oss-120b
JEV_API_KEY=
JEV_BASE_URL=https://api.typesafe.ai/v1
JEV_MODEL=jev-1.14.0
JEV_MAX_CONCURRENCY=10
SCRAPER_HEADLESS=true
SCRAPER_MIN_DELAY_S=1.0
SCRAPER_MAX_DELAY_S=2.5
MAX_REVIEW_PAGES=100
CORS_ORIGINS=http://localhost:3000
```
`frontend/.env.local`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```
> Model names are defaults; check them before relying on them. Groq retired the Llama defaults by 2026-10 (`groq.Groq().models.list()`); `llama3-70b-8192` and `mixtral-8x7b-32768` return 400 "decommissioned", while `openai/gpt-oss-120b` (OpenAI's open-weight model) is live; Jev's ids are at `GET {JEV_BASE_URL}/models`.

### Backend
```bash
cd backend
uv sync                                   # install deps from uv.lock
uv run playwright install chromium        # one-time browser install
uv run fastapi dev app/main.py            # dev server on :8000 with reload
uv run fastapi run app/main.py            # production-style server
uv add <pkg>        /  uv add --dev <pkg> # add dependencies (never pip install)
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev            # http://localhost:3000
pnpm build && pnpm start
pnpm lint
pnpm typecheck      # tsc --noEmit
```

### Run stages in isolation
```bash
cd backend
# Scrape only → creates data/runs/<run>/product.json + raw_reviews.csv + run_meta.json
uv run python -m scripts.run_scraper "<daraz-url>" --max-pages 3
uv run python -m scripts.run_scraper "<daraz-url>" --headed          # watch the browser
uv run python -m scripts.run_scraper "<daraz-url>" --reviews-from dom # force the click fallback

# Clean only → clean_reviews.csv
uv run python -m scripts.run_clean --run data/runs/<run>

# Feature generation only → features.json
uv run python -m scripts.run_features --run data/runs/<run>

# Jev scoring only → jev_scores.csv + jev_category_scores.csv (limit for cheap test runs)
uv run python -m scripts.run_jev --run data/runs/<run> --limit 30

# Aggregation only → analysis.json
uv run python -m scripts.run_aggregate --run data/runs/<run>
```

### Quality gates (run before every commit)
```bash
# backend
uv run ruff check . && uv run ruff format --check .
uv run mypy app scripts
uv run pytest -m "not live"

# frontend
pnpm lint && pnpm typecheck && pnpm test
```

---

## 5. Code Conventions & Rules

### 5.1 General
- Small, single-purpose modules. Each pipeline stage is a function with typed input/output; the orchestrator composes them.
- No business logic in API routers — routers validate input, call the orchestrator, map errors to HTTP responses.
- Config only via `app/config.py` (`pydantic-settings`). No `os.getenv` scattered in code.
- Structured logging (`structlog` or stdlib JSON logging) with a `request_id` on every log line. Never log API keys or full raw HTML.

### 5.2 Python typing
- Python 3.12 syntax (`list[str]`, `X | None`). `mypy --strict` on `app/`.
- **Every boundary is a Pydantic v2 model or a schema-checked DataFrame**: LLM inputs/outputs and API request/response are Pydantic; tabular stages (raw → clean → jev_scores) are pandas DataFrames saved as CSV. No bare `dict` crossing module boundaries.
- **pandas + CSV rules**:
  - Read and write through one module, `app/pipeline/io.py` (`read_clean_reviews`, `write_scores`, `read_run_meta`, …) — never call `pd.read_csv` ad hoc.
  - Always pass explicit `dtype` on read (`review_id` is **`str`**, never int — leading zeros and long IDs break). Parse dates with `pd.to_datetime(..., utc=True, format="ISO8601")`: without `format`, pandas infers it from the first row and silently turns rows with fractional seconds into NaT.
  - Write with `encoding="utf-8"` and `index=False`; use `utf-8-sig` only for exports meant to be opened in Excel (keeps Urdu text readable).
  - Validate each DataFrame's columns and types on load with a `pandera` schema (or a `REQUIRED_COLUMNS` check) so a broken CSV fails loudly.
  - DataFrame → Jev: convert rows with `JEVReviewInput.model_validate(row)` over `df.to_dict("records")` (`app/pipeline/jev_inputs.py`); Jev output → one `jev_scores.csv` row per review and one `jev_category_scores.csv` row per (review, category).
  - Iterate rows with `to_dict("records")`, not `itertuples()` (pandas-stubs types `itertuples` fields as a broad union that fails `mypy --strict`).
  - Cleaning and aggregation functions are pure: DataFrame in, new DataFrame out, no in-place mutation of the input, no file I/O inside them.
- Use `Literal`/`Enum` for closed sets, `Field(ge=1, le=5)` for ratings, `model_config = ConfigDict(extra="forbid")` on all LLM output models so hallucinated keys fail validation.

Reference models (`app/models/jev.py`, `app/llm/jev/client.py`):
```python
class FeatureSet(BaseModel):            # Groq output, extra="forbid"
    product_category: str
    features: list[Feature] = Field(min_length=1, max_length=9)   # Feature(name, description)

class JEVReviewInput(BaseModel):        # one review sent to Jev
    review_id: str
    text: str
    star_rating: int = Field(ge=1, le=5)

class ScoreRubric(BaseModel):           # loaded from prompts/jev_sentiment_v2.json
    version: str
    question_id: str                    # "sentiment"
    instructions: str
    category_mention_instructions: str  # "{name}" / "{description}" placeholders
    category_score_instructions: str
    criteria: list[str] = Field(min_length=2, max_length=10)   # level 0 .. level n-1

class ScoreAnswer(BaseModel):           # Jev answers[...] for a Score question
    type: Literal["score"]
    score: float                        # probability-weighted level index, 0-based
    confidence: float
    probabilities: dict[str, float]

class NoulAnswer(BaseModel):            # Jev answers[...] for a Noul (yes/no) question
    type: Literal["noul"]
    noul: float                         # probability of "yes"
```
- Jev responses are parsed as typed API JSON (an unexpected shape raises `JEVRequestError`); there is no LLM-text parsing or repair step.

### 5.3 TypeScript
- `"strict": true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` + narrowing.
- API response types mirror the backend Pydantic models. Validate responses at runtime with **zod** in `src/lib/schemas.ts` (or generate types from FastAPI's OpenAPI schema via `openapi-typescript` — pick one and stay consistent).
- Server Components by default; `"use client"` only where interactivity is needed (URL form, charts, progress stream).

### 5.4 Scraping: rate limits & pagination
- **Be a polite client.** Randomized delay (`SCRAPER_MIN_DELAY_S`–`SCRAPER_MAX_DELAY_S`) between review page requests. Max **1 concurrent product scrape per process** by default; review pages are fetched sequentially per product.
- One Playwright browser per process, reused; a fresh **context** per job; always close contexts in `finally` / async context managers.
- Realistic headers (locale `en-PK`, standard desktop UA, `Accept-Language`). No proxy rotation or CAPTCHA-solving services — on a block we back off and report, we don't evade.
- Respect `robots.txt` and Daraz terms; only collect publicly visible review data; no personal data beyond what's needed (drop reviewer names from stored/returned data or truncate to initials).
- Pagination loop must be **bounded and idempotent**:
  - Stop on: empty page, no new `review_id`s (dedupe set), reported total reached, or `MAX_REVIEW_PAGES`.
  - Retries per page: 3 with exponential backoff + jitter (`tenacity`) on timeouts, 429, and 5xx.
  - On 429: honour `Retry-After` if present, otherwise back off ≥ 10s; after repeated 429s, return partial results with `partial=True`.
- Selectors live in **one** file (`app/scraper/selectors.py`) so DOM changes are a one-file fix.
- Cache scrape results by `item_id` (default 6h) to avoid re-hitting Daraz during development.

### 5.5 Model calls: Groq (categories) and Jev (review scoring)
- **Groq is used only for feature generation**: one call per product through `app/llm/groq_client.py` (shared instance, central timeout and retries), `with_structured_output(FeatureSet)`, temperature ~0.3. Review classification never goes to Groq. A Groq-based JEV attempt hit this tier's 8,000 tokens/min limit on 3 of 8 batches.
- **Jev scores reviews**: one request per review (overall Score + per-category Noul and Score) through `app/llm/jev/client.py`, run with `asyncio.TaskGroup` gated by `asyncio.Semaphore(JEV_MAX_CONCURRENCY)`. Never fire an unbounded `gather`. Reviews are capped at 8,000 chars to stay under Jev's ~32 KB standard-context limit.
- **No retry loops around Jev**: a failed request leaves the review unscored, and the job continues. Don't replace a missing score with a star-rating guess.
- Prompts and rubrics are versioned files in `app/llm/prompts/` (`features_v1.md`, `jev_sentiment_v3.json`; v1/v2 are kept because older runs cite them). Changing a rubric means a new version file, and the version appears in logs and in `jev_scores.csv`.
- Log per-job token usage and latency.

### 5.6 UI styling (Tailwind CSS)
- Tailwind v4 utility classes only; no inline `style` except for dynamic chart widths. Use `clsx`/`tailwind-merge` via a `cn()` helper.
- Design tokens (colors, radius, spacing) defined once in the Tailwind theme / CSS variables. **Light theme only** (product decision, 2026-10-16): no dark-mode variants.
- Star rating scale: `≥4.0` green, `3.0–3.9` teal, `<3.0` red; star glyphs use `--star` amber. Use the same scale everywhere.
- Sentiment colours: green positive, teal neutral, red negative (soft fill for charts, `-ink` variant for text, `-soft` for chips). AI score tone is relative to the run's range: positive from `max/2 + 0.5`, negative below `max/2 − 0.5` (0–2: ≥1.5 / <0.5). Both scales live in `src/lib/scale.ts`; never hard-code a score range.
- **White-label:** UI text never names the models, services or APIs behind it (no Jev, Groq, LLM). Say "AI sentiment score", "Smart Feature Analysis". Stage and error copy live in `src/lib/copy.ts`; server error messages are shown only for URL/product errors.
- **Live analysis:** `/analyze?url=` streams `GET /api/v1/analyze/stream` (SSE, events in `app/pipeline/progress.py` / `src/lib/stream.ts`): header first, progress tracker, live feature and KPI counts, shimmer skeletons for the rest, then the full dashboard at `/runs/<id>`.
- Theme: light neutral canvas, white cards (`rounded-xl`, hairline border, faint shadow), numbers in Geist Mono, dark chart tooltips (`ChartTooltip`).
- Recharts 3: don't use `<Cell>` (deprecated); colour via per-datum `fill` or a custom `shape`. Axis text style uses `fill`, never `stroke` (stroke outlines and blurs the text).
- Layout: mobile-first, single column on small screens, 2–3 column feature grid on `md+`. Max content width `max-w-6xl`.
- Components: shadcn/ui-style primitives in `components/ui/`; domain components (`FeatureCard`, `RatingBar`, `SentimentBreakdown`, `ReviewQuote`, `AnalysisProgress`) in `components/analysis/`.
- Charts with Recharts; always label axes and show values on hover; never rely on color alone (show numbers).
- Every async state has a designed view: idle, validating, scraping (with page count), analysing (batches done / total), success, partial, and error.
- Accessibility: semantic headings, focus-visible rings, `aria-live="polite"` on progress updates, contrast ≥ WCAG AA.

---

## 6. Testing & Error Handling

### 6.1 Error taxonomy
All domain errors subclass `AppError` (`app/core/errors.py`) and map to a consistent JSON body:
```json
{ "error": { "code": "INVALID_URL", "message": "Human-readable message", "details": {} } }
```
| Code | HTTP | When |
|------|------|------|
| `INVALID_URL` | 422 | Not a Daraz.pk product URL |
| `PRODUCT_NOT_FOUND` | 404 | Page 404s or product removed |
| `NO_REVIEWS` | 200 (empty result) | Product has zero reviews — show a friendly empty state |
| `SCRAPE_BLOCKED` | 503 | CAPTCHA / bot wall / repeated 429 |
| `SCRAPE_TIMEOUT` | 504 | Page or pagination exceeded time budget |
| `LLM_UNAVAILABLE` | 503 | Groq or Jev key missing/rejected, Groq down, or Jev could not score any review |
| `LLM_OUTPUT_INVALID` | 502 | Feature generation unrecoverable after repair |
| `RUN_NOT_FOUND` | 404 | `GET /api/v1/runs/{run_id}`: unknown or malformed id, or `analysis.json` saved in an older format |

### 6.2 Invalid URLs
- Validate on the **frontend** (zod regex, instant feedback) **and** the **backend** (authoritative).
- Backend checks: scheme `http/https`, host in `{daraz.pk, www.daraz.pk, m.daraz.pk}`, path matches `/products/...-i<digits>(-s<digits>)?.html`. Reject shortened links, other Daraz country domains, search/category pages, and anything else.
- Never fetch an arbitrary user-supplied URL — rebuild the canonical URL from the extracted `item_id` (prevents SSRF).
- Tests: table-driven unit tests for valid/invalid URLs (tracking params, mobile host, `.com.bd`/`.lk` domains, `javascript:` and IP hosts, missing item id).

### 6.3 CAPTCHAs & blocking
- Detect: slider/CAPTCHA iframes or known challenge selectors, redirects to verification pages, HTTP 403/429, or a 200 response missing expected product markers.
- Response: stop immediately, do not retry aggressively, save a screenshot + HTML to `backend/debug/` (git-ignored) in dev, raise `SCRAPE_BLOCKED`. If some reviews were already collected, continue the pipeline with them and set `partial=True` plus a UI banner.
- No automated CAPTCHA solving.
- Tests: fixture HTML for a challenge page asserts detection; integration tests with mocked responses for 429 → backoff → success and 429 → give up → partial.

### 6.4 Malformed model output
- **Feature generation (Groq)**: structured output with a Pydantic schema (`extra="forbid"`), then one repair attempt that sends the validation error back. If that fails too, fall back to a generic set (`Quality`, `Value for Money`, `Delivery & Packaging`, `Seller Service`, `Overall`) and flag it in the result (`used_fallback_features`).
- **Jev**: returns typed API JSON, not generated text, so there is no prompt-and-parse defence. A response that doesn't match `SystemOneResponse` is treated like any failed request: the review is left unscored.

### 6.5 Test strategy
- **Unit** (`tests/unit`, fast, no network): URL validator, cleaning, Jev client + runner (via `tests/jev_fakes.py`, an `httpx.MockTransport` stand-in for the System One API), feature-generation repair/fallback, aggregation math (hand-computed expected numbers). Cleaning and aggregation tests use small fixture CSVs in `tests/fixtures/csv/` and compare with `pd.testing.assert_frame_equal`.
- **Parser fixtures**: saved Daraz HTML and review-JSON pages in `tests/fixtures/`; parsers are tested against them, never against live Daraz in CI.
- **Models**: mock Groq with a fake `with_structured_output` (good, invalid → repair, invalid twice → fallback) and Jev with `tests/jev_fakes.py` (scores, HTTP errors, bad keys). A small golden set of ~30 labelled reviews is used to check rubric changes (`pytest -m eval`, run manually).
- **Integration**: FastAPI `TestClient` against the full pipeline with scraper, Groq and Jev mocked and run files in a temp folder.
- **Live** (`pytest -m live`, manual only): one real product scrape to detect Daraz DOM/API changes.
- **Frontend**: Vitest + Testing Library for components and the zod schemas; Playwright e2e for the happy path with a mocked API.
- Coverage target: ≥ 85% for `app/pipeline` and `app/llm/jev`.

---

## 7. Working Agreements for Claude

- Read this file and the relevant module before editing; keep changes scoped to the task.
- Run the quality gates in §4 before declaring work done; say which ones were run.
- Never commit secrets, `.env`, `debug/`, `data/runs/`, scraped data dumps, or Playwright traces.
- When Daraz markup or endpoints change, update `app/scraper/selectors.py`, the fixtures, and `app/scraper/README.md` together.
- When a prompt or Jev rubric changes, bump its version file rather than editing in place, and re-run the eval set.
- Record notable architecture decisions in `docs/decisions/` (short ADRs) and update §2 here if the pipeline changes.

---

## 8. Open Questions / TODO
- Category mentions partly follow Daraz's review-form labels: products whose generated categories match the form ("Cleaning", "Freshness") get high mention counts from filled-in templates. Decide whether to tell Groq to avoid form-label categories, or to flag them in the UI.
- Decide on job model: synchronous request with SSE progress (current plan) vs. background job queue (needed if analyses exceed ~60s).
- Persistence: CSV run folders for now; revisit SQLite/Postgres (or Parquet) if run history or multi-user access is needed.
- Decide whether to show per-feature trends over time using review dates.
