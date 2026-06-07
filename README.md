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
- The website (`index.html`) shows them as cards you can **filter by source** and
  **search**. Each headline links to the original article.

You don't need to do anything to keep it updated — it refreshes itself daily.

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
