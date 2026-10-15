# Daraz AI Review Analyzer

Takes a Daraz.pk product URL, scrapes the product and its reviews, uses a
Groq-hosted LLM to generate product-specific feature categories, and maps
every review to those features with per-feature sentiment and ratings. The
results are aggregated and shown in a Next.js dashboard.

See [CLAUDE.md](./CLAUDE.md) for the full architecture, conventions, and
build/run commands.

## Status

Bootstrap only: project structure, dependencies, and a `/health` endpoint.
Scraping, LLM integration, and UI components are implemented in a follow-up
session.

## Quick start

### Backend

```bash
cd backend
uv sync
uv run playwright install chromium   # one-time
cp .env.example .env                 # fill in GROQ_API_KEY
uv run fastapi dev app/main.py       # http://localhost:8000/health
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev                          # http://localhost:3000
```
