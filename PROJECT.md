# Daraz AI Review Analyzer

**Repository:** https://github.com/ahmedjavedcodes/data-analysis
**Demo video:** https://drive.google.com/drive/folders/1iROWHhrvVUgerL6DbxhnKk1gFBo9QcFl?usp=drive_link

## What it is

Popular products on [Daraz.pk](https://www.daraz.pk), Pakistan's largest online marketplace, can have hundreds of reviews in English, Urdu and Roman Urdu. Reading them all to learn whether the battery is good or the packaging is poor takes a long time.

**Daraz AI Review Analyzer** does that reading for you. Paste a Daraz product link, and within seconds you get a dashboard showing:
- how buyers feel about the product overall;
- how they feel about **each feature that matters for that product**: for a phone that might be *Camera* and *Battery*, for toothpaste *Freshness*, *Taste* and *Value for Money*;
- whether opinion is getting better or worse over time;
- the reviews behind every number.

## How it works

1. **You paste a link.** The app checks that it is a real Daraz.pk product link.
2. **It collects the reviews.** It opens the product page the way a browser would and gathers the product details and every public review. It never collects reviewers' names.
3. **It cleans the text.** It removes duplicates, empty reviews and formatting junk, and keeps Urdu and Roman Urdu as written.
4. **AI picks the features.** An AI model reads the product name, its category and a sample of reviews, then chooses 4–8 features that buyers of this kind of product care about.
5. **AI reads every review.** A second AI model rates each review as **Negative, Neutral or Positive**. For each feature, it also decides whether the review mentions it and, if so, how the buyer feels about it. It understands Roman Urdu complaints such as *"kaha kuch bheja kuch"* (sent the wrong item), *"farig"* (useless) and *"dhoka"* (scam).
6. **It adds everything up.** The results become clear numbers and charts.

You watch each step live on screen while the analysis runs, instead of waiting on a loading spinner.

## What the dashboard shows

- **Product header:** name, category, price and the Daraz star rating.
- **Feature breakdown:** how often each feature is mentioned and how positive buyers are about it. Common complaints stand apart from rare but serious ones.
- **Overall mood:** the average AI sentiment score, net sentiment (% positive minus % negative), and positive / neutral / negative counts.
- **Recent vs. all time:** the same figures for the last 7, 30 and 90 days, to show whether things are improving.
- **Highlights and pain points:** the most-used words and how buyers felt when they used them.
- **Mood over time:** a month-by-month trend.
- **Review feed:** each review with its stars, its AI score, and the features it talks about.

A useful signal: a feature can have a **high star rating but a low AI score**. For example, buyers give 5 stars but still grumble about packaging. Stars alone hide that.

## Built with

| Part | Technology |
|---|---|
| Website | Next.js, React, Tailwind CSS, Recharts |
| Server | Python, FastAPI, live progress over Server-Sent Events |
| Collecting reviews | Playwright (headless Chrome), httpx |
| Data processing | pandas |
| Choosing features | Groq-hosted LLM |
| Scoring reviews | TypeSafe Jev |

Each analysis is saved, so earlier results can be reopened without collecting the reviews again.

## Example result

**Sensodyne toothpaste:**
- all 78 public reviews were collected, read and scored in about **13 seconds**;
- overall score **1.72 / 2**, net sentiment **+74** (strongly positive);
- buyers who gave 5 stars still scored *Packaging*, *Taste* and *Value for Money* noticeably lower than the product overall.

## Quality and care

- **Tests:** 110 automated tests cover link checking, review collection, cleaning, the AI steps and the calculations, and strict lint and type checks pass.
- **Polite scraping:** the app pauses between requests and stops (rather than fighting) if Daraz shows a bot check.
- **Privacy:** no reviewer names or IDs are stored.

## Run it yourself

You need Python 3.12+, Node.js 20+, a Groq API key and a TypeSafe API key.

```bash
# backend
cd backend
cp .env.example .env              # add GROQ_API_KEY and JEV_API_KEY
uv sync
uv run playwright install chromium
uv run fastapi dev app/main.py    # http://localhost:8000

# frontend (in a second terminal)
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

Open http://localhost:3000 and paste a Daraz.pk product link.

For the developer guide and design decisions, see [`CLAUDE.md`](CLAUDE.md) and [`docs/decisions/`](docs/decisions/).
