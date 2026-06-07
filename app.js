// Loads data/news.json and renders a filterable, searchable news feed.

const grid = document.getElementById("grid");
const filtersEl = document.getElementById("filters");
const searchEl = document.getElementById("search");
const updatedEl = document.getElementById("updated");
const resultCountEl = document.getElementById("resultCount");
const emptyEl = document.getElementById("empty");

let allItems = [];
let activeSource = "all"; // "all" or a source name
let query = "";

// English UI: format dates in en-US regardless of the browser's locale.
const LOCALE = "en-US";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtUpdated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildFilters(sources) {
  const chips = [{ name: "all", label: "All sources" }].concat(
    sources.map((s) => ({ name: s.name, label: s.name }))
  );

  filtersEl.innerHTML = "";
  chips.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (c.name === activeSource ? " active" : "");
    btn.textContent = c.label;
    btn.addEventListener("click", () => {
      activeSource = c.name;
      document
        .querySelectorAll(".chip")
        .forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
    filtersEl.appendChild(btn);
  });
}

function matches(item) {
  if (activeSource !== "all" && item.source !== activeSource) return false;
  if (query) {
    const hay = (item.title + " " + (item.snippet || "")).toLowerCase();
    if (!hay.includes(query)) return false;
  }
  return true;
}

function render() {
  const items = allItems.filter(matches);

  resultCountEl.textContent = items.length
    ? `Showing ${items.length} article${items.length === 1 ? "" : "s"}`
    : "";

  emptyEl.hidden = items.length > 0;

  grid.innerHTML = items
    .map((item) => {
      const date = fmtDate(item.date);
      return `
      <article class="card">
        <div class="card-meta">
          <span class="badge" data-source="${escapeHtml(item.source)}">${escapeHtml(
        item.source
      )}</span>
          ${date ? `<span class="date">${date}</span>` : ""}
        </div>
        <h2 class="card-title">
          <a href="${encodeURI(item.link)}" target="_blank" rel="noopener">${escapeHtml(
        item.title
      )}</a>
        </h2>
        ${
          item.snippet
            ? `<p class="card-snippet">${escapeHtml(item.snippet)}</p>`
            : ""
        }
        <a class="read-more" href="${encodeURI(
          item.link
        )}" target="_blank" rel="noopener">Read full article →</a>
      </article>`;
    })
    .join("");
}

async function init() {
  try {
    const res = await fetch("data/news.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    allItems = data.items || [];
    buildFilters(data.sources || []);
    updatedEl.textContent = data.generatedAt
      ? "Last updated " + fmtUpdated(data.generatedAt)
      : "";
    render();
  } catch (err) {
    updatedEl.textContent = "";
    grid.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent =
      "Couldn't load the news feed yet. Please check back shortly.";
    console.error(err);
  }
}

searchEl.addEventListener("input", (e) => {
  query = e.target.value.trim().toLowerCase();
  render();
});

// ----------------------------------------------------------------------------
// Tabs + summaries
// ----------------------------------------------------------------------------

const views = {
  news: document.getElementById("view-news"),
  today: document.getElementById("view-today"),
  past: document.getElementById("view-past"),
};
const todayContainer = document.getElementById("todayContainer");
const dateListEl = document.getElementById("dateList");
const pastDetailEl = document.getElementById("pastDetail");

let summariesIndex = null; // { updatedAt, days: [{date, newCount, mode}] }
const summaryCache = {}; // date -> summary object
let pastLoaded = false;

function fmtLongDate(dateStr) {
  // dateStr is YYYY-MM-DD; render without timezone drift.
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function summaryCardHtml(s) {
  const badge =
    s.mode === "ai"
      ? `<span class="summary-badge ai">AI summary</span>`
      : `<span class="summary-badge digest">Digest</span>`;

  const items = (s.items || [])
    .map(
      (it) => `
        <li>
          <span class="badge" data-source="${escapeHtml(it.source)}">${escapeHtml(
        it.source
      )}</span>
          <a href="${encodeURI(it.link)}" target="_blank" rel="noopener">${escapeHtml(
        it.title
      )}</a>
        </li>`
    )
    .join("");

  return `
    <article class="summary-card">
      <h2 class="summary-date">${fmtLongDate(s.date)} ${badge}</h2>
      <p class="summary-meta">${s.newCount} new article${
    s.newCount === 1 ? "" : "s"
  }</p>
      <p class="summary-text">${escapeHtml(s.summary || "")}</p>
      ${
        items
          ? `<div class="summary-sublist"><h3>Articles in this summary</h3><ul>${items}</ul></div>`
          : ""
      }
    </article>`;
}

async function loadSummary(date) {
  if (summaryCache[date]) return summaryCache[date];
  const res = await fetch(`data/summaries/${date}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  summaryCache[date] = data;
  return data;
}

async function loadIndex() {
  if (summariesIndex) return summariesIndex;
  const res = await fetch("data/summaries-index.json", { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  summariesIndex = await res.json();
  return summariesIndex;
}

async function renderToday() {
  todayContainer.innerHTML = `<p class="section-intro">Loading…</p>`;
  try {
    const index = await loadIndex();
    if (!index.days || index.days.length === 0) {
      todayContainer.innerHTML = `<p class="empty">No summary has been generated yet. The first one will appear after the next daily update.</p>`;
      return;
    }
    const latest = index.days[0];
    const s = await loadSummary(latest.date);
    todayContainer.innerHTML = summaryCardHtml(s);
  } catch (err) {
    console.error(err);
    todayContainer.innerHTML = `<p class="empty">Couldn't load today's summary yet. Please check back shortly.</p>`;
  }
}

async function showPastDate(date, btn) {
  document
    .querySelectorAll(".date-list button")
    .forEach((b) => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  pastDetailEl.innerHTML = `<p class="section-intro">Loading…</p>`;
  try {
    const s = await loadSummary(date);
    pastDetailEl.innerHTML = summaryCardHtml(s);
  } catch (err) {
    console.error(err);
    pastDetailEl.innerHTML = `<p class="empty">Couldn't load this summary.</p>`;
  }
}

async function renderPast() {
  if (pastLoaded) return;
  try {
    const index = await loadIndex();
    const days = index.days || [];
    if (days.length === 0) {
      dateListEl.innerHTML = "";
      pastDetailEl.innerHTML = `<p class="empty">No summaries yet. They'll start appearing after the daily updates run.</p>`;
      pastLoaded = true;
      return;
    }
    dateListEl.innerHTML = days
      .map(
        (d) => `
        <li>
          <button data-date="${d.date}">
            ${fmtLongDate(d.date)}
            <span class="count">${d.newCount} article${
          d.newCount === 1 ? "" : "s"
        }</span>
          </button>
        </li>`
      )
      .join("");

    dateListEl.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => showPastDate(btn.dataset.date, btn));
    });

    // Auto-select the most recent day.
    const firstBtn = dateListEl.querySelector("button");
    showPastDate(days[0].date, firstBtn);
    pastLoaded = true;
  } catch (err) {
    console.error(err);
    pastDetailEl.innerHTML = `<p class="empty">Couldn't load the summary log.</p>`;
  }
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === name);
  });
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  if (name === "today") renderToday();
  if (name === "past") renderPast();
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

init();
