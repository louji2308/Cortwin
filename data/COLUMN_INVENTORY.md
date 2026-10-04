# Column inventory - UCI 411 Extension of Z-Alizadeh Sani (303 x 59)

Generated from `data/raw/extention-of-z-alizadeh-sani.csv` (sha256
`b60472ecebdd4ea11d09b8a793711b8da2051fdf79eeae5b88f33269e4a02d37`) and the
authoritative configs in `config/`. Observed values only - no clinical
interpretation, no imputation.

- 59 columns = 54 model features + 4 target label columns (LAD, LCX, RCA, Cath)
  + 1 constant column (Exertional CP).
- Modality grouping: Idea.md section 3, source-column order (History 17,
  Exam 13, ECG 7, Labs 14, Echo 3).
- "Distinct" counts distinct non-null values; "Missing" counts null cells.

| Column | Inferred type | Distinct | Missing | Role | Modality | Observed values (sample) |
|---|---|---|---|---|---|---|| Age | numeric | 46 | 0 | feature (continuous) | History | 30, 36, 38, 40, 41, 42 ... |
| Weight | numeric | 54 | 0 | feature (continuous) | History | 100, 102, 103, 105, 108, 120 ... |
| Length | numeric | 44 | 0 | feature (continuous) | History | 140, 144, 145, 147, 148, 149 ... |
| Sex | string | 2 | 0 | feature (binary) | History | Fmale, Male |
| BMI | numeric | 263 | 0 | feature (continuous) | History | 18.115412710007305, 18.36547291092746, 18.826793499801823, 18.93877551020408, 19.031141868512112, 19.05197378448407 ... |
| DM | numeric | 2 | 0 | feature (binary) | History | 0, 1 |
| HTN | numeric | 2 | 0 | feature (binary) | History | 0, 1 |
| Current Smoker | numeric | 2 | 0 | feature (binary) | History | 0, 1 |
| EX-Smoker | numeric | 2 | 0 | feature (binary) | History | 0, 1 |
| FH | numeric | 2 | 0 | feature (binary) | History | 0, 1 |
| Obesity | string | 2 | 0 | feature (binary) | History | N, Y |
| CRF | string | 2 | 0 | feature (binary) | History | N, Y |
| CVA | string | 2 | 0 | feature (binary) | History | N, Y |
| Airway disease | string | 2 | 0 | feature (binary) | History | N, Y |
| Thyroid Disease | string | 2 | 0 | feature (binary) | History | N, Y |
| CHF | string | 2 | 0 | feature (binary) | History | N, Y |
| DLP | string | 2 | 0 | feature (binary) | History | N, Y |
| BP | numeric | 17 | 0 | feature (continuous) | Exam & symptoms | 100, 105, 110, 115, 118, 120 ... |
| PR | numeric | 21 | 0 | feature (continuous) | Exam & symptoms | 100, 110, 50, 60, 64, 65 ... |
| Edema | numeric | 2 | 0 | feature (binary) | Exam & symptoms | 0, 1 |
| Weak Peripheral Pulse | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Lung rales | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Systolic Murmur | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Diastolic Murmur | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Typical Chest Pain | numeric | 2 | 0 | feature (binary) | Exam & symptoms | 0, 1 |
| Dyspnea | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Function Class | numeric | 4 | 0 | feature (categorical) | Exam & symptoms | 0, 1, 2, 3 |
| Atypical | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Nonanginal | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Exertional CP | string | 1 | 0 | constant column (forbidden input) | - | N |
| LowTH Ang | string | 2 | 0 | feature (binary) | Exam & symptoms | N, Y |
| Q Wave | numeric | 2 | 0 | feature (binary) | ECG | 0, 1 |
| St Elevation | numeric | 2 | 0 | feature (binary) | ECG | 0, 1 |
| St Depression | numeric | 2 | 0 | feature (binary) | ECG | 0, 1 |
| Tinversion | numeric | 2 | 0 | feature (binary) | ECG | 0, 1 |
| LVH | string | 2 | 0 | feature (binary) | ECG | N, Y |
| Poor R Progression | string | 2 | 0 | feature (binary) | ECG | N, Y |
| BBB | string | 3 | 0 | feature (categorical) | ECG | LBBB, N, RBBB |
| FBS | numeric | 113 | 0 | feature (continuous) | Labs | 100, 101, 102, 103, 104, 105 ... |
| CR | numeric | 18 | 0 | feature (continuous) | Labs | 0.5, 0.6, 0.7, 0.8, 0.9, 1.0 ... |
| TG | numeric | 147 | 0 | feature (continuous) | Labs | 100, 101, 102, 103, 104, 105 ... |
| LDL | numeric | 110 | 0 | feature (continuous) | Labs | 100, 101, 103, 104, 106, 107 ... |
| HDL | numeric | 47 | 0 | feature (continuous) | Labs | 111.0, 15.9, 18.0, 22.0, 23.0, 24.0 ... |
| BUN | numeric | 33 | 0 | feature (continuous) | Labs | 10, 11, 12, 13, 14, 15 ... |
| ESR | numeric | 58 | 0 | feature (continuous) | Labs | 1, 10, 11, 12, 13, 14 ... |
| HB | numeric | 66 | 0 | feature (continuous) | Labs | 10.0, 10.1, 10.5, 10.7, 10.8, 11.0 ... |
| K | numeric | 27 | 0 | feature (continuous) | Labs | 3.0, 3.1, 3.2, 3.3, 3.4, 3.5 ... |
| Na | numeric | 25 | 0 | feature (continuous) | Labs | 128, 130, 131, 132, 133, 134 ... |
| WBC | numeric | 78 | 0 | feature (continuous) | Labs | 10000, 10300, 10400, 10900, 11000, 11300 ... |
| Lymph | numeric | 50 | 0 | feature (continuous) | Labs | 10, 11, 12, 13, 15, 16 ... |
| Neut | numeric | 52 | 0 | feature (continuous) | Labs | 32, 33, 35, 38, 39, 40 ... |
| PLT | numeric | 135 | 0 | feature (continuous) | Labs | 118, 129, 131, 145, 149, 156 ... |
| EF-TTE | numeric | 11 | 0 | feature (continuous) | Echo | 15, 20, 25, 30, 35, 40 ... |
| Region RWMA | numeric | 5 | 0 | feature (categorical) | Echo | 0, 1, 2, 3, 4 |
| VHD | string | 4 | 0 | feature (categorical) | Echo | Moderate, N, Severe, mild |
| LAD | string | 2 | 0 | label column for target LAD | - | Normal, Stenotic |
| LCX | string | 2 | 0 | label column for target LCX | - | Normal, Stenotic |
| RCA | string | 2 | 0 | label column for target RCA | - | Normal, Stenotic |
| Cath | string | 2 | 0 | label column for target CAD | - | CAD, Normal |
