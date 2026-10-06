"""Deterministic golden-fixture generator (C-06, Implementation_Plan P3-2).

Builds ``tests/fixtures/golden.json`` — the byte-stable artifact the TypeScript
engine is held against at C-06 tolerances.  Every expected value comes from
:mod:`pipeline.oracle` (the validated runtime form); nothing is typed by hand.

    python -m pipeline.make_fixtures [--out PATH]

Coverage of C-06's mandatory list is *enforced*, not hoped for: :meth:`build`
raises :class:`FixtureError` if a class is missing or a fixture does not do
what its tags claim.

=========================== ===================================================
tag                          C-06 class
=========================== ===================================================
``fully-observed``           fully observed
``blank``                    blank
``modality-masked``          each modality masked independently
``cumulative-stage``         cumulative stage masks
``multi-modality``           multi-modality combinations
``categorical-levels``       every categorical and ordinal level
``split-threshold``          values exactly at split thresholds
``float-rounding``           float-rounding boundaries
``threshold-boundary``       threshold boundaries
``abstention-edge``          abstention-band edges
``vessel-above-CAD``         vessel-above-CAD coherence
``out-of-range``             out-of-range values
``observed-only``            observed-only attribution
``finite-output-failure``    finite-output failures
=========================== ===================================================

``selected-target-changes`` is verified structurally: every normal fixture
carries an explanation for **all four** targets, so any target the UI can
select is pinned by a fixture.

Failure fixtures express their expectation as
``expected: {"failure": {"code": <C-07 code>, "featureId": <id>}}``; normal
fixtures carry the C-08 evaluation (targets, headlineCad, rangeFlags) plus the
C-06 explanation subset for all four targets.

Determinism: row selection runs through a seeded RNG (``GENERATION_SEED``) and
the document is serialised with sorted keys and ``allow_nan=False`` — two runs
on the same artifacts produce identical bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any

import numpy as np

from .config import feature_list, load_registry
from .encode import decode_value
from .errors import EncodingError, ForbiddenInputError, PipelineError
from .oracle import (
    CONTRACT_TARGETS,
    MODEL_PATH,
    ORACLE_REVISION,
    Oracle,
    OracleError,
    c07_error_code,
)
from .prepare import prepare_dataset

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "tests" / "fixtures" / "golden.json"
GENERATION_SEED = 606
SCHEMA_VERSION = "1.0.0"
TOLERANCE = {
    "probability": 0.00001,
    "margin": 0.00001,
    "attribution": 0.00001,
    "efficiency": 0.000001,
}
AGGREGATION_TOLERANCE = 1e-9
BOUNDARY_TOLERANCE = 1e-4
EDGE_STEP = 1e-3
SEARCH_GRID = 41
MAX_BOUNDARY_ROWS = 12

REQUIRED_TAGS = (
    "fully-observed",
    "blank",
    "modality-masked",
    "cumulative-stage",
    "multi-modality",
    "categorical-levels",
    "split-threshold",
    "float-rounding",
    "threshold-boundary",
    "abstention-edge",
    "vessel-above-CAD",
    "out-of-range",
    "observed-only",
    "finite-output-failure",
)

BOUNDARY_FEATURES = ("Age", "BMI", "FBS", "Weight", "EF-TTE", "LDL", "TG", "HB")
SPLIT_THRESHOLD_FEATURES = ("Age", "BMI", "FBS", "Weight")
FLOAT_ROUNDING_OVERRIDES = {
    "Age": 58.0000001,
    "Length": 172.9999999,
    "FBS": 95.0000001,
    "BMI": 33.3333333333,
    "Weight": 70.123456789,
}
OUT_OF_RANGE_OVERRIDES = {"Age": 15.0, "EF-TTE": 95.0, "BMI": 99.0}


class FixtureError(PipelineError):
    """A fixture could not be generated, or its self-check failed."""


def _canonical(document: dict) -> bytes:
    return (
        json.dumps(document, indent=2, sort_keys=True, ensure_ascii=True, allow_nan=False)
        + "\n"
    ).encode("utf-8")


def _level_key(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return float(value)
    return str(value)


class FixtureGenerator:
    """Builds the fixture document from the validated oracle."""

    def __init__(self) -> None:
        if not MODEL_PATH.is_file():
            raise FixtureError("model.json missing — run `python -m pipeline.export_model` first")
        self.oracle = Oracle.load()
        self.model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
        self.registry = load_registry()
        self.features = feature_list()
        self.feature_by_id = {feature["id"]: feature for feature in self.features}
        self.feature_index = {
            feature["id"]: position for position, feature in enumerate(self.features)
        }
        self.prepared = prepare_dataset()
        self.rng = np.random.default_rng(GENERATION_SEED)
        self.observed_all = np.ones(self.oracle.n_features, dtype=bool)
        self._rows = [self._decode_row(row_index) for row_index in range(self.prepared.n_patients)]
        self._level_rows: list[int] = []
        self._cohort_raw: dict[str, list[float]] = {}
        self._boundary_report: list[str] = []

    # ------------------------------------------------------------- inputs

    def _decode_row(self, row_index: int) -> dict[str, Any]:
        row = self.prepared.X[row_index]
        return {
            feature["id"]: decode_value(feature, float(row[position]))
            for position, feature in enumerate(self.features)
        }

    def _row_values(self, row_index: int) -> dict[str, Any]:
        return dict(self._rows[row_index])

    def _provision(self, unprovided: set[str]) -> dict[str, bool]:
        return {feature["id"]: feature["id"] not in unprovided for feature in self.features}

    def _all_provided(self) -> dict[str, bool]:
        return {feature["id"]: True for feature in self.features}

    def _spec(
        self,
        tags: list[str],
        values: dict[str, Any],
        provided: dict[str, bool],
    ) -> dict[str, Any]:
        return {
            "coverageTags": tags,
            "input": {"values": values, "providedFeatures": provided},
        }

    def _row_spec(
        self,
        row_index: int,
        tags: list[str],
        overrides: dict[str, Any] | None = None,
        unprovided: set[str] | None = None,
    ) -> dict[str, Any]:
        values = self._row_values(row_index)
        if overrides:
            values.update(overrides)
        return self._spec(tags, values, self._provision(unprovided or set()))

    def _level_row(self, slot: int) -> int:
        if not self._level_rows:
            raise FixtureError("level coverage rows are not initialised")
        return self._level_rows[slot % len(self._level_rows)]

    # ----------------------------------------------------------- coverage

    def _levels_required(self) -> dict[str, set[Any]]:
        required: dict[str, set[Any]] = {}
        for feature in self.features:
            if feature["type"] == "continuous":
                continue
            allowed = feature.get("allowedValues")
            if not allowed:
                raise FixtureError(f"{feature['id']} has no allowed values to cover")
            required[feature["id"]] = {_level_key(value) for value in allowed}
        return required

    def _level_specs(self) -> list[dict[str, Any]]:
        """Greedy seeded cover of every categorical/ordinal level, plus synthesis."""
        required = self._levels_required()
        uncovered = {fid: set(levels) for fid, levels in required.items()}
        order = list(range(self.prepared.n_patients))
        self.rng.shuffle(order)

        selected: list[int] = []
        while any(uncovered.values()):
            best_row = -1
            best_gain = 0
            for row_index in order:
                if row_index in selected:
                    continue
                values = self._rows[row_index]
                gain = sum(
                    1
                    for fid, levels in uncovered.items()
                    if _level_key(values[fid]) in levels
                )
                if gain > best_gain:
                    best_gain = gain
                    best_row = row_index
            if best_gain == 0:
                break
            selected.append(best_row)
            values = self._rows[best_row]
            for fid, levels in uncovered.items():
                if _level_key(values[fid]) in levels:
                    levels.discard(_level_key(values[fid]))

        leftovers = {
            fid: sorted(levels, key=lambda item: str(item))
            for fid, levels in uncovered.items()
            if levels
        }
        synthesis: list[tuple[int, dict[str, Any]]] = []
        if leftovers:
            base_row = min(selected) if selected else 0
            rounds = max(len(levels) for levels in leftovers.values())
            for round_index in range(rounds):
                overrides: dict[str, Any] = {}
                for fid, levels in leftovers.items():
                    if round_index < len(levels):
                        overrides[fid] = levels[round_index]
                synthesis.append(
                    (base_row, {"tags": ["fully-observed", "categorical-levels"], "overrides": overrides})
                )

        specs = [
            self._row_spec(row_index, ["fully-observed", "categorical-levels"])
            for row_index in selected
        ]
        for row_index, item in synthesis:
            specs.append(
                self._row_spec(
                    row_index, item["tags"], overrides=item["overrides"]
                )
            )

        remaining = self._levels_required()
        for spec in specs:
            values = spec["input"]["values"]
            for fid in remaining:
                remaining[fid].discard(_level_key(values[fid]))
        missing = {fid: sorted(levels, key=str) for fid, levels in remaining.items() if levels}
        if missing:
            raise FixtureError(f"categories still uncovered after synthesis: {missing}")
        if not specs:
            raise FixtureError("no level-coverage fixtures were produced")

        used_rows = sorted({row_index for row_index in selected} | {row for row, _ in synthesis})
        if not used_rows:
            raise FixtureError("no cohort rows were selected for level coverage")
        self._level_rows = used_rows
        return specs

    def _blank_spec(self) -> dict[str, Any]:
        unprovided = set(self.feature_by_id)
        return self._spec(["blank"], {}, self._provision(unprovided))

    def _mask_specs(self) -> list[dict[str, Any]]:
        base_row = self._level_row(0)
        return [
            self._row_spec(
                base_row,
                ["modality-masked", "observed-only"],
                unprovided={
                    fid
                    for fid, feature in self.feature_by_id.items()
                    if feature["modality"] == modality["id"]
                },
            )
            for modality in self.registry["modalities"]
        ]

    def _stage_specs(self) -> list[dict[str, Any]]:
        base_row = self._level_row(0)
        specs = []
        for stage in self.registry["stages"]:
            allowed = set(stage["modalitiesThrough"])
            unprovided = {
                fid
                for fid, feature in self.feature_by_id.items()
                if feature["modality"] not in allowed
            }
            specs.append(
                self._row_spec(
                    base_row,
                    ["cumulative-stage", "observed-only"],
                    unprovided=unprovided,
                )
            )
        return specs

    def _combo_specs(self) -> list[dict[str, Any]]:
        base_row = self._level_row(1)
        combos = ({"history", "labs"}, {"exam", "ecg", "echo"}, {"ecg", "labs", "echo"})
        return [
            self._row_spec(
                base_row,
                ["multi-modality", "observed-only"],
                unprovided={
                    fid
                    for fid, feature in self.feature_by_id.items()
                    if feature["modality"] not in combo
                },
            )
            for combo in combos
        ]

    def _cad_split_thresholds(self) -> dict[str, float]:
        thresholds: dict[str, float] = {}
        trees = self.model["components"]["CAD"]["trees"]["trees"]
        for entry in trees:
            for node in entry["nodes"]:
                if node.get("featureIndex") is None:
                    continue
                fid = self.oracle.feature_ids[int(node["featureIndex"])]
                feature = self.feature_by_id[fid]
                if feature["type"] == "continuous":
                    thresholds.setdefault(fid, float(node["threshold"]))
        return thresholds

    def _split_threshold_specs(self) -> list[dict[str, Any]]:
        """Source values that land exactly on exported CAD split thresholds."""
        thresholds = self._cad_split_thresholds()
        available = [fid for fid in SPLIT_THRESHOLD_FEATURES if fid in thresholds]
        if len(available) < 3:
            raise FixtureError("fewer than three continuous split thresholds are exported")
        first = {fid: thresholds[fid] for fid in available[:3]}
        second_fid = available[3] if len(available) > 3 else available[0]
        return [
            self._row_spec(
                self._level_row(0),
                ["split-threshold", "boundary"],
                overrides=first,
            ),
            self._row_spec(
                self._level_row(1),
                ["split-threshold", "boundary"],
                overrides={second_fid: thresholds[second_fid]},
            ),
        ]

    def _float_rounding_spec(self) -> dict[str, Any]:
        for fid, value in FLOAT_ROUNDING_OVERRIDES.items():
            if float(np.float32(value)) == float(value):
                raise FixtureError(f"{fid} value {value} does not exercise float32 rounding")
        return self._row_spec(
            self._level_row(1),
            ["float-rounding", "boundary"],
            overrides=dict(FLOAT_ROUNDING_OVERRIDES),
        )

    def _out_of_range_specs(self) -> list[dict[str, Any]]:
        return [
            self._row_spec(
                self._level_row(0),
                ["out-of-range"],
                overrides={"Age": OUT_OF_RANGE_OVERRIDES["Age"]},
            ),
            self._row_spec(
                self._level_row(1),
                ["out-of-range"],
                overrides=dict(OUT_OF_RANGE_OVERRIDES),
            ),
        ]

    def _vessel_spec(self) -> dict[str, Any] | None:
        for row_index in range(self.prepared.n_patients):
            headline = self.oracle.evaluate(self.prepared.X[row_index], self.observed_all)[
                "headlineCad"
            ]
            if headline["valueSourceTargetId"] != "CAD":
                return self._row_spec(
                    row_index,
                    ["fully-observed", "vessel-above-CAD", "selected-target-changes"],
                )
        return None

    def _boundary_spec(
        self, tags: list[str], target_id: str, goal: float, label: str, decision: str
    ) -> dict[str, Any]:
        """Find a fully observed case whose raw margin lands on ``goal``.

        Rows are ranked by |raw − goal| first: a single feature can only move
        the margin by a limited amount, so the base row must already sit near
        the goal for a crossing to exist at all.
        """
        goal = float(goal)
        for row_index in self._rows_ranked_by_margin(target_id, goal)[:MAX_BOUNDARY_ROWS]:
            for fid in BOUNDARY_FEATURES:
                feature = self.feature_by_id[fid]
                if feature["type"] != "continuous" or not feature.get("range"):
                    continue
                solution = self._solve_affine(row_index, fid, target_id, goal)
                if solution is None:
                    continue
                value, distance = solution
                if distance > BOUNDARY_TOLERANCE:
                    continue
                self._boundary_report.append(
                    f"{label}: row={row_index} {fid}={value!r} |raw-goal|={distance:.3e}"
                )
                spec = self._row_spec(row_index, tags, overrides={fid: value})
                spec["_checkDecision"] = decision
                return spec
        raise FixtureError(f"no feature could place the raw margin near {label}")

    def _rows_ranked_by_margin(self, target_id: str, goal: float) -> list[int]:
        """Cohort rows whose fully observed raw margin is closest to ``goal``."""
        raws = self._cohort_raw.get(target_id)
        if raws is None:
            raws = []
            for row_index in range(self.prepared.n_patients):
                vector, mask = self.oracle.encode(self._rows[row_index])
                raws.append(self.oracle.raw_margin(target_id, vector, mask))
            self._cohort_raw[target_id] = raws
        return sorted(
            range(len(raws)),
            key=lambda row_index: (abs(raws[row_index] - goal), row_index),
        )

    def _solve_affine(
        self, row_index: int, fid: str, target_id: str, goal: float
    ) -> tuple[float, float] | None:
        """Solve for the value that puts the raw margin on ``goal``.

        Between tree branches the raw margin is affine in one continuous
        feature with slope ``0.5·coefficient/scale``; a two-point check proves
        the bracketed interval is branch stable, then the crossing is solved in
        closed form and verified against the true margin.
        """
        feature = self.feature_by_id[fid]
        low, high = float(feature["range"]["min"]), float(feature["range"]["max"])
        position = self.feature_index[fid]
        block = self.oracle._linear[target_id]
        slope = 0.5 * float(block["coefficientByFeature"][position]) / float(
            block["scaleByFeature"][position]
        )
        if slope == 0.0 or not math.isfinite(slope):
            return None
        grid = np.linspace(low, high, SEARCH_GRID)
        raws = [
            self._raw_for(row_index, fid, float(value), target_id) for value in grid
        ]
        best: tuple[float, float] | None = None
        for index in range(len(grid) - 1):
            a, b = float(grid[index]), float(grid[index + 1])
            ra, rb = raws[index], raws[index + 1]
            if (ra - goal) * (rb - goal) > 0 or ra == rb:
                continue
            if abs((rb - ra) - slope * (b - a)) > 1e-9:
                continue
            crossing = a + (goal - ra) / slope
            if not a <= crossing <= b:
                continue
            distance = abs(self._raw_for(row_index, fid, crossing, target_id) - goal)
            if best is None or distance < best[1]:
                best = (float(crossing), distance)
            if distance <= 1e-9:
                break
        return best

    def _raw_for(self, row_index: int, fid: str, value: float, target_id: str) -> float:
        values = self._row_values(row_index)
        values[fid] = float(value)
        vector, mask = self.oracle.encode(values)
        return self.oracle.raw_margin(target_id, vector, mask)

    def _decision_specs(self) -> list[dict[str, Any]]:
        """Threshold boundary plus both abstention-band edges, for CAD.

        Edge fixtures sit ``EDGE_STEP`` (1e-3) inside and outside each edge —
        far beyond the 1e-5 parity tolerance, so a consumer's floating-point
        noise cannot flip the stored decision.  Edge *inclusivity* itself is
        pinned by ``decide_state``'s ``nextafter`` unit tests in
        ``tests/test_oracle.py``.
        """
        target_id = "CAD"
        parameters = self.oracle._decisions[target_id]
        threshold_margin = float(parameters["thresholdMargin"])
        half_width = float(parameters["halfWidthMargin"])
        upper = threshold_margin + half_width
        lower = threshold_margin - half_width
        specs = [
            self._boundary_spec(
                ["threshold-boundary", "boundary"],
                target_id,
                threshold_margin,
                "threshold boundary",
                "indeterminate",
            ),
            self._boundary_spec(
                ["abstention-edge", "boundary"],
                target_id,
                upper + EDGE_STEP,
                "abstention upper edge (outside)",
                "above",
            ),
            self._boundary_spec(
                ["abstention-edge", "boundary"],
                target_id,
                upper - EDGE_STEP,
                "abstention upper edge (inside)",
                "indeterminate",
            ),
            self._boundary_spec(
                ["abstention-edge", "boundary"],
                target_id,
                lower - EDGE_STEP,
                "abstention lower edge (outside)",
                "below",
            ),
            self._boundary_spec(
                ["abstention-edge", "boundary"],
                target_id,
                lower + EDGE_STEP,
                "abstention lower edge (inside)",
                "indeterminate",
            ),
        ]
        return specs

    def _failure_specs(self) -> list[dict[str, Any]]:
        nan_values = self._row_values(self._level_row(0))
        nan_values["Age"] = "NaN"
        infinite_values = self._row_values(self._level_row(1))
        infinite_values["BMI"] = "Infinity"
        return [
            self._spec(
                ["finite-output-failure"], nan_values, self._all_provided()
            ),
            self._spec(
                ["finite-output-failure"],
                infinite_values,
                self._all_provided(),
            ),
        ]

    # ---------------------------------------------------------- evaluation

    def _evaluate_spec(self, index: int, spec: dict[str, Any]) -> dict[str, Any]:
        tags = list(spec["coverageTags"])
        entry: dict[str, Any] = {
            "id": f"fixture-{index:03d}",
            "coverageTags": tags,
            "input": spec["input"],
        }
        values = spec["input"]["values"]
        provided = spec["input"]["providedFeatures"]
        expect_failure = "finite-output-failure" in tags
        try:
            evaluation = self.oracle.evaluate_case(values, provided)
        except (EncodingError, ForbiddenInputError, OracleError) as exc:
            if not expect_failure:
                raise FixtureError(
                    f"{entry['id']} ({tags}) failed unexpectedly: {type(exc).__name__}"
                ) from exc
            entry["expected"] = {
                "failure": {
                    "code": c07_error_code(exc),
                    "featureId": getattr(exc, "feature_id", None)
                    or getattr(exc, "column_id", None),
                }
            }
            return entry
        if expect_failure:
            raise FixtureError(f"{entry['id']} was tagged as a failure but evaluated")
        expected_decision = spec.pop("_checkDecision", None)
        if expected_decision is not None:
            observed_decision = evaluation["targets"]["CAD"]["decision"]
            if observed_decision != expected_decision:
                raise FixtureError(
                    f"{entry['id']} expected CAD decision {expected_decision!r}, "
                    f"got {observed_decision!r}"
                )
        entry["expected"] = {
            "targets": evaluation["targets"],
            "headlineCad": evaluation["headlineCad"],
            "rangeFlags": evaluation["rangeFlags"],
            "explanations": {
                target_id: self.oracle.explain_case(values, provided, target_id)
                for target_id in CONTRACT_TARGETS
            },
        }
        return entry

    # ---------------------------------------------------------- self-checks

    def _assert_coverage(self, entries: list[dict[str, Any]]) -> None:
        tags = {tag for entry in entries for tag in entry["coverageTags"]}
        missing = [tag for tag in REQUIRED_TAGS if tag not in tags]
        if missing:
            raise FixtureError(f"coverage tags missing: {missing}")

        normal = [entry for entry in entries if "failure" not in entry["expected"]]
        if not normal:
            raise FixtureError("no normal fixtures were produced")
        for entry in normal:
            explained = sorted(entry["expected"]["explanations"])
            if explained != sorted(CONTRACT_TARGETS):
                raise FixtureError(f"{entry['id']} does not explain every selectable target")

        failures = [entry for entry in entries if "failure" in entry["expected"]]
        if not failures:
            raise FixtureError("no finite-output-failure fixture")
        for entry in failures:
            code = entry["expected"]["failure"]["code"]
            if code != "NONFINITE_INPUT":
                raise FixtureError(
                    f"{entry['id']} expected code NONFINITE_INPUT, got {code}"
                )

        worst_residual = 0.0
        worst_gap = 0.0
        for entry in normal:
            for target_id, explanation in entry["expected"]["explanations"].items():
                residual = abs(explanation["efficiencyResidual"])
                worst_residual = max(worst_residual, residual)
                if residual > TOLERANCE["efficiency"]:
                    raise FixtureError(
                        f"{entry['id']}/{target_id} residual {residual:.3e} exceeds tolerance"
                    )
                feature_sum = sum(
                    item["contribution"] for item in explanation["featureAttributions"]
                )
                group_sum = sum(item["contribution"] for item in explanation["displayGroups"])
                modality_sum = sum(
                    item["contribution"] for item in explanation["modalityContributions"]
                )
                worst_gap = max(
                    worst_gap,
                    abs(feature_sum - group_sum),
                    abs(feature_sum - modality_sum),
                )
                if abs(feature_sum - group_sum) > AGGREGATION_TOLERANCE:
                    raise FixtureError(f"{entry['id']}/{target_id} groups do not reconcile")
                if abs(feature_sum - modality_sum) > AGGREGATION_TOLERANCE:
                    raise FixtureError(f"{entry['id']}/{target_id} modalities do not reconcile")
                attributed = {item["featureId"] for item in explanation["featureAttributions"]}
                unprovided = {
                    fid
                    for fid, keep in entry["input"]["providedFeatures"].items()
                    if not keep
                }
                if attributed & unprovided:
                    raise FixtureError(
                        f"{entry['id']}/{target_id} attributes an unprovided feature"
                    )
        print(
            f"[fixtures] max|efficiency residual| = {worst_residual:.3e}, "
            f"max aggregation gap = {worst_gap:.3e}"
        )
        for line in self._boundary_report:
            print(f"[fixtures] {line}")

    def _assert_specifics(self, entries: list[dict[str, Any]]) -> None:
        by_tag: dict[str, list[dict[str, Any]]] = {}
        for entry in entries:
            for tag in entry["coverageTags"]:
                by_tag.setdefault(tag, []).append(entry)

        for entry in by_tag.get("blank", []):
            explanation = entry["expected"]["explanations"]["CAD"]
            if explanation["featureAttributions"] or explanation["displayGroups"]:
                raise FixtureError(f"{entry['id']} observed something while blank")
        for entry in by_tag.get("out-of-range", []):
            if not any(entry["expected"]["rangeFlags"].values()):
                raise FixtureError(f"{entry['id']} has no out-of-range flag")
        for entry in by_tag.get("vessel-above-CAD", []):
            if entry["expected"]["headlineCad"]["valueSourceTargetId"] == "CAD":
                raise FixtureError(f"{entry['id']} does not put a vessel above CAD")
        for entry in by_tag.get("threshold-boundary", []):
            if entry["expected"]["targets"]["CAD"]["decision"] != "indeterminate":
                raise FixtureError(f"{entry['id']} is not on the abstention threshold")
        for entry in by_tag.get("float-rounding", []):
            changed = any(
                float(np.float32(value)) != float(value)
                for value in entry["input"]["values"].values()
                if isinstance(value, (int, float)) and not isinstance(value, bool)
            )
            if not changed:
                raise FixtureError(f"{entry['id']} does not cross a float32 boundary")
        for entry in by_tag.get("split-threshold", []):
            if not self._lands_on_threshold(entry):
                raise FixtureError(f"{entry['id']} does not sit on a split threshold")
        for entry in by_tag.get("modality-masked", []) + by_tag.get(
            "cumulative-stage", []
        ) + by_tag.get("multi-modality", []):
            if not entry["expected"]["explanations"]["CAD"]["featureAttributions"]:
                raise FixtureError(f"{entry['id']} observed nothing")

    def _lands_on_threshold(self, entry: dict[str, Any]) -> bool:
        positions = {
            fid: self.feature_index[fid]
            for fid, feature in self.feature_by_id.items()
            if feature["type"] == "continuous"
        }
        trees = self.model["components"]["CAD"]["trees"]["trees"]
        for fid, value in entry["input"]["values"].items():
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            if fid not in positions or float(np.float32(value)) != float(value):
                continue
            for tree_entry in trees:
                for node in tree_entry["nodes"]:
                    feature_index = node.get("featureIndex")
                    if feature_index is None or int(feature_index) != positions[fid]:
                        continue
                    threshold = float(np.float32(float(node["threshold"])))
                    if threshold == float(np.float32(value)):
                        return True
        return False

    # ------------------------------------------------------------ document

    def build(self) -> dict[str, Any]:
        started = time.perf_counter()
        specs: list[dict[str, Any]] = []
        specs.extend(self._level_specs())
        specs.append(self._blank_spec())
        specs.extend(self._mask_specs())
        specs.extend(self._stage_specs())
        specs.extend(self._combo_specs())
        specs.extend(self._split_threshold_specs())
        specs.append(self._float_rounding_spec())
        specs.extend(self._decision_specs())
        specs.extend(self._out_of_range_specs())
        vessel = self._vessel_spec()
        if vessel is not None:
            specs.append(vessel)
        specs.extend(self._failure_specs())

        entries = [
            self._evaluate_spec(position + 1, spec)
            for position, spec in enumerate(specs)
        ]
        self._assert_coverage(entries)
        self._assert_specifics(entries)

        document = {
            "schemaVersion": SCHEMA_VERSION,
            "provenance": {
                "oracleRevision": ORACLE_REVISION,
                "modelId": self.model["metadata"]["modelId"],
                "registryVersion": self.registry["schemaVersion"],
                "dataSha256": self.model["provenance"]["dataSha256"],
                "generationSeed": GENERATION_SEED,
                "schemaVersion": SCHEMA_VERSION,
            },
            "tolerance": dict(TOLERANCE),
            "fixtures": entries,
        }
        tag_counts: dict[str, int] = {}
        for entry in entries:
            for tag in entry["coverageTags"]:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        print(
            f"[fixtures] {len(entries)} fixtures from {len(specs)} specs in "
            f"{time.perf_counter() - started:.1f}s"
        )
        print(f"[fixtures] tag counts: {json.dumps(tag_counts, sort_keys=True)}")
        return document


def generate() -> dict[str, Any]:
    return FixtureGenerator().build()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate tests/fixtures/golden.json")
    parser.add_argument("--out", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args(argv)
    document = generate()
    payload = _canonical(document)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    print(f"[fixtures] wrote {args.out} ({len(payload)} bytes, sha256={digest})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
