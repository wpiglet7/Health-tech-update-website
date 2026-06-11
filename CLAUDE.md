# CLAUDE.md

Guidance for working in this repository.

## What this is

A **free, auto-updating health-tech news website** hosted on GitHub Pages. It
aggregates articles from four sources (STAT News, MedCity News, Healthcare IT
News, MobiHealthNews) once a day, writes a daily summary, and serves a static
site. No backend, no build framework — plain HTML/CSS/JS plus two Node scripts.

- **Live:** https://wpiglet7.github.io/Health-tech-update-website/
- **Repo:** https://github.com/wpiglet7/Health-tech-update-website
- The owner is a non-coder — keep things simple and explain changes plainly.

## Architecture

```
GitHub Actions (daily cron, 0 21 * * * UTC = 06:00 KST)
  └─ npm run fetch      → scripts/fetch-news.mjs  → data/news.json
  └─ npm run summarize  → scripts/summarize.mjs   → data/summaries/<date>.json
                                                   + data/summaries-index.json
  └─ commits data/ back to main
GitHub Pages serves the static files. The pages then fetch the JSON at runtime.
```

## Files

| File | Role |
| --- | --- |
| `index.html` | Landing page (tldr.tech-style). Uses `landing.css` + `landing.js`. |
| `news.html` | The news app (Latest News / Today's Summary / Past Summaries tabs). Uses `styles.css` + `app.js`. |
| `landing.js` | Fetches live data for the landing previews (today's summary, headlines). |
| `app.js` | Renders the feed, source filters, search, and the summary tabs. Opens a tab from the URL hash (`news.html#today`). |
| `scripts/fetch-news.mjs` | Fetches the 4 RSS feeds, merges, de-dupes, writes `data/news.json`. |
| `scripts/summarize.mjs` | Diffs new articles vs. previous, writes the dated summary + index. |
| `data/news.json` | Latest merged articles (generated). |
| `data/summaries/<YYYY-MM-DD>.json` | One daily summary per day (generated). |
| `data/summaries-index.json` | Newest-first list of summary dates (generated). |
| `.github/workflows/update-news.yml` | The daily job. |

The `data/*` files are generated but **committed** (Pages serves them; the diff in
`summarize.mjs` needs the previous `news.json` from git history).

## Important gotchas

- **Cloudflare blocks data-center IPs.** Healthcare IT News and MobiHealthNews
  return HTTP 403 to GitHub Actions runners. `fetch-news.mjs` tries each
  publisher's direct RSS via `curl`, and on failure falls back to **Google News
  RSS** scoped to that domain (`site:<domain>`), which Google fetches server-side.
  Google links are redirect URLs; titles arrive as "Headline - Publisher" and the
  suffix is stripped. STAT News and MedCity News work via direct feed.
- **De-dup by link AND normalized title.** Google News can return the same article
  under multiple URLs, and the two HIMSS sites cross-post. Both `fetch-news.mjs`
  and `summarize.mjs` de-dupe on a normalized (lowercased, alnum-only) title.
- **AI vs digest summary.** `summarize.mjs` uses the Claude Messages API
  (`claude-haiku-4-5`) when the `ANTHROPIC_API_KEY` repo **secret** is set;
  otherwise it writes a free deterministic digest. It always degrades gracefully.
- **"New today" detection** compares the freshly fetched `news.json` against the
  previous committed version via `git show HEAD:data/news.json`.
- **Dates:** the daily date is computed in **KST (UTC+9)**; UI dates are forced to
  `en-US` (the chosen UI language) regardless of the visitor's locale.

## Local development

```bash
npm install
npm run fetch       # refresh data/news.json
npm run summarize   # refresh today's summary (set ANTHROPIC_API_KEY for AI mode)
npm run build       # both
```

Preview the static site with any static server, e.g. `npx serve -l 4173 .`, then
open `index.html` (landing) or `news.html` (app).

## Deploy / operations

- Pushing to `main` triggers a Pages rebuild automatically.
- Manually run the daily job: `gh workflow run update-news.yml`.
- The `ANTHROPIC_API_KEY` secret enables AI summaries (Settings → Secrets and
  variables → Actions). Without it, summaries fall back to the free digest.

## Conventions

- No frameworks or bundlers — keep it vanilla HTML/CSS/JS.
- Source brand colors are defined as CSS vars (`--stat`, `--medcity`, `--hitn`,
  `--mobi`) in both `styles.css` and `landing.css`; reuse them for source badges.
- Escape any text inserted into HTML (see `escapeHtml` in `app.js`/`landing.js`).
- Keep the site resilient: a failing feed or missing API key must never break the
  page — fall back, don't crash.
```
