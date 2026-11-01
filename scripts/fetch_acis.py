"""Fetch the Flagstaff daily record from NOAA ACIS and build the site's data files.

Writes:
  data/daily.csv            full daily record (date, pcpn, snow, maxt, mint)
  data/october_precip.json  cumulative October precipitation by year + climatology
"""

import csv
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ACIS_URL = "https://data.rcc-acis.org/StnData"
STATION = "FLGthr"  # "Flagstaff Area" threaded record, 1898-present
ELEMS = ["pcpn", "snow", "maxt", "mint"]
MAX_MISSING_DAYS = 3  # Octobers with more missing days are excluded from statistics

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def fetch_daily(end: date) -> tuple[dict, list]:
    params = {
        "sid": STATION,
        "sdate": "por",
        "edate": end.isoformat(),
        "elems": ",".join(ELEMS),
        "meta": "name,sids,valid_daterange",
    }
    url = ACIS_URL + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as resp:
        payload = json.load(resp)
    if "error" in payload:
        sys.exit(f"ACIS error: {payload['error']}")
    return payload["meta"], payload["data"]


def parse_value(raw: str):
    """ACIS values: number, 'T' (trace -> 0.0), 'M' (missing -> None)."""
    if raw == "M" or raw == "":
        return None
    if raw == "T":
        return 0.0
    return float(raw.rstrip("ASMT"))


def write_daily_csv(rows: list, path: Path) -> None:
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date"] + ELEMS)
        w.writerows(rows)


def percentile(sorted_vals: list, q: float) -> float:
    """Linear-interpolated percentile of an already-sorted list."""
    pos = (len(sorted_vals) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def build_october(rows: list, today: date) -> dict:
    """Cumulative October precipitation for every year in the record."""
    target_year = today.year if today.month >= 10 else today.year - 1

    daily = {}  # year -> [31 values, None = missing]
    for row in rows:
        d = date.fromisoformat(row[0])
        if d.month != 10:
            continue
        daily.setdefault(d.year, [None] * 31)[d.day - 1] = parse_value(row[1])

    years, totals, missing_days = {}, {}, {}
    for year, vals in sorted(daily.items()):
        if year == target_year:
            continue
        n_missing = sum(v is None for v in vals)
        missing_days[year] = n_missing
        cum, run = [], 0.0
        for v in vals:
            run += v or 0.0
            cum.append(round(run, 2))
        years[str(year)] = cum
        totals[str(year)] = cum[-1]

    complete = [y for y in years if missing_days[int(y)] <= MAX_MISSING_DAYS]

    clim = {"p10": [], "median": [], "p90": [], "max": [], "min": []}
    for i in range(31):
        vals = sorted(years[y][i] for y in complete)
        clim["p10"].append(round(percentile(vals, 0.10), 2))
        clim["median"].append(round(percentile(vals, 0.50), 2))
        clim["p90"].append(round(percentile(vals, 0.90), 2))
        clim["max"].append(vals[-1])
        clim["min"].append(vals[0])

    # Current October: cumulative through the last reported day.
    cur_vals = daily.get(target_year, [])
    last_day = max((i + 1 for i, v in enumerate(cur_vals) if v is not None), default=0)
    cur_cum, run = [], 0.0
    for v in cur_vals[:last_day]:
        run += v or 0.0
        cur_cum.append(round(run, 2))

    current = {"year": target_year, "cumulative": cur_cum, "through_day": last_day}
    if last_day:
        so_far = cur_cum[-1]
        to_date = sorted((years[y][last_day - 1] for y in complete), reverse=True)
        current["total"] = so_far
        current["rank_wettest"] = 1 + sum(v > so_far for v in to_date)
        current["n_years"] = len(to_date) + 1
        current["median_to_date"] = clim["median"][last_day - 1]
        current["pct_of_median"] = (
            round(100 * so_far / clim["median"][last_day - 1])
            if clim["median"][last_day - 1] > 0 else None
        )

    ranked = sorted(complete, key=lambda y: totals[y], reverse=True)
    return {
        "meta": {
            "station": STATION,
            "source": "NOAA Regional Climate Centers ACIS (data.rcc-acis.org)",
            "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "max_missing_days": MAX_MISSING_DAYS,
        },
        "years": years,
        "complete_years": [int(y) for y in complete],
        "missing_days": {str(y): n for y, n in missing_days.items()},
        "wettest": [{"year": int(y), "total": totals[y]} for y in ranked[:5]],
        "driest": [{"year": int(y), "total": totals[y]} for y in ranked[::-1][:5]],
        "climatology": clim,
        "current": current,
    }


def main() -> None:
    today = date.today()
    meta, data = fetch_daily(today - timedelta(days=1))
    DATA_DIR.mkdir(exist_ok=True)
    write_daily_csv(data, DATA_DIR / "daily.csv")

    october = build_october(data, today)
    october["meta"]["station_name"] = meta.get("name")
    october["meta"]["record_start"] = data[0][0]
    october["meta"]["record_end"] = data[-1][0]
    with (DATA_DIR / "october_precip.json").open("w") as f:
        json.dump(october, f, separators=(",", ":"))

    cur = october["current"]
    print(f"{len(data)} days through {data[-1][0]}; "
          f"{len(october['complete_years'])} complete Octobers; "
          f"Oct {cur['year']}: {cur.get('total')} in through day {cur['through_day']}, "
          f"rank {cur.get('rank_wettest')}/{cur.get('n_years')}")


if __name__ == "__main__":
    main()
