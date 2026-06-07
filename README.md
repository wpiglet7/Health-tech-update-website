# ⚕️ Health-Tech News

A simple, free website that shows the latest **health-tech news and reports**,
gathered automatically from four leading sources:

- [STAT News](https://www.statnews.com/) — healthcare & biotech journalism
- [MedCity News](https://medcitynews.com/) — health-tech startups & investment
- [Healthcare IT News](https://www.healthcareitnews.com/) — hospital IT, EMR, digital health infrastructure
- [MobiHealthNews](https://www.mobihealthnews.com/) — mobile health, wearables, digital therapeutics

**Live site:** https://wpiglet7.github.io/Health-tech-update-website/

## How it works

- A scheduled job (GitHub Actions) runs **once a day** and pulls the newest articles
  from each source's RSS feed.
- It merges them into one newest-first list (`data/news.json`).
- It then writes a **daily summary** of what's new (`data/summaries/<date>.json`) and
  adds it to a log you can browse by date.
- The website (`index.html`) has three tabs: **Latest News** (filter + search),
  **Today's Summary**, and **Past Summaries**. Each headline links to the original.

You don't need to do anything to keep it updated — it refreshes itself daily.

## Daily summaries (free by default, AI optional)

Out of the box, each day's summary is a free auto-generated digest (counts +
headlines). To upgrade to an **AI-written** summary:

1. Create an Anthropic API key at <https://console.anthropic.com/>.
2. In this repo: **Settings → Secrets and variables → Actions → New repository
   secret**. Name it `ANTHROPIC_API_KEY` and paste the key.

That's it — the next daily run writes an AI summary instead. Cost is roughly a few
cents per month (uses the inexpensive Claude Haiku model). Remove the secret anytime
to fall back to the free digest.

## Files

| File | What it does |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The website you see |
| `scripts/fetch-news.mjs` | Fetches & merges the news feeds |
| `data/news.json` | The latest articles (auto-generated) |
| `.github/workflows/update-news.yml` | The daily auto-update job |

## Running it yourself (optional)

```bash
npm install
npm run fetch      # refreshes data/news.json
```

Then open `index.html` in a browser.
