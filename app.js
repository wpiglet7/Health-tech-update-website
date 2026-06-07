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

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtUpdated(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
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

init();
