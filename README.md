# Flagstaff Weather

Flagstaff, Arizona weather that I find interesting, updated daily: https://nickmckay.github.io/flagstaff-weather/

The first page shows cumulative October precipitation: this year's running total against every October since 1898.

## How it works

- `scripts/fetch_acis.py` downloads the full daily record for the Flagstaff Area threaded station (`FLGthr`) from [NOAA ACIS](https://www.rcc-acis.org/). It writes `data/daily.csv` and the precomputed `data/october_precip.json`.
- `.github/workflows/update.yml` runs the script every morning (15:00 UTC), commits any data changes, and deploys `site/` plus `data/` to GitHub Pages.
- `data/reference/` holds season snowfall, ENSO, monthly precipitation and Niño 3.4 data imported from my compiled spreadsheet with `scripts/import_xlsx.py` (sources are in `data/reference/SOURCES.md`).

## Run locally

```sh
python scripts/fetch_acis.py
rm -rf _site && cp -r site _site && cp -r data _site/data
python -m http.server -d _site 8000
```

Setup: in repo Settings → Pages, set Source to "GitHub Actions".
