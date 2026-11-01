// Landing page: one summary card per season tracker. Needs js/common.js.

const ORDER = ["water_year", "snow", "monsoon", "october"];
const loaded = {};

renderShell();
Promise.all(ORDER.map((id) =>
  fetch(`data/${id}.json`, { cache: "no-cache" }).then((r) => r.json()).then((d) => { loaded[id] = d; })))
  .then(() => {
    renderCards();
    document.getElementById("updated").textContent = updatedText(loaded[ORDER[0]]);
    let w = window.innerWidth;
    window.addEventListener("resize", () => {
      if (window.innerWidth !== w) { w = window.innerWidth; renderCards(); }
    });
  })
  .catch((err) => {
    document.getElementById("cards").textContent = "Couldn't load the data: " + err.message;
  });

function renderShell() {
  document.body.innerHTML = `${headerHTML("home")}
<main class="wrap">
  <section class="intro">
    <p class="eyebrow">Flagstaff, Arizona</p>
    <h1>Rain and snow, season by season</h1>
    <p class="lede">Each season's running total of rain or snow, compared with every season back to 1898. Updated every morning from NOAA's daily record.</p>
  </section>
  ${toggleHTML()}
  <ul class="legend spark-legend">
    <li><span class="key" style="border-color:var(--current);border-top-width:3px"></span>This season</li>
    <li><span class="key" style="border-color:var(--median)"></span>Median</li>
    <li><span class="key band"></span>Typical range (10th–90th percentile)</li>
  </ul>
  <section class="cards" id="cards" aria-live="polite"></section>
</main>
${footerHTML()}`;
  wireToggle(renderCards);
}

function renderCards() {
  const wrap = document.getElementById("cards");
  wrap.innerHTML = ORDER.map((id) => cardHTML(id)).join("");
  ORDER.forEach((id) => drawSpark(id));
  updateNavLinks();
}

function cardHTML(id) {
  const cfg = SEASONS[id];
  const data = loaded[id];
  const s = computeStats(data);
  const fmt = formatter(data);
  const dates = data.season.dates;

  let status, figure, sub;
  if (s.t === undefined) {
    status = "Not started";
    figure = "—";
    sub = "";
  } else {
    status = s.done ? "Final" : `In progress · through ${s.asOf}`;
    figure = `${fmt(s.total)}<small> in</small>`;
    if (s.total === 0) {
      sub = `${s.nAbove} of ${s.nYears - 1} seasons had some by ${s.asOf}`;
    } else if (s.pctOfMedian != null) {
      sub = `${s.pctOfMedian}% of the median${s.done ? " season" : " for this date"}`;
    } else {
      sub = "";
    }
  }

  return `
  <a class="season-card" data-page="${id}" href="${PAGES[id]}">
    <div class="card-top">
      <span class="card-name">${cfg.nav}</span>
      <span class="chip${s.done ? "" : " live"}">${status}</span>
    </div>
    <p class="card-blurb">${cfg.blurb}</p>
    <p class="card-headline">${headlineText(data, s, cfg)}</p>
    <div class="card-figure"><span class="value">${figure}</span><span class="sub">${sub}</span></div>
    <div class="spark" id="spark-${id}" role="img"
      aria-label="${cfg.short(data.current.year)} running total against the typical range"></div>
    <div class="card-foot">
      <span>${dateLabel(dates[0])}</span>
      <span class="more">Full chart →</span>
      <span>${dateLabel(dates[dates.length - 1])}</span>
    </div>
  </a>`;
}

// Small chart: typical range and median, with this season on top.
function drawSpark(id) {
  const el = document.getElementById(`spark-${id}`);
  const data = loaded[id];
  const s = computeStats(data);
  const cur = data.current.cumulative;
  const width = el.clientWidth, height = 96;
  const pad = 6;

  const x = d3.scaleLinear().domain([0, s.n - 1]).range([pad, width - pad]);
  const y = d3.scaleLinear()
    .domain([0, d3.max([d3.max(s.clim.p90), d3.max(cur) || 0]) || 1])
    .range([height - pad, pad]);
  const line = d3.line().x((_, i) => x(i)).y((v) => y(v));

  const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${width} ${height}`);
  svg.append("line").attr("class", "spark-base")
    .attr("x1", pad).attr("x2", width - pad).attr("y1", y(0)).attr("y2", y(0));
  svg.append("path").attr("class", "band")
    .attr("d", d3.area().x((_, i) => x(i)).y0((_, i) => y(s.clim.p10[i])).y1((v) => y(v))(s.clim.p90));
  svg.append("path").attr("class", "median").attr("d", line(s.clim.median));
  if (cur.length) {
    svg.append("path").attr("class", "current").attr("d", line(cur));
    svg.append("circle").attr("class", "current-dot")
      .attr("cx", x(cur.length - 1)).attr("cy", y(cur[cur.length - 1])).attr("r", 4);
  }
}
