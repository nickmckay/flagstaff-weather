# Flagstaff Weather

Flagstaff, Arizona weather that I find interesting, updated daily: https://nickmckay.github.io/flagstaff-weather/

The landing page (`index.html`) summarizes every tracker with a headline and a small chart. Four cumulative trackers compare this season's running total with every season since 1898, or with 21st-century seasons only (toggle on each page):

- **Water year** (`water-year.html`): precipitation, Oct 1 – Sep 30, named for the year it ends in
- **Snow** (`snow.html`): snowfall, Jul 1 – Jun 30
- **Monsoon** (`monsoon.html`): precipitation, Jun 15 – Sep 15
- **October** (`october.html`): precipitation, Oct 1 – 31

## How it works

- `scripts/fetch_acis.py` downloads the full daily record for the Flagstaff Area threaded station (`FLGthr`) from [NOAA ACIS](https://www.rcc-acis.org/). It writes `data/daily.csv` and one cumulative-series file per season (`data/<season>.json`). Seasons are defined in `SEASONS` at the top of the script; `site/js/common.js` has the matching page text and computes medians, percentiles and ranks for whichever comparison set is selected; `tracker.js` draws the season pages and `home.js` the landing page.
- `.github/workflows/update.yml` runs the script every morning (15:00 UTC), commits any data changes, and deploys `site/` plus `data/` to GitHub Pages.
- `data/reference/` holds season snowfall, ENSO, monthly precipitation and Niño 3.4 data imported from my compiled spreadsheet with `scripts/import_xlsx.py` (sources are in `data/reference/SOURCES.md`).

## Run locally

```sh
python scripts/fetch_acis.py
rm -rf _site && cp -r site _site && cp -r data _site/data
python -m http.server -d _site 8000
```

Setup: in repo Settings → Pages, set Source to "GitHub Actions".
