// Generates a daily summary of NEW health-tech articles and appends it to a log.
//
// - "New" = articles in data/news.json that weren't in the previous committed
//   version (compared via `git show HEAD:data/news.json`).
// - If ANTHROPIC_API_KEY is set, Claude writes a short prose summary.
//   Otherwise a deterministic free digest is generated, so the site always works.
// - Writes data/summaries/<YYYY-MM-DD>.json and updates data/summaries-index.json.
//
// Run with:  node scripts/summarize.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const NEWS_FILE = join(DATA_DIR, "news.json");
const SUMMARIES_DIR = join(DATA_DIR, "summaries");
const INDEX_FILE = join(DATA_DIR, "summaries-index.json");

const MODEL = "claude-haiku-4-5"; // cheap, strong at summarization
const MAX_ITEMS_IN_DAY = 80;

// Today's date in Korea Standard Time (UTC+9), as YYYY-MM-DD.
function kstDateString(d = new Date()) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

// Previous committed news.json (the last run's articles), via git.
async function previousLinks() {
  try {
    const { stdout } = await execFileAsync("git", ["show", "HEAD:data/news.json"], {
      cwd: join(__dirname, ".."),
      maxBuffer: 20 * 1024 * 1024,
    });
    const prev = JSON.parse(stdout);
    return new Set((prev.items || []).map((it) => it.link));
  } catch {
    return new Set(); // no previous version → everything counts as new
  }
}

function countBySource(items) {
  const counts = {};
  for (const it of items) counts[it.source] = (counts[it.source] || 0) + 1;
  return counts;
}

// Deterministic free digest, used when no API key is configured (or AI fails).
function buildDigest(items, date) {
  if (items.length === 0) {
    return `No new health-tech articles were published on ${date}.`;
  }
  const counts = countBySource(items);
  const breakdown = Object.entries(counts)
    .map(([src, n]) => `${src} (${n})`)
    .join(", ");
  const headlines = items
    .slice(0, 5)
    .map((it) => `“${it.title}” (${it.source})`)
    .join("; ");
  return (
    `${items.length} new health-tech article${items.length === 1 ? "" : "s"} on ${date} ` +
    `across ${Object.keys(counts).length} source${Object.keys(counts).length === 1 ? "" : "s"}: ${breakdown}. ` +
    `Top headlines: ${headlines}.`
  );
}

// AI-written summary via the Claude Messages API. Returns null on any failure
// so the caller can fall back to the deterministic digest.
async function buildAiSummary(items, date, apiKey) {
  const list = items
    .slice(0, 50)
    .map((it) => `- [${it.source}] ${it.title}${it.snippet ? ` — ${it.snippet}` : ""}`)
    .join("\n");

  const system =
    "You are a health-tech news editor writing a brief daily digest for a busy " +
    "executive. Given today's new headlines from STAT News, MedCity News, " +
    "Healthcare IT News, and MobiHealthNews, write a concise summary (3-6 " +
    "sentences) of the most important themes and developments. Group related " +
    "stories where it helps. Be specific and factual; do not invent details " +
    "beyond what the headlines support. Write plain prose — no markdown, no " +
    "headers, no bullet points.";

  const body = {
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [
      {
        role: "user",
        content: `Today is ${date}. Here are ${items.length} new health-tech articles:\n\n${list}`,
      },
    ],
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`  AI summary failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.warn(`  AI summary error: ${err.message}`);
    return null;
  }
}

async function main() {
  const date = kstDateString();
  console.log(`Building summary for ${date}...`);

  const news = await readJson(NEWS_FILE);
  if (!news || !Array.isArray(news.items)) {
    console.error("data/news.json missing or invalid — run fetch first.");
    process.exitCode = 1;
    return;
  }

  const prevLinks = await previousLinks();
  let newItems = news.items.filter((it) => !prevLinks.has(it.link));

  // Merge with any summary already written for today (handles multiple runs/day).
  await mkdir(SUMMARIES_DIR, { recursive: true });
  const dayFile = join(SUMMARIES_DIR, `${date}.json`);
  const existing = await readJson(dayFile);
  if (existing && Array.isArray(existing.items)) {
    newItems = newItems.concat(existing.items);
  }

  // De-duplicate by link AND normalized title (catches Google News returning the
  // same article under different URLs, and cross-posts between sources).
  const normTitle = (t) =>
    (t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const seenLinks = new Set();
  const seenTitles = new Set();
  newItems = newItems.filter((it) => {
    const nt = normTitle(it.title);
    if (seenLinks.has(it.link) || (nt && seenTitles.has(nt))) return false;
    seenLinks.add(it.link);
    if (nt) seenTitles.add(nt);
    return true;
  });

  // Sort newest first and cap.
  newItems.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  newItems = newItems.slice(0, MAX_ITEMS_IN_DAY);

  const slimItems = newItems.map(({ title, link, source, date }) => ({
    title,
    link,
    source,
    date,
  }));

  console.log(`  ${newItems.length} new article(s) today.`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let summary = null;
  let mode = "digest";

  if (apiKey && newItems.length > 0) {
    summary = await buildAiSummary(newItems, date, apiKey);
    if (summary) mode = "ai";
  }
  if (!summary) summary = buildDigest(newItems, date);

  console.log(`  Summary mode: ${mode}`);

  const dayPayload = {
    date,
    generatedAt: new Date().toISOString(),
    mode, // "ai" or "digest"
    model: mode === "ai" ? MODEL : null,
    newCount: newItems.length,
    sources: countBySource(newItems),
    summary,
    items: slimItems,
  };
  await writeFile(dayFile, JSON.stringify(dayPayload, null, 2) + "\n", "utf8");

  // Update the index (newest-first list of days).
  const index = (await readJson(INDEX_FILE)) || { updatedAt: null, days: [] };
  const days = (index.days || []).filter((d) => d.date !== date);
  days.push({ date, newCount: newItems.length, mode });
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  const newIndex = { updatedAt: new Date().toISOString(), days };
  await writeFile(INDEX_FILE, JSON.stringify(newIndex, null, 2) + "\n", "utf8");

  console.log(`Wrote data/summaries/${date}.json and updated index.`);
}

main();
