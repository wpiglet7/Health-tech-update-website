// Populates the landing page with live data: today's summary preview,
// latest headlines, and the "updated" line. All read-only; degrades gracefully.

const LOCALE = "en-US";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}

function fmtLongDate(dateStr) {
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

async function getJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function loadHeadlines() {
  const el = document.getElementById("headlinePreview");
  const meta = document.getElementById("heroMeta");
  try {
    const data = await getJson("data/news.json");
    const items = (data.items || []).slice(0, 6);
    if (items.length === 0) {
      el.innerHTML = `<li class="loading">No headlines yet.</li>`;
      return;
    }
    el.innerHTML = items
      .map(
        (it) => `
        <li>
          <span class="badge" data-source="${escapeHtml(it.source)}">${escapeHtml(
          it.source
        )}</span>
          <a href="${encodeURI(it.link)}" target="_blank" rel="noopener">${escapeHtml(
          it.title
        )}</a>
          ${it.date ? `<span class="hl-date">${fmtShortDate(it.date)}</span>` : ""}
        </li>`
      )
      .join("");

    const sourceCount = (data.sources || []).length || 4;
    if (data.generatedAt) {
      meta.textContent = `Curated from ${sourceCount} leading sources · last updated ${new Date(
        data.generatedAt
      ).toLocaleDateString(LOCALE, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }
  } catch (err) {
    console.error(err);
    el.innerHTML = `<li class="loading">Couldn't load headlines right now.</li>`;
  }
}

async function loadSummary() {
  const el = document.getElementById("summaryPreview");
  try {
    const index = await getJson("data/summaries-index.json");
    if (!index.days || index.days.length === 0) {
      el.innerHTML = `<p class="loading">The first daily summary will appear after the next update.</p>`;
      return;
    }
    const latest = index.days[0];
    const s = await getJson(`data/summaries/${latest.date}.json`);
    const badge =
      s.mode === "ai"
        ? `<span class="pv-badge ai">AI summary</span>`
        : `<span class="pv-badge">Digest</span>`;
    el.innerHTML = `
      <p class="pv-date">${fmtLongDate(s.date)} ${badge}</p>
      <p class="pv-text">${escapeHtml(s.summary || "")}</p>`;
  } catch (err) {
    console.error(err);
    el.innerHTML = `<p class="loading">Couldn't load today's summary right now.</p>`;
  }
}

loadHeadlines();
loadSummary();
