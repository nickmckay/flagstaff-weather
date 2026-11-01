// Cumulative October precipitation chart. Data built daily by scripts/fetch_acis.py.

const DATA_URL = "data/october_precip.json";
const fmt = (v) => v.toFixed(2);
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const days = d3.range(1, 32);

fetch(DATA_URL)
  .then((r) => r.json())
  .then((data) => {
    renderSummary(data);
    renderLegend(data);
    renderTable(data);
    const draw = () => renderChart(data);
    draw();
    let w = document.getElementById("chart").clientWidth;
    window.addEventListener("resize", () => {
      const nw = document.getElementById("chart").clientWidth;
      if (nw !== w) { w = nw; draw(); }
    });
  })
  .catch((err) => {
    document.getElementById("lede").textContent = "Couldn't load the data: " + err.message;
  });

function renderSummary(data) {
  const cur = data.current;
  const record = data.wettest[0];
  const done = cur.through_day === 31;
  const asOf = `Oct ${cur.through_day}`;
  document.getElementById("eyebrow").textContent = `October ${cur.year}`;

  if (!cur.through_day) {
    document.getElementById("headline").textContent = `October ${cur.year} has no reports yet`;
    document.getElementById("lede").textContent = "The chart shows every October since 1898.";
    return;
  }

  const rankText = cur.rank_wettest === 1 ? "the wettest" : `the ${ordinal(cur.rank_wettest)}\u2011wettest`;
  document.getElementById("headline").textContent = done
    ? `October ${cur.year} was ${rankText} October on record`
    : `October ${cur.year} is ${rankText} on record through ${asOf}`;
  document.getElementById("lede").textContent =
    `${fmt(cur.total)} inches have fallen${done ? "" : ` through ${asOf}`}. ` +
    `A typical October has ${fmt(cur.median_to_date)} inches by this date. ` +
    `The record is ${fmt(record.total)} inches, set in ${record.year}. ` +
    `Records here start in 1898.`;

  const tiles = [
    { cls: "hero", label: `Total through ${asOf}`, value: `${fmt(cur.total)}<small> in</small>` },
    { label: "Rank among Octobers", value: `${ordinal(cur.rank_wettest)}<small> of ${cur.n_years}</small>`, sub: "wettest to date" },
    { label: "Percent of median", value: cur.pct_of_median == null ? "—" : `${cur.pct_of_median}<small>%</small>`, sub: `median to date ${fmt(cur.median_to_date)} in` },
    { label: "Wettest October", value: `${fmt(record.total)}<small> in</small>`, sub: String(record.year) },
  ];
  document.getElementById("tiles").innerHTML = tiles.map((t) => `
    <div class="tile ${t.cls || ""}">
      <div class="label">${t.label}</div>
      <div class="value">${t.value}</div>
      ${t.sub ? `<div class="sub">${t.sub}</div>` : ""}
    </div>`).join("");

  const updated = new Date(data.meta.updated);
  document.getElementById("updated").textContent =
    `Data through ${data.meta.record_end}. Updated ${updated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`;
}

function renderLegend(data) {
  const items = [
    [`<span class="key" style="border-color:var(--accent);border-top-width:3px"></span>`, String(data.current.year)],
    [`<span class="key" style="border-color:var(--history-strong)"></span>`, `${data.wettest[0].year} (record)`],
    [`<span class="key" style="border-color:var(--median)"></span>`, "Median"],
    [`<span class="key band"></span>`, "10th–90th percentile"],
    [`<span class="key" style="border-color:var(--history);border-top-width:1px"></span>`, "Other years"],
  ];
  document.getElementById("legend").innerHTML = items.map(([k, t]) => `<li>${k}${t}</li>`).join("");
}

function renderTable(data) {
  const rows = Object.entries(data.years).map(([y, c]) => ({ year: +y, total: c[30] }));
  const cur = data.current;
  if (cur.through_day) rows.push({ year: cur.year, total: cur.total, partial: cur.through_day < 31 });
  rows.sort((a, b) => b.total - a.total || a.year - b.year);
  document.querySelector("#table tbody").innerHTML = rows.map((r, i) => `
    <tr class="${r.year === cur.year ? "is-current" : ""}">
      <td>${i + 1}</td><td>${r.year}${r.partial ? ` (through Oct ${cur.through_day})` : ""}</td><td class="num">${fmt(r.total)}</td>
    </tr>`).join("");
}

function renderChart(data) {
  const el = document.getElementById("chart");
  const tooltip = document.getElementById("tooltip");
  el.innerHTML = "";

  const width = el.clientWidth;
  const narrow = width < 560;
  const height = narrow ? 360 : 460;
  const m = { top: 12, right: narrow ? 64 : 96, bottom: 32, left: 40 };

  const cur = data.current;
  const clim = data.climatology;
  const record = data.wettest[0];
  const history = Object.entries(data.years).map(([y, c]) => ({ year: +y, cum: c }));
  const yMax = d3.max([d3.max(clim.max), d3.max(cur.cumulative) || 0]);

  const x = d3.scaleLinear().domain([1, 31]).range([m.left, width - m.right]);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([height - m.bottom, m.top]);
  const line = d3.line().x((_, i) => x(i + 1)).y((v) => y(v));

  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);

  svg.append("g").attr("class", "grid")
    .selectAll("line").data(y.ticks(narrow ? 5 : 8)).join("line")
    .attr("x1", m.left).attr("x2", width - m.right).attr("y1", y).attr("y2", y);

  svg.append("g").attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(narrow ? 5 : 8).tickSize(0).tickPadding(8).tickFormat((d) => `${d}″`));
  svg.append("g").attr("transform", `translate(0,${height - m.bottom})`)
    .call(d3.axisBottom(x).tickValues(narrow ? [1, 8, 15, 22, 31] : [1, 5, 10, 15, 20, 25, 31])
      .tickSize(0).tickPadding(10).tickFormat((d) => `Oct ${d}`));

  const histPaths = svg.append("g").attr("class", "history")
    .selectAll("path").data(history).join("path")
    .attr("d", (d) => line(d.cum));

  // Band drawn over the history lines so it stays visible through them.
  svg.append("path").attr("class", "band")
    .attr("d", d3.area().x((_, i) => x(i + 1)).y0((_, i) => y(clim.p10[i])).y1((v) => y(v))(clim.p90));
  svg.append("path").attr("class", "median").attr("d", line(clim.median));
  svg.append("path").attr("class", "record").attr("d", line(data.years[record.year]));

  if (cur.cumulative.length) {
    svg.append("path").attr("class", "current").attr("d", line(cur.cumulative));
    const n = cur.cumulative.length;
    svg.append("circle").attr("class", "current-dot")
      .attr("cx", x(n)).attr("cy", y(cur.cumulative[n - 1])).attr("r", 5);
  }

  // End labels, placed to the right of day 31 and kept apart from each other.
  const labels = [
    { y: y(record.total), cls: "label-sec", text: `${record.year}  ${fmt(record.total)}″` },
    { y: y(clim.median[30]), cls: "label-sec", text: `Median  ${fmt(clim.median[30])}″` },
  ];
  if (cur.cumulative.length) {
    labels.push({ y: y(cur.total), cls: "label-strong", text: `${cur.year}  ${fmt(cur.total)}″`,
      x: x(cur.through_day) });
  }
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 15);
  }
  svg.append("g").selectAll("text").data(labels).join("text")
    .attr("class", (d) => d.cls)
    .attr("x", (d) => (d.x ?? x(31)) + 10).attr("y", (d) => d.y).attr("dy", "0.35em")
    .text((d) => narrow ? d.text.replace(/  [\d.]+″$/, "") : d.text);

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
    const day = Math.max(1, Math.min(31, Math.round(x.invert(px))));
    const i = day - 1;
    const target = y.invert(py);
    const nearest = d3.least(history, (d) => Math.abs(d.cum[i] - target));

    if (hlPath) hlPath.classed("hl", false);
    hlPath = histPaths.filter((d) => d === nearest).classed("hl", true).raise();
    cross.style("display", null).attr("x1", x(day)).attr("x2", x(day));

    const points = [{ v: nearest.cum[i], color: "var(--history-strong)" }];
    const curVal = i < cur.cumulative.length ? cur.cumulative[i] : null;
    if (curVal != null) points.push({ v: curVal, color: "var(--accent)" });
    dots.selectAll("circle").data(points).join("circle")
      .attr("class", "hover-dot").attr("r", 4.5)
      .attr("cx", x(day)).attr("cy", (d) => y(d.v)).attr("fill", (d) => d.color);

    tooltip.innerHTML = `
      <div class="t-head">Through Oct ${day}</div>
      ${curVal != null ? `<div class="row"><span><span class="sw" style="background:var(--accent)"></span>${cur.year}</span><b>${fmt(curVal)}″</b></div>` : ""}
      <div class="row"><span><span class="sw" style="background:var(--history-strong)"></span>${nearest.year}</span><b>${fmt(nearest.cum[i])}″</b></div>
      <div class="row"><span>Median</span><b>${fmt(clim.median[i])}″</b></div>
      <div class="row"><span>10th–90th</span><b>${fmt(clim.p10[i])}–${fmt(clim.p90[i])}″</b></div>
      <div class="row"><span>Record</span><b>${fmt(clim.max[i])}″</b></div>`;
    tooltip.hidden = false;

    const card = el.parentElement.getBoundingClientRect();
    const svgBox = svg.node().getBoundingClientRect();
    const scale = svgBox.width / width;
    let left = svgBox.left - card.left + x(day) * scale + 14;
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
