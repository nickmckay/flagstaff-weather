"""One-time import of the compiled spreadsheet into data/reference/*.csv.

Usage: python scripts/import_xlsx.py "path/to/Flagstaff snow, rain and ENSO data.xlsx"
"""

import csv
import sys
from pathlib import Path

import openpyxl

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "reference"

SHEETS = {
    "snowData": "season_snowfall_enso.csv",
    "Monthly Precipitation": "monthly_precipitation.csv",
    "Nino3.4": "nino34_monthly.csv",
}


def clean(v):
    if v is None or v == "NA":
        return ""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, float):
        return round(v, 4)
    return v


def main(xlsx_path: str) -> None:
    wb = openpyxl.load_workbook(xlsx_path, data_only=True, read_only=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for sheet, filename in SHEETS.items():
        rows = [r for r in wb[sheet].iter_rows(values_only=True) if any(c is not None for c in r)]
        with (OUT_DIR / filename).open("w", newline="") as f:
            csv.writer(f).writerows([clean(c) for c in r] for r in rows)
        print(f"{sheet}: {len(rows) - 1} rows -> {filename}")

    readme = [r[0] for r in wb["readme"].iter_rows(values_only=True) if r[0]]
    with (OUT_DIR / "SOURCES.md").open("w") as f:
        f.write("# Reference data sources\n\n")
        f.write("Imported from the compiled spreadsheet. Original notes:\n\n")
        f.writelines(f"- {line}\n" for line in readme)


if __name__ == "__main__":
    main(sys.argv[1])
