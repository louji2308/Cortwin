# Data provenance — Extension of Z-Alizadeh Sani dataset

## Source

- **UCI Machine Learning Repository dataset 411** — "Extention of Z-Alizadeh Sani
  Dataset" (spelling as published by UCI).
- Download URL (retrieved 2026-10-03 UTC):
  `https://archive.ics.uci.edu/static/public/411/extention+of+z+alizadeh+sani+dataset.zip`
- Licence: **CC BY 4.0**, verified on the dataset page 2026-10-03:
  "This dataset is licensed under a Creative Commons Attribution 4.0
  International (CC BY 4.0) license."
- DOI: `10.24432/C5461K`
- Citation: Alizadehsani, R., Roshanzamir, M., & Sani, Z. (2013). extention of
  Z-Alizadeh sani dataset [Dataset]. UCI Machine Learning Repository.
  https://doi.org/10.24432/C5461K
- Format as published: one `.xlsx` workbook inside the zip.

## Publisher notes relevant to this project (quoted, not interpreted)

- Label definition: "A patient is categorized as CAD, if his/her diameter
  narrowing is greater than or equal to 50%, and otherwise as Normal."
- Leakage warning from the publisher: "To use this dataset only one of the
  LAD, LCX, RCA or Cath (Result of angiography) must be in dataset and the
  other ones must be eliminated for classification."
- Page facts: 303 instances, 59 features, "Has Missing Values? No".

## Files in `data/raw/`

| File | Bytes | sha256 |
|---|---|---|
| `extention-of-z-alizadeh-sani-uci411.zip` | 131317 | `e97af1a18733d64fa88caa0628e5fe7ce6b2e26ec4c7ee03baade92a6f1470e8` |
| `extention of Z-Alizadeh sani dataset.xlsx` | 131137 | `739343245c2ba578b541370217531750d8e936022f928b83e0d91756caa3ff0b` |
| `extention-of-z-alizadeh-sani.csv` | 59374 | `b60472ecebdd4ea11d09b8a793711b8da2051fdf79eeae5b88f33269e4a02d37` |

Authoritative checksums live in `data/CHECKSUMS.txt` (sha256sum format, paths
relative to `data/`).

## CSV conversion

`extention-of-z-alizadeh-sani.csv` was produced from the xlsx with pandas
(`DataFrame.to_csv(index=False)`). Verification performed at conversion time:
round-trip `read_csv` → `read_excel` cell-by-cell comparison over the full
303 × 59 frame reported **0 differing cells** (dtypes normalised to string for
comparison). The CSV is the canonical file loaded by `pipeline/dataset.py`.

## Facts about the data (observed, not interpreted)

- Shape: **303 rows × 59 columns**, zero missing cells in any column.
- The source workbook has **no column named `CAD`**. The five outcome columns
  are `LAD`, `LCX`, `RCA`, `Cath` (plus the constant column `Exertional CP`).
- `Cath` holds the values `CAD` (216 rows) and `Normal` (87 rows); it is the
  label column for the overall `CAD` target (recorded in
  `config/targets.json → labelColumn`).
- Vessel label counts (`Stenotic`): LAD 177, LCX 119, RCA 114.
- `Exertional CP` has exactly one distinct value (`N`) across all 303 rows —
  constant column, forbidden as an input (`config/forbidden.json`).
- `BMI` equals `Weight / (Length/100)^2` to floating-point precision for every
  row (max absolute error ≈ 0); it is marked as a derived feature in
  `config/features.json`.

## What this file does not contain

No clinical interpretation, no imputation, no derived feature values, no
patient-identifying information. Column-level inventory (type, distinct count,
missing count, role, modality) is in `data/COLUMN_INVENTORY.md`.
