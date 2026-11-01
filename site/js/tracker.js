// Cumulative season tracker page. Each page sets <body data-season="...">;
// data is built daily by scripts/fetch_acis.py. Needs js/common.js.

const seasonId = document.body.dataset.season;
const cfg = SEASONS[seasonId];
let data, fmt;

renderShell();
fetch(`data/${seasonId}.json`, { cache: "no-cache" })
  .then((r) => r.json())
  .then((d) => {
    data = d;
    fmt = formatter(data);
    renderAll();
    let w = document.getElementById("chart").clientWidth;
    window.addEventListener("resize", () => {
      const nw = document.getElementById("chart").clientWidth;
      if (nw !== w) { w = nw; renderChart(computeStats(data)); }
    });
  })
  .catch((err) => {
    document.getElementById("lede").textContent = "Couldn't load the data: " + err.message;
  });

// ---- rendering --------------------------------------------------------------

function renderShell() {
  document.body.innerHTML = `${headerHTML(seasonId)}
<main class="wrap">
  <section class="intro">
    <p class="eyebrow">${cfg.eyebrow}</p>
    <h1 id="headline">${cfg.eyebrow}</h1>
    <p class="lede" id="lede">Loading…</p>
  </section>
  ${toggleHTML()}
  <section class="tiles" id="tiles" aria-live="polite"></section>
  <section class="chart-card">
    <div class="chart-head">
      <h2 id="chart-title">${cfg.chartTitle}</h2>
      <ul class="legend" id="legend"></ul>
    </div>
    <div class="chart" id="chart" role="img"></div>
    <div class="tooltip" id="tooltip" hidden></div>
    <p class="note">${cfg.note} Past seasons are colored by the Niño 3.4 sea-surface temperature anomaly averaged over the season's months: red for El Niño, blue for La Niña, gray for neutral. <span id="nino-latest"></span> Hover or tap the chart to see a day's numbers. The year nearest your pointer is highlighted. Trace amounts count as zero.</p>
  </section>
  <section class="table-card">
    <details>
      <summary>All seasons, ranked by total</summary>
      <div class="table-scroll"><table id="table"><thead><tr><th>Rank</th><th>Season</th><th class="num">Total (in)</th><th class="num">Niño 3.4</th></tr></thead><tbody></tbody></table></div>
    </details>
  </section>
</main>
${footerHTML()}`;
  wireToggle(renderAll);
}

function renderAll() {
  const stats = computeStats(data);
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

  document.getElementById("updated").textContent = updatedText(data);
  headline.textContent = headlineText(data, s, cfg);

  if (s.t === undefined) {
    lede.textContent = "";
    document.getElementById("tiles").innerHTML = "";
    return;
  }

  const asOf = s.asOf;

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
      : { label: "Rank", value: `${ordinal(rankWords(s, cfg)[0])}<small> of ${s.nYears}</small>`, sub: `${rankWords(s, cfg)[1]}${s.done ? "" : " to date"}, ${setName}` },
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
    [`<span class="key" style="border-color:var(--current);border-top-width:3px"></span>`, cfg.short(data.current.year)],
    [`<span class="key" style="border-color:var(--median)"></span>`, "Median"],
    [`<span class="key band"></span>`, "10th–90th percentile"],
    [`<span class="enso-ramp" aria-hidden="true"></span>`, `Past seasons by Niño 3.4: <span class="enso-ends"><span>La Niña ${signed(-ENSO_LIMIT)}°</span><span>El Niño ${signed(ENSO_LIMIT)}°</span></span>`],
  ];
  document.getElementById("legend").innerHTML = items.map(([k, t]) => `<li>${k}${t}</li>`).join("");

  const latest = data.meta.nino34_latest;
  document.getElementById("nino-latest").textContent = latest
    ? `The latest monthly value is ${signed(latest.value)} °C (${MONTHS[latest.month - 1]} ${latest.year}, ${ensoPhase(latest.value)}).`
    : "";
}

function renderTable(s) {
  const cur = data.current;
  const rows = s.years.map((d) => ({ year: d.year, total: d.cum[s.n - 1] }));
  const nino = (y) => (data.nino34[y] == null ? "—" : signed(data.nino34[y]));
  if (s.t !== undefined) rows.push({ year: cur.year, total: s.total, partial: !s.done });
  rows.sort((a, b) => b.total - a.total || a.year - b.year);
  document.querySelector("#table tbody").innerHTML = rows.map((r, i) => `
    <tr class="${r.year === cur.year ? "is-current" : ""}">
      <td>${i + 1}</td><td>${cfg.short(r.year)}${r.partial ? ` (through ${dateLabel(data.season.dates[s.t])})` : ""}</td><td class="num">${fmt(r.total)}</td><td class="num">${nino(r.year)}</td>
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

  const color = ensoScale();
  const strength = (d) => Math.min(1, Math.abs(data.nino34[d.year] ?? 0) / ENSO_LIMIT);
  const histPaths = svg.append("g").attr("class", "history")
    .selectAll("path").data([...years].sort((a, b) => strength(a) - strength(b))).join("path")
    .attr("d", (d) => line(d.cum))
    .style("stroke", (d) => color(data.nino34[d.year]))
    .style("stroke-opacity", (d) => 0.45 + 0.45 * strength(d));

  // Band drawn over the history lines so it stays visible through them.
  svg.append("path").attr("class", "band")
    .attr("d", d3.area().x((_, i) => x(i)).y0((_, i) => y(clim.p10[i])).y1((v) => y(v))(clim.p90));
  svg.append("path").attr("class", "median").attr("d", line(clim.median));
  svg.append("path").attr("class", "record").attr("d", line(record.cum))
    .style("stroke", color(data.nino34[record.year]));

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

    const nn = data.nino34[nearest.year];
    const nearColor = color(nn);
    const points = [{ v: nearest.cum[i], color: nearColor }];
    const curVal = i < curN ? cur.cumulative[i] : null;
    if (curVal != null) points.push({ v: curVal, color: "var(--current)" });
    dots.selectAll("circle").data(points).join("circle")
      .attr("class", "hover-dot").attr("r", 4.5)
      .attr("cx", x(i)).attr("cy", (d) => y(d.v)).attr("fill", (d) => d.color);

    tooltip.innerHTML = `
      <div class="t-head">Through ${dateLabel(dates[i])}</div>
      ${curVal != null ? `<div class="row"><span><span class="sw" style="background:var(--current)"></span>${cfg.short(cur.year)}</span><b>${fmt(curVal)}″</b></div>` : ""}
      <div class="row"><span><span class="sw" style="background:${nearColor}"></span>${cfg.short(nearest.year)}</span><b>${fmt(nearest.cum[i])}″</b></div>
      <div class="row sub-row"><span>Niño 3.4 ${nn == null ? "—" : `${signed(nn)} °C`}</span><span>${ensoPhase(nn)}</span></div>
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
