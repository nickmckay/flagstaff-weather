// Shared by the landing page and the tracker pages: season definitions, the
// comparison-set toggle, statistics, and the site header/footer.

const SEASONS = {
  water_year: {
    nav: "Water year",
    eyebrow: "Water-year precipitation",
    chartTitle: "Running total, Oct 1 – Sep 30",
    name: (y) => `Water year ${y}`,
    short: (y) => `WY${y}`,
    noun: "water year",
    superlative: "wettest",
    opposite: "driest",
    what: "of precipitation",
    blurb: "Rain and melted snow, Oct 1 – Sep 30",
    note: "Water years run Oct 1 – Sep 30 and are named for the year they end in. Totals include rain and melted snow.",
  },
  snow: {
    nav: "Snow",
    eyebrow: "Seasonal snowfall",
    chartTitle: "Running snowfall total, Jul 1 – Jun 30",
    name: (y) => `The ${y - 1}–${String(y).slice(2)} snow season`,
    short: (y) => `${y - 1}–${String(y).slice(2)}`,
    noun: "snow season",
    superlative: "snowiest",
    opposite: "least snowy",
    what: "of snow",
    blurb: "Snowfall, Jul 1 – Jun 30",
    note: "Snow seasons run Jul 1 – Jun 30. Totals are snowfall, not melted water.",
  },
  monsoon: {
    nav: "Monsoon",
    eyebrow: "Summer monsoon precipitation",
    chartTitle: "Running total, Jun 15 – Sep 15",
    name: (y) => `The ${y} monsoon`,
    short: (y) => String(y),
    noun: "monsoon",
    superlative: "wettest",
    opposite: "driest",
    what: "of rain",
    blurb: "Rain, Jun 15 – Sep 15",
    note: "The monsoon window here is the fixed Jun 15 – Sep 15 period the NWS uses.",
  },
  october: {
    nav: "October",
    eyebrow: "October precipitation",
    chartTitle: "Running total by day of October",
    name: (y) => `October ${y}`,
    short: (y) => String(y),
    noun: "October",
    superlative: "wettest",
    opposite: "driest",
    what: "of precipitation",
    blurb: "Precipitation, Oct 1 – 31",
    note: "",
  },
};
const PAGES = { home: "./", water_year: "water-year.html", snow: "snow.html", monsoon: "monsoon.html", october: "october.html" };
const MODERN_START = 2001;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const dateLabel = (mmdd) => `${MONTHS[+mmdd.slice(0, 2) - 1]} ${+mmdd.slice(3)}`;
const formatter = (data) => {
  const digits = data.season.element === "snow" ? 1 : 2;
  return (v) => v.toFixed(digits);
};

// ---- comparison-set toggle -------------------------------------------------

let mode = initialMode();

function initialMode() {
  const p = new URLSearchParams(location.search).get("years");
  if (p === "modern" || p === "all") return p;
  try { return localStorage.getItem("fw-years") || "all"; } catch { return "all"; }
}

function setMode(m, onChange) {
  mode = m;
  try { localStorage.setItem("fw-years", m); } catch {}
  const url = new URL(location.href);
  if (m === "all") url.searchParams.delete("years"); else url.searchParams.set("years", m);
  history.replaceState(null, "", url);
  updateNavLinks();
  onChange();
}

function updateNavLinks() {
  document.querySelectorAll("a[data-page]").forEach((a) => {
    a.href = PAGES[a.dataset.page] + (mode === "modern" ? "?years=modern" : "");
  });
  document.querySelectorAll(".toggle button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
}

function toggleHTML() {
  return `
  <div class="controls">
    <span class="controls-label" id="toggle-label">Compare with</span>
    <div class="toggle" role="group" aria-labelledby="toggle-label">
      <button type="button" data-mode="all">All years</button>
      <button type="button" data-mode="modern">21st century</button>
    </div>
  </div>`;
}

function wireToggle(onChange) {
  document.querySelectorAll(".toggle button").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode, onChange)));
  updateNavLinks();
}

// ---- header & footer --------------------------------------------------------

function headerHTML(current) {
  return `
<header class="site-header">
  <div class="wrap">
    <a class="brand" data-page="home" href="./"${current === "home" ? ' aria-current="page"' : ""}>Flagstaff Weather</a>
    <nav>${Object.entries(SEASONS).map(([id, s]) =>
      `<a data-page="${id}" href="${PAGES[id]}"${id === current ? ' aria-current="page"' : ""}>${s.nav}</a>`).join("")}</nav>
  </div>
</header>`;
}

function footerHTML() {
  return `
<footer class="wrap site-footer">
  <p id="updated"></p>
  <p>Daily data: <a href="https://www.rcc-acis.org/">NOAA Regional Climate Centers ACIS</a>, Flagstaff Area threaded record (FLGthr), which joins the Flagstaff city and Pulliam Airport stations. Season snowfall, ENSO and Niño 3.4 reference data were compiled from <a href="https://www.weather.gov/media/wrh/online_publications/TMs/TM-273.pdf">NWS TM-273</a>, <a href="https://www.weather.gov/wrh/Climate?wfo=fgz">NWS Flagstaff</a> and <a href="https://psl.noaa.gov/enso/past_events.html">NOAA PSL</a>.</p>
  <p><a href="https://github.com/nickmckay/flagstaff-weather">Source on GitHub</a></p>
</footer>`;
}

function updatedText(data) {
  return `Data through ${data.meta.record_end}. Updated ${new Date(data.meta.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`;
}

// ---- statistics for the selected comparison set ---------------------------

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function computeStats(data) {
  const cur = data.current;
  const n = data.season.dates.length;
  const years = data.complete_years
    .filter((y) => y !== cur.year && (mode === "all" || y >= MODERN_START))
    .map((y) => ({ year: y, cum: data.years[y] }));

  const clim = { p10: [], median: [], p90: [], max: [] };
  for (let i = 0; i < n; i++) {
    const vals = years.map((d) => d.cum[i]).sort((a, b) => a - b);
    clim.p10.push(quantile(vals, 0.1));
    clim.median.push(quantile(vals, 0.5));
    clim.p90.push(quantile(vals, 0.9));
    clim.max.push(vals[vals.length - 1]);
  }

  const record = years.reduce((a, b) => (b.cum[n - 1] > a.cum[n - 1] ? b : a));
  const t = cur.through_index - 1;
  const stats = { years, clim, record, n, firstYear: d3.min(years, (d) => d.year), lastYear: d3.max(years, (d) => d.year) };
  if (t >= 0) {
    const total = cur.cumulative[t];
    stats.total = total;
    stats.t = t;
    stats.asOf = dateLabel(data.season.dates[t]);
    stats.done = cur.through_index === n;
    stats.rank = 1 + years.filter((d) => d.cum[t] > total).length;
    stats.nAbove = stats.rank - 1;
    stats.nYears = years.length + 1;
    stats.medianToDate = clim.median[t];
    stats.pctOfMedian = clim.median[t] > 0 ? Math.round((100 * total) / clim.median[t]) : null;
  }
  return stats;
}

// Ranks in the lower half read better from the other end ("5th-driest").
function rankWords(s, cfg) {
  if (s.rank <= s.nYears / 2) return [s.rank, cfg.superlative];
  return [s.nYears - s.rank + 1, cfg.opposite];
}

function headlineText(data, s, cfg) {
  const cur = data.current;
  if (s.t === undefined) return `${cfg.name(cur.year)} has no reports yet`;
  if (s.total === 0) {
    return `${cfg.name(cur.year)} has had no measurable ${data.season.element === "snow" ? "snow" : "precipitation"} yet`;
  }
  const since = mode === "all" ? "on record" : `since ${MODERN_START}`;
  const [r, word] = rankWords(s, cfg);
  const rankText = r === 1 ? `the ${word}` : `the ${ordinal(r)}‑${word}`;
  return `${cfg.name(cur.year)} ${s.done ? "was" : "is"} ${rankText} ${since}${s.done ? "" : ` through ${s.asOf}`}`;
}

// ---- ENSO coloring ------------------------------------------------------------

const ENSO_LIMIT = 1.5; // season-mean Nino 3.4 anomaly (degC) at which color saturates

// Diverging blue (La Nina) - gray (neutral) - red (El Nino), read from the
// current theme's tokens so light and dark modes each get their own steps.
function ensoScale() {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const scale = d3.scaleLinear()
    .domain([-ENSO_LIMIT, 0, ENSO_LIMIT])
    .range([token("--enso-cool"), token("--enso-mid"), token("--enso-warm")])
    .interpolate(d3.interpolateLab)
    .clamp(true);
  return (v) => (v == null ? token("--enso-mid") : scale(v));
}

function ensoPhase(v) {
  if (v == null) return "no data";
  if (v >= 0.5) return "El Niño";
  if (v <= -0.5) return "La Niña";
  return "neutral";
}

const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
