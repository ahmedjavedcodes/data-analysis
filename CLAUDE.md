# CLAUDE.md — Daraz AI Review Analyzer

Central guide, memory, and coding standard for this repository. Read this before making changes. Update it when architecture, commands, or conventions change.

---

## 1. Project Overview

**Daraz AI Review Analyzer** takes a Daraz.pk product URL, scrapes the product and **all** of its reviews, uses a Groq-hosted LLM to generate product-specific feature categories (e.g. Camera, Battery, Value for Money for a phone), and then runs every review through **JEV** (JSON Evaluator/Router) to map it to those features with a per-feature sentiment and star rating. The results are aggregated (EDA) and shown in a Next.js dashboard as feature-level insights: how many reviewers mentioned each feature and its average rating.

**Core value:** turn hundreds of unstructured reviews into a "what do buyers actually think about each feature" breakdown in seconds.

---

## 2. System Architecture

```
┌──────────────┐   POST /api/v1/analyze   ┌──────────────────────────── FastAPI backend ────────────────────────────┐
│  Next.js UI  │ ───────────────────────▶ │ 1. Validate URL                                                         │
│  (URL input, │                          │ 2. Scrape product + paginated reviews  (Playwright → BeautifulSoup)     │
│  dashboard)  │ ◀─── SSE progress ────── │ 3. Clean & normalize                                                    │
│              │ ◀─── AnalysisResult ──── │ 4. Generate feature categories        (Groq LLM, structured output)     │
└──────────────┘                          │ 5. Batch reviews → JEV (parallel)     (Groq LLM, Pydantic-validated)    │
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
| 5 | JEV batch processing | `app/llm/jev/` | `clean_reviews.csv` rows → `JEVReviewInput` batches → `jev_mentions.csv` |
| 6 | EDA / aggregation (pandas) | `app/pipeline/aggregation.py` | `jev_mentions.csv` + `clean_reviews.csv` → `feature_summary.csv` + `AnalysisResult` |
| 7 | UI rendering | `frontend/` | `AnalysisResult` → dashboard |

### Stage details

1. **URL validation** — Accept only `daraz.pk` product URLs. Canonical shape:
   `https://www.daraz.pk/products/<slug>-i<itemId>-s<skuId>.html` (query string optional and stripped).
   Also accept mobile (`m.daraz.pk`) and missing `www`. Extract `itemId` (required) and `skuId` (optional). Reject everything else **before** launching a browser.

2. **Scraping** — Playwright (async, Chromium, headless) renders the PDP. Extract product name, category breadcrumb, price, overall rating, total rating count, and rating distribution.
   For reviews, **prefer the JSON review endpoint the page itself calls** (intercept it via Playwright network listeners, then page through it with `httpx` using the same cookies/headers). Fall back to clicking the review pagination control and parsing the DOM with BeautifulSoup only if the endpoint is unavailable. Stop when a page returns no new reviews, the reported total is reached, or `MAX_REVIEW_PAGES` is hit. The exact endpoint and parameters must be confirmed against live Daraz traffic and recorded in `app/scraper/README.md`, since Daraz can change them.

3. **Cleaning (pandas)** — The scraper writes every review to `raw_reviews.csv`; `clean_reviews(df: pd.DataFrame) -> pd.DataFrame` loads it and applies vectorized steps: strip HTML (`str.replace` regex), normalize Unicode (`str.normalize("NFKC")`) and whitespace, drop empty rows and duplicates (`drop_duplicates(subset=["review_id"])`, then on `["text_norm", "rating"]`), coerce ratings with `pd.to_numeric(...).clip(1, 5).astype("Int64")`, parse dates with `pd.to_datetime(..., utc=True, errors="coerce")`. Keep Roman Urdu / Urdu text as-is (the LLM handles it) and keep the original in `raw_text`. Output: `clean_reviews.csv`.

4. **Feature generation (Groq)** — One LLM call with product name + breadcrumb category + a sample of ~20 reviews. Returns a `FeatureSet` of 4–8 concise, non-overlapping feature names with one-line descriptions. `Overall` is always appended by code (never trust the LLM to include it). Cache by `item_id` (TTL 24h).

5. **JEV (JSON Evaluator/Router)** — Our internal component that, for each review, decides which features it mentions and the sentiment + 1–5 rating per feature.
   - Reviews mentioning several features map to **each** of them ("great camera but slow processor" → Camera: positive/5, Processor: negative/2).
   - Generic reviews ("good product", "nice") route to **Overall**, using the reviewer's star rating.
   - Features not in the `FeatureSet` are never invented; unknown mentions route to `Overall`.
   - Implemented as a LangGraph graph: `route → evaluate → validate → (repair | accept)`. Output is validated against Pydantic models; on failure it goes through the repair path (see §5).

6. **EDA / aggregation** — Pure, deterministic functions (no LLM). Per feature: `mention_count`, `mention_share` (% of reviews), `avg_rating`, sentiment breakdown (positive/neutral/negative), and 2–3 representative quotes. Also: overall rating distribution, total reviews analysed vs. scraped, and the count of reviews that failed JEV.

7. **UI** — Product header card, overall rating summary, feature cards sorted by `mention_count`, bar chart of average rating per feature, sentiment breakdown, and expandable example quotes. Progress is streamed via Server-Sent Events while the pipeline runs.

### Data flow & run files (pandas + CSV)

Each analysis gets its own folder so stages can be inspected and re-run independently:

```
backend/data/runs/<item_id>_<YYYYmmdd-HHMMSS>/
├── product.json          # one product's metadata (name, category, ratings) — not tabular, so JSON
├── raw_reviews.csv       # scraper output, untouched
├── clean_reviews.csv     # after pandas cleaning
├── features.json         # FeatureSet from Groq
├── jev_mentions.csv      # JEV output, long format: ONE ROW PER (review, feature) MENTION
└── feature_summary.csv   # pandas groupby result used to build AnalysisResult
```

CSV columns (keep these names stable; they are the contract between stages):

| File | Columns |
|------|---------|
| `raw_reviews.csv` / `clean_reviews.csv` | `review_id, rating, text, raw_text, review_date, sku_info, helpful_count` |
| `jev_mentions.csv` | `review_id, feature, sentiment, rating, evidence, source (llm/fallback), batch_id, prompt_version` |
| `feature_summary.csv` | `feature, mention_count, mention_share, avg_rating, positive, neutral, negative` |

- A review that mentions 3 features produces 3 rows in `jev_mentions.csv`; this keeps it flat for pandas (`groupby("feature")`) instead of nesting lists in a cell.
- `mention_share` = unique `review_id`s per feature ÷ total rows in `clean_reviews.csv`.

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
│   │   │   ├── prompts/          # versioned prompt templates
│   │   │   └── jev/              # graph.py, nodes.py, repair.py
│   │   └── pipeline/             # cleaning, batching, aggregation, orchestrator
│   ├── data/runs/                # per-run CSV/JSON files (git-ignored)
│   ├── scripts/                  # run_scraper.py, run_clean.py, run_jev.py (isolated runs)
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
- A Groq API key

### Environment
`backend/.env` (copy from `.env.example`; never commit real keys):
```
GROQ_API_KEY=
GROQ_MODEL_FEATURES=llama-3.3-70b-versatile
GROQ_MODEL_JEV=llama-3.1-8b-instant
JEV_BATCH_SIZE=10
JEV_MAX_CONCURRENCY=5
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
> Model names are defaults; check Groq's current model list before relying on them.

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
# Scrape only → creates data/runs/<run>/product.json + raw_reviews.csv
uv run python -m scripts.run_scraper "<daraz-url>" --max-pages 3
uv run python -m scripts.run_scraper "<daraz-url>" --headed          # watch the browser

# Clean only → clean_reviews.csv
uv run python -m scripts.run_clean --run data/runs/<run>

# Feature generation only → features.json
uv run python -m scripts.run_features --run data/runs/<run>

# JEV only → jev_mentions.csv (limit for cheap test runs)
uv run python -m scripts.run_jev --run data/runs/<run> --limit 30

# Aggregation only → feature_summary.csv
uv run python -m scripts.run_aggregate --run data/runs/<run>
```

### Quality gates (run before every commit)
```bash
# backend
uv run ruff check . && uv run ruff format --check .
uv run mypy app
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
- **Every boundary is a Pydantic v2 model or a schema-checked DataFrame**: LLM inputs/outputs and API request/response are Pydantic; tabular stages (raw → clean → mentions → summary) are pandas DataFrames saved as CSV. No bare `dict` crossing module boundaries.
- **pandas + CSV rules**:
  - Read and write through one module, `app/pipeline/io.py` (`read_reviews`, `write_reviews`, `read_mentions`, …) — never call `pd.read_csv` ad hoc.
  - Always pass explicit `dtype` on read (`review_id` is **`str`**, never int — leading zeros and long IDs break), and `parse_dates` for date columns.
  - Write with `encoding="utf-8"` and `index=False`; use `utf-8-sig` only for exports meant to be opened in Excel (keeps Urdu text readable).
  - Validate each DataFrame's columns and types on load with a `pandera` schema (or a `REQUIRED_COLUMNS` check) so a broken CSV fails loudly.
  - DataFrame → JEV: convert rows with `JEVReviewInput.model_validate(row)` over `df.to_dict("records")`; JEV output → DataFrame: flatten `JEVReviewResult` to one row per mention before writing.
  - Cleaning and aggregation functions are pure: DataFrame in, new DataFrame out, no in-place mutation of the input, no file I/O inside them.
- Use `Literal`/`Enum` for closed sets, `Field(ge=1, le=5)` for ratings, `model_config = ConfigDict(extra="forbid")` on all LLM output models so hallucinated keys fail validation.

Reference JEV models:
```python
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Sentiment = Literal["positive", "neutral", "negative"]

class Feature(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=40)
    description: str

class FeatureSet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_category: str
    features: list[Feature] = Field(min_length=1, max_length=9)

class JEVReviewInput(BaseModel):
    review_id: str
    text: str
    star_rating: int = Field(ge=1, le=5)

class JEVBatchInput(BaseModel):
    batch_id: int
    features: list[str]            # allowed feature names, incl. "Overall"
    reviews: list[JEVReviewInput]

class FeatureMention(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature: str                   # must be in JEVBatchInput.features (checked post-parse)
    sentiment: Sentiment
    rating: int = Field(ge=1, le=5)
    evidence: str = Field(max_length=200)   # short quote from the review

class JEVReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    review_id: str
    mentions: list[FeatureMention] = Field(min_length=1)

class JEVBatchOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    batch_id: int
    results: list[JEVReviewResult]
```
- After parsing, run a **semantic validator**: every `review_id` in input appears exactly once in output; every `feature` is in the allowed list; generic reviews have exactly one `Overall` mention.

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

### 5.5 Async LLM batch processing
- All Groq calls go through `app/llm/groq_client.py` (async client, shared instance, central retries and timeouts).
- Batch reviews into groups of `JEV_BATCH_SIZE` (default 10; keep prompt + output under the model's context and Groq's per-request token limits). Truncate individual reviews over ~1,000 characters.
- Run batches with `asyncio.TaskGroup` gated by an `asyncio.Semaphore(JEV_MAX_CONCURRENCY)`. Never fire unbounded `gather` over all batches.
- Respect Groq rate limits: on 429 back off using `retry-after` / rate-limit headers; reduce effective concurrency adaptively if 429s repeat.
- Use JSON mode / structured outputs (`response_format={"type": "json_object"}` or LangChain `with_structured_output(...)`), `temperature=0` for JEV, low temperature (~0.3) for feature generation.
- One failed batch must **not** fail the job: retry → split batch in half → finally mark those reviews `unprocessed` and continue.
- Prompts are versioned files in `app/llm/prompts/` (e.g. `jev_v1.md`); include the version in logs and results.
- Track and log per-job token usage and latency.

### 5.6 UI styling (Tailwind CSS)
- Tailwind v4 utility classes only; no inline `style` except for dynamic chart widths. Use `clsx`/`tailwind-merge` via a `cn()` helper.
- Design tokens (colors, radius, spacing) defined once in the Tailwind theme / CSS variables; support light and dark mode.
- Rating color scale: `≥4.0` emerald, `3.0–3.9` amber, `<3.0` rose. Use the same scale everywhere (cards, bars, badges).
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
| `LLM_UNAVAILABLE` | 503 | Groq down or rate limit exhausted |
| `LLM_OUTPUT_INVALID` | 502 | Feature generation unrecoverable after repair |

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

### 6.4 Malformed LLM JSON
Layered defence, in order:
1. **Prevent**: JSON mode / structured output, explicit schema in the prompt, `temperature=0`, one short worked example.
2. **Parse leniently**: strip code fences and leading/trailing prose before `json.loads`.
3. **Validate strictly**: Pydantic (`extra="forbid"`) + semantic validator (§5.2).
4. **Repair**: one retry sending the validation error back to the model ("Fix this JSON to match the schema; errors: …").
5. **Degrade**: split the batch and retry; if still invalid, map affected reviews to `Overall` using their star rating with `source="fallback"` so aggregates stay honest, and count them in `unprocessed_reviews`.
- Feature generation failure after repair → fall back to a generic set (`Quality`, `Value for Money`, `Delivery & Packaging`, `Seller Service`, `Overall`) and flag it in the result.

### 6.5 Test strategy
- **Unit** (`tests/unit`, fast, no network): URL validator, cleaning, batching, JEV semantic validator, repair logic, aggregation math (hand-computed expected numbers). Cleaning and aggregation tests use small fixture CSVs in `tests/fixtures/csv/` and compare with `pd.testing.assert_frame_equal`.
- **Parser fixtures**: saved Daraz HTML and review-JSON pages in `tests/fixtures/`; parsers are tested against them, never against live Daraz in CI.
- **LLM**: mock the Groq client with recorded responses (good, malformed, wrong feature names, missing review ids). A small golden set of ~30 labelled reviews is used to check JEV prompt changes (`pytest -m eval`, run manually).
- **Integration**: FastAPI `TestClient`/`httpx.AsyncClient` against the full pipeline with scraper + LLM mocked.
- **Live** (`pytest -m live`, manual only): one real product scrape to detect Daraz DOM/API changes.
- **Frontend**: Vitest + Testing Library for components and the zod schemas; Playwright e2e for the happy path with a mocked API.
- Coverage target: ≥ 85% for `app/pipeline` and `app/llm/jev`.

---

## 7. Working Agreements for Claude

- Read this file and the relevant module before editing; keep changes scoped to the task.
- Run the quality gates in §4 before declaring work done; say which ones were run.
- Never commit secrets, `.env`, `debug/`, `data/runs/`, scraped data dumps, or Playwright traces.
- When Daraz markup or endpoints change, update `app/scraper/selectors.py`, the fixtures, and `app/scraper/README.md` together.
- When a prompt changes, bump its version file rather than editing in place, and re-run the eval set.
- Record notable architecture decisions in `docs/decisions/` (short ADRs) and update §2 here if the pipeline changes.

---

## 8. Open Questions / TODO
- Confirm the current Daraz review JSON endpoint and its pagination params from live traffic.
- Decide on job model: synchronous request with SSE progress (current plan) vs. background job queue (needed if analyses exceed ~60s).
- Persistence: CSV run folders for now; revisit SQLite/Postgres (or Parquet) if run history or multi-user access is needed.
- Decide whether to show per-feature trends over time using review dates.
