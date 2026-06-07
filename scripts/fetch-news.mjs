// Fetches the latest articles from four health-tech news sources via their RSS
// feeds, merges them into a single newest-first list, and writes data/news.json.
//
// Run with:  node scripts/fetch-news.mjs
// Runs automatically once a day via .github/workflows/update-news.yml

import Parser from "rss-parser";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, "..", "data", "news.json");

// Some publishers (Healthcare IT News, MobiHealthNews) block default bot
// user-agents with HTTP 403, so we present a normal browser user-agent.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Max articles to keep in the final feed.
const MAX_ITEMS = 120;

// Each source has a direct RSS feed and a domain. We try the direct feed first;
// if it's blocked (Cloudflare returns 403 to data-center IPs such as GitHub's
// runners), we fall back to Google News RSS scoped to that publisher's domain,
// which Google fetches server-side and is not IP-blocked.
const SOURCES = [
  {
    id: "stat",
    name: "STAT News",
    url: "https://www.statnews.com/feed/",
    domain: "statnews.com",
  },
  {
    id: "medcity",
    name: "MedCity News",
    url: "https://medcitynews.com/feed/",
    domain: "medcitynews.com",
  },
  {
    id: "hitn",
    name: "Healthcare IT News",
    url: "https://www.healthcareitnews.com/home/feed",
    domain: "healthcareitnews.com",
  },
  {
    id: "mobi",
    name: "MobiHealthNews",
    url: "https://www.mobihealthnews.com/feed",
    domain: "mobihealthnews.com",
  },
];

function googleNewsUrl(domain) {
  const q = encodeURIComponent(`site:${domain} when:14d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

const parser = new Parser({ timeout: 20000 });

// Fetch the raw feed XML. Some publishers (Healthcare IT News, MobiHealthNews) sit
// behind Cloudflare bot protection that blocks Node's TLS fingerprint with HTTP 403,
// even with browser-like headers. curl gets through, so we use it. curl is available
// on Windows, macOS, and the GitHub Actions Ubuntu runners by default.
async function fetchXml(url) {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sSL", // silent, show errors, follow redirects
      "--compressed",
      "--max-time", "25",
      "--fail", // non-2xx -> non-zero exit
      "-A", BROWSER_UA,
      "-H", "Accept: application/rss+xml, application/xml, text/xml, */*",
      "-H", "Accept-Language: en-US,en;q=0.9",
      url,
    ],
    { maxBuffer: 20 * 1024 * 1024, encoding: "utf8" }
  );
  return stdout;
}

// Strip HTML tags and collapse whitespace, then trim to a short snippet.
function toSnippet(html, max = 240) {
  if (!html) return "";
  const text = String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&hellip;/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

function toISO(item) {
  const raw = item.isoDate || item.pubDate || item.date;
  const d = raw ? new Date(raw) : null;
  return d && !isNaN(d) ? d.toISOString() : null;
}

// Parse a publisher's own RSS feed.
function parseDirect(feed, source) {
  return (feed.items || [])
    .map((item) => ({
      title: (item.title || "").trim(),
      link: (item.link || "").trim(),
      source: source.name,
      sourceId: source.id,
      date: toISO(item),
      snippet: toSnippet(item.contentSnippet || item.content || item.summary),
    }))
    .filter((it) => it.title && it.link);
}

// Parse Google News RSS results. Titles arrive as "Headline - Publisher"; we strip
// the trailing publisher suffix. Google doesn't provide article summaries, so the
// snippet is left empty. Links are Google redirect URLs that resolve to the article.
function parseGoogle(feed, source) {
  return (feed.items || [])
    .map((item) => {
      let title = (item.title || "").trim();
      title = title.replace(/\s+-\s+[^-]+$/, "").trim() || title;
      return {
        title,
        link: (item.link || "").trim(),
        source: source.name,
        sourceId: source.id,
        date: toISO(item),
        snippet: "",
      };
    })
    .filter((it) => it.title && it.link);
}

async function fetchSource(source) {
  // 1) Try the publisher's own feed.
  try {
    const feed = await parser.parseString(await fetchXml(source.url));
    const items = parseDirect(feed, source);
    if (items.length > 0) {
      console.log(`  ✓ ${source.name}: ${items.length} items (direct feed)`);
      return items;
    }
    throw new Error("no items in direct feed");
  } catch (err) {
    console.warn(`  … ${source.name} direct feed unavailable (${err.message}); trying Google News`);
  }

  // 2) Fall back to Google News scoped to the publisher's domain.
  try {
    const feed = await parser.parseString(await fetchXml(googleNewsUrl(source.domain)));
    const items = parseGoogle(feed, source);
    console.log(`  ✓ ${source.name}: ${items.length} items (via Google News)`);
    return items;
  } catch (err) {
    console.warn(`  ✗ ${source.name} failed entirely: ${err.message}`);
    return []; // skip a failing source rather than crashing the whole build
  }
}

async function main() {
  console.log("Fetching health-tech news feeds...");
  const results = await Promise.all(SOURCES.map(fetchSource));
  let all = results.flat();

  // De-duplicate by link.
  const seen = new Set();
  all = all.filter((it) => {
    if (seen.has(it.link)) return false;
    seen.add(it.link);
    return true;
  });

  // Sort newest first; items without a date sink to the bottom.
  all.sort((a, b) => {
    const ta = a.date ? Date.parse(a.date) : 0;
    const tb = b.date ? Date.parse(b.date) : 0;
    return tb - ta;
  });

  all = all.slice(0, MAX_ITEMS);

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES.map(({ id, name, url }) => ({ id, name, url })),
    count: all.length,
    items: all,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${all.length} articles to data/news.json`);

  if (all.length === 0) {
    process.exitCode = 1; // signal failure if every source was unreachable
  }
}

main();
