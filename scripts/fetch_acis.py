"""Fetch the Flagstaff daily record from NOAA ACIS and build the site's data files.

Writes:
  data/daily.csv          full daily record (date, pcpn, snow, maxt, mint)
  data/nino34.csv         monthly Nino 3.4 anomalies (NOAA PSL, HadISST, 1870-present)
  data/<season>.json      cumulative series for each season in SEASONS, with the
                          season-mean Nino 3.4 for each year
"""

import calendar
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

# A season is labeled by the calendar year it ends in (water year 2027 =
# Oct 2026-Sep 2027; snow season 2027 = Jul 2026-Jun 2027, matching the
# spreadsheet's "June year" convention).
SEASONS = [
    {"id": "october", "element": "pcpn", "start": (10, 1), "end": (10, 31)},
    {"id": "monsoon", "element": "pcpn", "start": (6, 15), "end": (9, 15)},
    {"id": "water_year", "element": "pcpn", "start": (10, 1), "end": (9, 30)},
    {"id": "snow", "element": "snow", "start": (7, 1), "end": (6, 30)},
]
NINO34_URL = "https://psl.noaa.gov/data/timeseries/month/data/nino34.long.anom.data"
MISSING_FRACTION = 0.05  # seasons missing more days than this (min 3) are excluded

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


def fetch_nino34() -> dict:
    """Monthly Nino 3.4 anomalies as {(year, month): value}."""
    with urllib.request.urlopen(NINO34_URL, timeout=60) as resp:
        lines = resp.read().decode().splitlines()
    first, last = (int(v) for v in lines[0].split())
    out = {}
    for line in lines[1:]:
        parts = line.split()
        if len(parts) != 13 or not parts[0].isdigit() or not first <= int(parts[0]) <= last:
            continue
        for month, raw in enumerate(parts[1:], start=1):
            v = float(raw)
            if v > -99:
                out[(int(parts[0]), month)] = v
    return out


def season_nino34(spec: dict, years, nino: dict) -> dict:
    """Mean Nino 3.4 over each season's months (partial seasons use what exists)."""
    crosses = spec["end"] < spec["start"]
    out = {}
    for year in years:
        sy = year - 1 if crosses else year
        m, y = spec["start"][0], sy
        vals = []
        while True:
            if (y, m) in nino:
                vals.append(nino[(y, m)])
            if (m, y) == (spec["end"][0], year):
                break
            m, y = (1, y + 1) if m == 12 else (m + 1, y)
        out[str(year)] = round(sum(vals) / len(vals), 2) if vals else None
    return out


def write_daily_csv(rows: list, path: Path) -> None:
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date"] + ELEMS)
        w.writerows(rows)


def season_days(spec: dict) -> list[tuple[int, int]]:
    """(month, day) for every day of the season, using a leap-year template
    so Feb 29 has a slot; in non-leap years that day adds nothing."""
    crosses = spec["end"] < spec["start"]
    d = date(1999 if crosses else 2000, *spec["start"])
    end = date(2000, *spec["end"])
    out = []
    while d <= end:
        out.append((d.month, d.day))
        d += timedelta(days=1)
    return out


def build_season(spec: dict, values: dict, first: date, last: date) -> dict:
    """Cumulative series for every season year in the record."""
    template = season_days(spec)
    crosses = spec["end"] < spec["start"]
    max_missing = max(3, round(MISSING_FRACTION * len(template)))
    digits = 1 if spec["element"] == "snow" else 2

    def start_of(year):
        return date(year - 1 if crosses else year, *spec["start"])

    first_year = first.year + (1 if crosses else 0)
    if start_of(first_year) < first:
        first_year += 1
    current_year = last.year + (1 if crosses and (last.month, last.day) >= spec["start"] else 0)
    if start_of(current_year) > last:
        current_year -= 1

    years, missing = {}, {}
    current = None
    for year in range(first_year, current_year + 1):
        sy = start_of(year).year
        cum, run, n_missing, through = [], 0.0, 0, 0
        for i, (m, d) in enumerate(template):
            cal_year = sy if (m, d) >= spec["start"] else sy + 1
            if m == 2 and d == 29 and not calendar.isleap(cal_year):
                v = 0.0
            else:
                day = date(cal_year, m, d)
                if day > last:
                    break
                v = values.get(day)
            if v is None:
                n_missing += 1
            else:
                through = i + 1
            run += v or 0.0
            cum.append(round(run, digits))

        if year == current_year and through < len(template):
            current = {"year": year, "cumulative": cum[:through], "through_index": through,
                       "missing_days": n_missing - (len(cum) - through)}
        else:
            years[str(year)] = cum
            missing[str(year)] = n_missing

    if current is None:  # the latest season just finished; show it as current
        current = {"year": current_year, "cumulative": years[str(current_year)],
                   "through_index": len(template), "missing_days": missing[str(current_year)]}

    return {
        "meta": {
            "station": STATION,
            "source": "NOAA Regional Climate Centers ACIS (data.rcc-acis.org)",
            "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
            "record_end": last.isoformat(),
            "max_missing_days": max_missing,
        },
        "season": {
            "id": spec["id"],
            "element": spec["element"],
            "dates": [f"{m:02d}-{d:02d}" for m, d in template],
        },
        "years": years,
        "complete_years": [int(y) for y, n in missing.items() if n <= max_missing],
        "missing_days": missing,
        "current": current,
    }


def main() -> None:
    today = date.today()
    meta, data = fetch_daily(today - timedelta(days=1))
    DATA_DIR.mkdir(exist_ok=True)
    write_daily_csv(data, DATA_DIR / "daily.csv")

    nino = fetch_nino34()
    with (DATA_DIR / "nino34.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "month", "nino34_anom"])
        w.writerows([y, m, v] for (y, m), v in sorted(nino.items()))
    nino_latest = max(nino)

    col = {e: i + 1 for i, e in enumerate(ELEMS)}
    first = date.fromisoformat(data[0][0])
    reported = [r for r in data if r[col["pcpn"]] != "M"]
    last = date.fromisoformat(reported[-1][0])

    for spec in SEASONS:
        values = {date.fromisoformat(r[0]): parse_value(r[col[spec["element"]]]) for r in data}
        out = build_season(spec, values, first, last)
        out["meta"]["station_name"] = meta.get("name")
        all_years = [int(y) for y in out["years"]] + [out["current"]["year"]]
        out["nino34"] = season_nino34(spec, all_years, nino)
        out["meta"]["nino34_source"] = "NOAA PSL Nino 3.4 (HadISST), anomaly from 1981-2010"
        out["meta"]["nino34_latest"] = {"year": nino_latest[0], "month": nino_latest[1],
                                        "value": nino[nino_latest]}
        with (DATA_DIR / f"{spec['id']}.json").open("w") as f:
            json.dump(out, f, separators=(",", ":"))
        cur = out["current"]
        total = cur["cumulative"][-1] if cur["cumulative"] else None
        print(f"{spec['id']}: {len(out['complete_years'])} complete seasons; "
              f"{cur['year']}: {total} through {out['season']['dates'][cur['through_index'] - 1]}")

    print(f"{len(data)} days, last reported {last}")


if __name__ == "__main__":
    main()
