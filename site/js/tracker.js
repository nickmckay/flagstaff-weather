// Cumulative season tracker. Each page sets <body data-season="...">; data is
// built daily by scripts/fetch_acis.py.

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
    note: "",
  },
};
const PAGES = { water_year: "water-year.html", snow: "snow.html", monsoon: "monsoon.html", october: "./" };
const MODERN_START = 2001;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const seasonId = document.body.dataset.season;
const cfg = SEASONS[seasonId];
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const dateLabel = (mmdd) => `${MONTHS[+mmdd.slice(0, 2) - 1]} ${+mmdd.slice(3)}`;

let mode = initialMode();
let data, digits, fmt;

renderShell();
fetch(`data/${seasonId}.json`)
  .then((r) => r.json())
  .then((d) => {
    data = d;
    digits = data.season.element === "snow" ? 1 : 2;
    fmt = (v) => v.toFixed(digits);
    renderAll();
    let w = document.getElementById("chart").clientWidth;
    window.addEventListener("resize", () => {
      const nw = document.getElementById("chart").clientWidth;
      if (nw !== w) { w = nw; renderChart(computeStats()); }
    });
  })
  .catch((err) => {
    document.getElementById("lede").textContent = "Couldn't load the data: " + err.message;
  });

// ---- comparison-set toggle -------------------------------------------------

function initialMode() {
  const p = new URLSearchParams(location.search).get("years");
  if (p === "modern" || p === "all") return p;
  try { return localStorage.getItem("fw-years") || "all"; } catch { return "all"; }
}

function setMode(m) {
  mode = m;
  try { localStorage.setItem("fw-years", m); } catch {}
  const url = new URL(location.href);
  if (m === "all") url.searchParams.delete("years"); else url.searchParams.set("years", m);
  history.replaceState(null, "", url);
  updateNavLinks();
  renderAll();
}

function updateNavLinks() {
  document.querySelectorAll("nav a[data-page]").forEach((a) => {
    a.href = PAGES[a.dataset.page] + (mode === "modern" ? "?years=modern" : "");
  });
  document.querySelectorAll(".toggle button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  });
}

// ---- statistics for the selected comparison set ---------------------------

function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function computeStats() {
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
    stats.done = cur.through_index === n;
    stats.rank = 1 + years.filter((d) => d.cum[t] > total).length;
    stats.nAbove = stats.rank - 1;
    stats.nYears = years.length + 1;
    stats.medianToDate = clim.median[t];
    stats.pctOfMedian = clim.median[t] > 0 ? Math.round((100 * total) / clim.median[t]) : null;
  }
  return stats;
}

// ---- rendering --------------------------------------------------------------

// Ranks in the lower half read better from the other end ("5th-driest").
function rankWords(s) {
  if (s.rank <= s.nYears / 2) return [s.rank, cfg.superlative];
  return [s.nYears - s.rank + 1, cfg.opposite];
}

function renderShell() {
  document.body.innerHTML = `
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="./">Flagstaff Weather</a>
    <nav>${Object.entries(SEASONS).map(([id, s]) =>
      `<a data-page="${id}" href="${PAGES[id]}"${id === seasonId ? ' aria-current="page"' : ""}>${s.nav}</a>`).join("")}</nav>
  </div>
</header>
<main class="wrap">
  <section class="intro">
    <p class="eyebrow">${cfg.eyebrow}</p>
    <h1 id="headline">${cfg.eyebrow}</h1>
    <p class="lede" id="lede">Loading…</p>
  </section>
  <div class="controls">
    <span class="controls-label" id="toggle-label">Compare with</span>
    <div class="toggle" role="group" aria-labelledby="toggle-label">
      <button type="button" data-mode="all">All years</button>
      <button type="button" data-mode="modern">21st century</button>
    </div>
  </div>
  <section class="tiles" id="tiles" aria-live="polite"></section>
  <section class="chart-card">
    <div class="chart-head">
      <h2 id="chart-title">${cfg.chartTitle}</h2>
      <ul class="legend" id="legend"></ul>
    </div>
    <div class="chart" id="chart" role="img"></div>
    <div class="tooltip" id="tooltip" hidden></div>
    <p class="note">${cfg.note} Hover or tap the chart to see a day's numbers. The year nearest your pointer is highlighted. Trace amounts count as zero.</p>
  </section>
  <section class="table-card">
    <details>
      <summary>All seasons, ranked by total</summary>
      <div class="table-scroll"><table id="table"><thead><tr><th>Rank</th><th>Season</th><th class="num">Total (in)</th></tr></thead><tbody></tbody></table></div>
    </details>
  </section>
</main>
<footer class="wrap site-footer">
  <p id="updated"></p>
  <p>Daily data: <a href="https://www.rcc-acis.org/">NOAA Regional Climate Centers ACIS</a>, Flagstaff Area threaded record (FLGthr), which joins the Flagstaff city and Pulliam Airport stations. Season snowfall, ENSO and Niño 3.4 reference data were compiled from <a href="https://www.weather.gov/media/wrh/online_publications/TMs/TM-273.pdf">NWS TM-273</a>, <a href="https://www.weather.gov/wrh/Climate?wfo=fgz">NWS Flagstaff</a> and <a href="https://psl.noaa.gov/enso/past_events.html">NOAA PSL</a>.</p>
  <p><a href="https://github.com/nickmckay/flagstaff-weather">Source on GitHub</a></p>
</footer>`;
  document.querySelectorAll(".toggle button").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));
  updateNavLinks();
}

function renderAll() {
  const stats = computeStats();
  renderSummary(stats);
  renderLegend(stats);
  renderTable(stats);
  renderChart(stats);
}

function renderSummary(s) {
  const cur = data.current;
  const unit = "in";
  const since = mode === "all" ? "on record" : `since ${MODERN_START}`;
  const setName = `${cfg.short(s.firstYear)} to ${cfg.short(s.lastYear)}`;
  const headline = document.getElementById("headline");
  const lede = document.getElementById("lede");

  document.getElementById("updated").textContent =
    `Data through ${data.meta.record_end}. Updated ${new Date(data.meta.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`;

  if (s.t === undefined) {
    headline.textContent = `${cfg.name(cur.year)} has no reports yet`;
    lede.textContent = "";
    document.getElementById("tiles").innerHTML = "";
    return;
  }

  const asOf = dateLabel(data.season.dates[s.t]);
  const verb = s.done ? "was" : "is";
  const through = s.done ? "" : ` through ${asOf}`;
  if (s.total === 0) {
    headline.textContent = `${cfg.name(cur.year)} has had no measurable ${data.season.element === "snow" ? "snow" : "precipitation"} yet`;
  } else {
    const [r, word] = rankWords(s);
    const rankText = r === 1 ? `the ${word}` : `the ${ordinal(r)}‑${word}`;
    headline.textContent = `${cfg.name(cur.year)} ${verb} ${rankText} ${since}${through}`;
  }

  const recordTotal = s.record.cum[s.n - 1];
  lede.textContent =
    (s.total === 0
      ? `None so far, through ${asOf}. ${s.nAbove} of ${s.nYears - 1} seasons (${setName}) had some by this date. `
      : `${fmt(s.total)} inches ${cfg.what}${s.done ? "" : ` so far, through ${asOf}`}. ` +
        `The median ${s.done ? "season total" : "by this date"} for ${setName} is ${fmt(s.medianToDate)} inches. `) +
    `The ${since === "on record" ? "record" : `highest since ${MODERN_START}`} is ${fmt(recordTotal)} inches, in ${cfg.short(s.record.year)}.`;

  const tiles = [
    { cls: "hero", label: s.done ? "Season total" : `Total through ${asOf}`, value: `${fmt(s.total)}<small> ${unit}</small>` },
    s.total === 0
      ? { label: "Seasons with more by this date", value: `${s.nAbove}<small> of ${s.nYears - 1}</small>`, sub: setName }
      : { label: "Rank", value: `${ordinal(rankWords(s)[0])}<small> of ${s.nYears}</small>`, sub: `${rankWords(s)[1]}${s.done ? "" : " to date"}, ${setName}` },
    { label: "Percent of median", value: s.pctOfMedian == null ? "—" : `${s.pctOfMedian}<small>%</small>`, sub: `median ${s.done ? "total" : "to date"} ${fmt(s.medianToDate)} ${unit}` },
    { label: mode === "all" ? "Record" : `Highest since ${MODERN_START}`, value: `${fmt(recordTotal)}<small> ${unit}</small>`, sub: cfg.short(s.record.year) },
  ];
  document.getElementById("tiles").innerHTML = tiles.map((t) => `
    <div class="tile ${t.cls || ""}">
      <div class="label">${t.label}</div>
      <div class="value">${t.value}</div>
      ${t.sub ? `<div class="sub">${t.sub}</div>` : ""}
    </div>`).join("");

  document.getElementById("chart").setAttribute("aria-label",
    `Cumulative ${cfg.noun} totals by day for ${setName}, with ${cfg.short(cur.year)} highlighted`);
}

function renderLegend(s) {
  const items = [
    [`<span class="key" style="border-color:var(--accent);border-top-width:3px"></span>`, cfg.short(data.current.year)],
    [`<span class="key" style="border-color:var(--history-strong)"></span>`, `${cfg.short(s.record.year)} (${mode === "all" ? "record" : "highest"})`],
    [`<span class="key" style="border-color:var(--median)"></span>`, "Median"],
    [`<span class="key band"></span>`, "10th–90th percentile"],
    [`<span class="key" style="border-color:var(--history);border-top-width:1px"></span>`, "Other years"],
  ];
  document.getElementById("legend").innerHTML = items.map(([k, t]) => `<li>${k}${t}</li>`).join("");
}

function renderTable(s) {
  const cur = data.current;
  const rows = s.years.map((d) => ({ year: d.year, total: d.cum[s.n - 1] }));
  if (s.t !== undefined) rows.push({ year: cur.year, total: s.total, partial: !s.done });
  rows.sort((a, b) => b.total - a.total || a.year - b.year);
  document.querySelector("#table tbody").innerHTML = rows.map((r, i) => `
    <tr class="${r.year === cur.year ? "is-current" : ""}">
      <td>${i + 1}</td><td>${cfg.short(r.year)}${r.partial ? ` (through ${dateLabel(data.season.dates[s.t])})` : ""}</td><td class="num">${fmt(r.total)}</td>
    </tr>`).join("");
}

function xTicks(dates, narrow) {
  const n = dates.length;
  if (n <= 40) {
    const step = narrow ? 7 : 5;
    const ticks = d3.range(0, n, step);
    if (n - 1 - ticks[ticks.length - 1] < step / 2) ticks.pop();
    return { ticks: [...ticks, n - 1], label: (i) => dateLabel(dates[i]) };
  }
  const firsts = dates.map((d, i) => (d.endsWith("-01") ? i : -1)).filter((i) => i >= 0);
  if (n > 200) {
    const ticks = narrow ? firsts.filter((_, k) => k % 2 === 0) : firsts;
    return { ticks, label: (i) => MONTHS[+dates[i].slice(0, 2) - 1] };
  }
  const ticks = [0, ...firsts.filter((i) => i > 5 && i < n - 6), n - 1];
  return { ticks, label: (i) => dateLabel(dates[i]) };
}

function renderChart(s) {
  const el = document.getElementById("chart");
  const tooltip = document.getElementById("tooltip");
  el.innerHTML = "";
  tooltip.hidden = true;

  const cur = data.current;
  const dates = data.season.dates;
  const { years, clim, record, n } = s;
  const width = el.clientWidth;
  const narrow = width < 560;
  const height = narrow ? 360 : 460;
  const m = { top: 12, right: narrow ? 64 : 104, bottom: 32, left: 44 };

  const yMax = d3.max([d3.max(clim.max), d3.max(cur.cumulative) || 0]);
  const x = d3.scaleLinear().domain([0, n - 1]).range([m.left, width - m.right]);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([height - m.bottom, m.top]);
  const line = d3.line().x((_, i) => x(i)).y((v) => y(v));
  const yTickCount = narrow ? 5 : 8;

  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);

  svg.append("g").attr("class", "grid")
    .selectAll("line").data(y.ticks(yTickCount)).join("line")
    .attr("x1", m.left).attr("x2", width - m.right).attr("y1", y).attr("y2", y);
  svg.append("g").attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(yTickCount).tickSize(0).tickPadding(8).tickFormat((d) => `${d}″`));
  const xt = xTicks(dates, narrow);
  svg.append("g").attr("transform", `translate(0,${height - m.bottom})`)
    .call(d3.axisBottom(x).tickValues(xt.ticks).tickSize(0).tickPadding(10).tickFormat(xt.label));

  const histPaths = svg.append("g").attr("class", "history")
    .selectAll("path").data(years).join("path")
    .attr("d", (d) => line(d.cum));

  // Band drawn over the history lines so it stays visible through them.
  svg.append("path").attr("class", "band")
    .attr("d", d3.area().x((_, i) => x(i)).y0((_, i) => y(clim.p10[i])).y1((v) => y(v))(clim.p90));
  svg.append("path").attr("class", "median").attr("d", line(clim.median));
  svg.append("path").attr("class", "record").attr("d", line(record.cum));

  const curN = cur.cumulative.length;
  if (curN) {
    svg.append("path").attr("class", "current").attr("d", line(cur.cumulative));
    svg.append("circle").attr("class", "current-dot")
      .attr("cx", x(curN - 1)).attr("cy", y(cur.cumulative[curN - 1])).attr("r", 5);
  }

  // Labels at the right edge are spread apart vertically; an in-progress
  // season's label sits beside its own end-dot instead.
  const edge = [
    { y: y(record.cum[n - 1]), cls: "label-sec", text: cfg.short(record.year), value: record.cum[n - 1] },
    { y: y(clim.median[n - 1]), cls: "label-sec", text: "Median", value: clim.median[n - 1] },
  ];
  const curLabel = curN ? { y: y(s.total), cls: "label-strong", text: cfg.short(cur.year), value: s.total } : null;
  if (curLabel && s.done) edge.push(curLabel);
  edge.sort((a, b) => a.y - b.y);
  for (let i = 1; i < edge.length; i++) edge[i].y = Math.max(edge[i].y, edge[i - 1].y + 15);
  edge.forEach((d) => { d.x = x(n - 1) + 10; });
  const labels = [...edge];
  if (curLabel && !s.done) labels.push({ ...curLabel, x: x(curN - 1) + 8, y: curLabel.y - 14 });
  svg.append("g").selectAll("text").data(labels).join("text")
    .attr("class", (d) => d.cls)
    .attr("x", (d) => d.x).attr("y", (d) => d.y).attr("dy", "0.35em")
    .text((d) => (narrow ? d.text : `${d.text}  ${fmt(d.value)}″`));

  // Hover layer: crosshair on the nearest day, highlight the year nearest the pointer.
  const cross = svg.append("line").attr("class", "crosshair")
    .attr("y1", m.top).attr("y2", height - m.bottom).style("display", "none");
  const dots = svg.append("g");
  let hlPath = null;

  const overlay = svg.append("rect")
    .attr("x", m.left).attr("y", m.top)
    .attr("width", width - m.left - m.right).attr("height", height - m.top - m.bottom)
    .attr("fill", "transparent");

  function show(event) {
    const [px, py] = d3.pointer(event, svg.node());
    const i = Math.max(0, Math.min(n - 1, Math.round(x.invert(px))));
    const target = y.invert(py);
    const nearest = d3.least(years, (d) => Math.abs(d.cum[i] - target));

    if (hlPath) hlPath.classed("hl", false);
    hlPath = histPaths.filter((d) => d === nearest).classed("hl", true).raise();
    cross.style("display", null).attr("x1", x(i)).attr("x2", x(i));

    const points = [{ v: nearest.cum[i], color: "var(--history-strong)" }];
    const curVal = i < curN ? cur.cumulative[i] : null;
    if (curVal != null) points.push({ v: curVal, color: "var(--accent)" });
    dots.selectAll("circle").data(points).join("circle")
      .attr("class", "hover-dot").attr("r", 4.5)
      .attr("cx", x(i)).attr("cy", (d) => y(d.v)).attr("fill", (d) => d.color);

    tooltip.innerHTML = `
      <div class="t-head">Through ${dateLabel(dates[i])}</div>
      ${curVal != null ? `<div class="row"><span><span class="sw" style="background:var(--accent)"></span>${cfg.short(cur.year)}</span><b>${fmt(curVal)}″</b></div>` : ""}
      <div class="row"><span><span class="sw" style="background:var(--history-strong)"></span>${cfg.short(nearest.year)}</span><b>${fmt(nearest.cum[i])}″</b></div>
      <div class="row"><span>Median</span><b>${fmt(clim.median[i])}″</b></div>
      <div class="row"><span>10th–90th</span><b>${fmt(clim.p10[i])}–${fmt(clim.p90[i])}″</b></div>
      <div class="row"><span>${mode === "all" ? "Record" : "Highest"}</span><b>${fmt(clim.max[i])}″</b></div>`;
    tooltip.hidden = false;

    const card = el.parentElement.getBoundingClientRect();
    const svgBox = svg.node().getBoundingClientRect();
    const scale = svgBox.width / width;
    let left = svgBox.left - card.left + x(i) * scale + 14;
    if (left + tooltip.offsetWidth > card.width - 8) left -= tooltip.offsetWidth + 28;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${svgBox.top - card.top + m.top * scale + 8}px`;
  }

  function hide() {
    tooltip.hidden = true;
    cross.style("display", "none");
    dots.selectAll("circle").remove();
    if (hlPath) hlPath.classed("hl", false);
  }

  overlay.on("pointermove", show).on("pointerdown", show).on("pointerleave", hide);
}
