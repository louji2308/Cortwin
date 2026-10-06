"""Exact interventional attribution (``pipeline.shap_exact``) — C-06 / Architecture §8.3.

Oracle hierarchy (Architecture §14.1): the Python exact attribution code is held
against **shap 0.52 as an independent reference** on the same frozen 60-row
background:

* ``shap.TreeExplainer(..., feature_perturbation="interventional",
  model_output="raw")`` — interventional mode, raw margin space;
* ``shap.LinearExplainer`` — closed-form linear attribution.

Passing tolerance for the reference comparison is ``1e-6`` (stricter than the
C-06 ``1e-5`` fixture tolerance; C-06 tolerances are never loosened here).

**Mode differences, documented precisely (never conflated):**

* **Interventional** (what ``pipeline.shap_exact`` implements): the value of a
  coalition ``S`` is ``mean over background rows b of f(x_S, b_¬S)`` — features
  outside ``S`` keep the *joint* background row they came from. This is the
  exact game of Architecture §8.2/§8.3 and the mode validated here.
* **Path-dependent** (``feature_perturbation="tree_path_dependent"``, shap's
  historical default): the value of a coalition is derived from the tree's
  training path cover counts, i.e. the empirical split distribution learned
  during fitting rather than the shipped background. It answers a *different*
  question and disagrees with this codebase by ~1e-1 on real cases — asserted
  below so the mode choice can never drift silently.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import joblib
import numpy as np
import pytest
import shap

from pipeline.shap_exact import (
    MAX_SPLIT_FEATURES,
    DecisionTree,
    ShapExactError,
    exact_tree_shapley,
    linear_attributions,
)

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_TOLERANCE = 1e-6
CASE_INDICES = (0, 7, 19, 33, 47, 59)

pytestmark = pytest.mark.blocking


@pytest.fixture(scope="module")
def model_doc() -> dict:
    path = ROOT / "model.json"
    if not path.is_file():
        pytest.fail("model.json missing — run `python -m pipeline.export_model` first")
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def background(model_doc: dict) -> np.ndarray:
    rows = np.asarray(model_doc["background"]["rows"], dtype=np.float64)
    assert rows.shape == (60, 54)
    return rows


@pytest.fixture(scope="module")
def deployed() -> dict:
    return joblib.load(ROOT / "pipeline" / "artifacts" / "deployed_model.joblib")


def _trees(model_doc: dict, target_id: str) -> list[DecisionTree]:
    block = model_doc["components"][target_id]["trees"]
    return [DecisionTree(tree["nodes"]) for tree in block["trees"]]


def _shapley_from_subsets(subsets: dict[frozenset[int], float], players: list[int]) -> dict[int, float]:
    """Reference Shapley values computed the slow, obviously-correct way."""
    result: dict[int, float] = {}
    n = len(players)
    for player in players:
        others = [p for p in players if p != player]
        total = 0.0
        for mask in range(1 << len(others)):
            coalition = frozenset(
                [player] + [others[i] for i in range(len(others)) if mask & (1 << i)]
            )
            without = frozenset(coalition - {player})
            size = len(coalition) - 1
            weight = (
                math.factorial(size)
                * math.factorial(n - size - 1)
                / math.factorial(n)
            )
            total += weight * (subsets[coalition] - subsets[without])
        result[player] = float(total)
    return result


def test_every_exported_tree_respects_the_exact_attribution_bound(model_doc: dict) -> None:
    counts = set()
    for target_id in model_doc["targets"]:
        block = model_doc["components"][target_id]["trees"]
        assert block["treeCount"] == len(block["trees"]) == 200
        assert block["maxDistinctFeaturesPerTree"] <= MAX_SPLIT_FEATURES
        for tree in block["trees"]:
            parsed = DecisionTree(tree["nodes"])
            assert len(parsed.split_features) <= MAX_SPLIT_FEATURES
            counts.add(len(parsed.split_features))
    assert counts, "no trees parsed"
    assert max(counts) == MAX_SPLIT_FEATURES, (
        "the exported family is expected to use the full bound somewhere; "
        f"observed distinct-split-feature counts {sorted(counts)}"
    )


@pytest.mark.parametrize(
    ("nodes", "fragment"),
    [
        ([], "no nodes"),
        (
            [
                {"featureIndex": 0, "threshold": 1.0, "left": 1, "right": 1, "leaf": None},
                {"featureIndex": None, "threshold": None, "left": None, "right": None, "leaf": None},
            ],
            "no valid featureIndex",
        ),
        (
            [
                {"featureIndex": 0, "threshold": 1.0, "left": 1, "right": 1, "leaf": None},
                {"featureIndex": 1, "threshold": 0.0, "left": -3, "right": 2, "leaf": None},
                {"featureIndex": 2, "threshold": 0.0, "left": 3, "right": 3, "leaf": None},
                {"featureIndex": None, "threshold": None, "left": None, "right": None, "leaf": 1.0},
            ],
            "outside",
        ),
        (
            [
                {"featureIndex": None, "threshold": None, "left": None, "right": None, "leaf": float("nan")},
            ],
            "not finite",
        ),
        (
            [
                {"featureIndex": 0, "threshold": 1.0, "left": 1, "right": 1, "leaf": None},
                {"featureIndex": 0, "threshold": 1.0, "left": 1, "right": 1, "leaf": None},
            ],
            "references itself",
        ),
        (
            [
                {"featureIndex": 0, "threshold": 1.0, "left": 1, "right": 1, "leaf": 0.5},
            ],
            "mixes leaf and split",
        ),
    ],
)
def test_malformed_trees_raise_a_typed_error(nodes: list[dict], fragment: str) -> None:
    with pytest.raises(ShapExactError) as excinfo:
        DecisionTree(nodes)
    assert fragment in str(excinfo.value)


def test_a_cyclic_node_graph_is_rejected_instead_of_hanging() -> None:
    nodes = [
        {"featureIndex": 0, "threshold": 1.0, "left": 1, "right": 1, "leaf": None},
        {"featureIndex": 1, "threshold": 0.0, "left": 0, "right": 0, "leaf": None},
    ]
    with pytest.raises(ShapExactError, match="cycle"):
        DecisionTree(nodes)


def test_tree_exceeding_the_attribution_bound_is_rejected() -> None:
    nodes: list[dict] = []
    for feature in range(MAX_SPLIT_FEATURES + 1):
        nodes.append(
            {"featureIndex": feature, "threshold": 0.0, "left": len(nodes) + 1,
             "right": len(nodes) + 2, "leaf": None}
        )
        nodes.append(
            {"featureIndex": None, "threshold": None, "left": None, "right": None,
             "leaf": float(feature)}
        )
        nodes.append(
            {"featureIndex": None, "threshold": None, "left": None, "right": None,
             "leaf": float(-feature)}
        )
    with pytest.raises(ShapExactError, match="exact-attribution"):
        DecisionTree(nodes)


def test_walk_rejects_non_finite_rows() -> None:
    tree = DecisionTree(
        [{"featureIndex": 0, "threshold": 0.0, "left": 1, "right": 1, "leaf": None},
         {"featureIndex": None, "threshold": None, "left": None, "right": None, "leaf": 1.0}]
    )
    rows = np.zeros((2, 4))
    rows[1, 2] = np.inf
    with pytest.raises(ShapExactError, match="non-finite"):
        tree.leaves(rows)


def _synthetic_tree() -> DecisionTree:
    """Depth-2 tree splitting on features 0 and 2 of a 4-feature world."""
    return DecisionTree(
        [
            {"featureIndex": 0, "threshold": 0.5, "left": 1, "right": 4, "leaf": None},
            {"featureIndex": 2, "threshold": 1.5, "left": 2, "right": 3, "leaf": None},
            {"featureIndex": None, "threshold": None, "left": None, "right": None, "leaf": -0.75},
            {"featureIndex": None, "threshold": None, "left": None, "right": None, "leaf": 0.5},
            {"featureIndex": None, "threshold": None, "left": None, "right": None, "leaf": 1.25},
        ]
    )


def test_reduced_game_equals_the_full_4_player_game() -> None:
    """A non-split player has zero marginal contribution in every coalition.

    Enumerate the *full* game over all 4 features (2^4 subsets) the obvious way
    and compare its Shapley values with this module's reduced-game result.
    """
    tree = _synthetic_tree()
    background = np.array(
        [[0.0, 9.0, 0.0, 1.0],
         [1.0, 8.0, 1.0, 2.0],
         [2.0, 7.0, 2.0, 3.0],
         [3.0, 6.0, 3.0, 4.0],
         [4.0, 5.0, 4.0, 5.0],
         [5.0, 4.0, 5.0, 6.0]],
        dtype=np.float64,
    )
    case = np.array([0.6, 123.0, 1.4, -7.0], dtype=np.float64)
    observed = np.ones(4, dtype=bool)

    full: dict[frozenset[int], float] = {}
    for mask in range(1 << 4):
        buffer = background.copy()
        for index in range(4):
            if mask & (1 << index):
                buffer[:, index] = case[index]
        full[frozenset(i for i in range(4) if mask & (1 << i))] = float(
            np.mean(tree.leaves(buffer))
        )

    reference = _shapley_from_subsets(full, [0, 1, 2, 3])
    ours = tree.shapley_values(background, case, observed)
    for index in range(4):
        assert ours[index] == pytest.approx(reference[index], abs=1e-12), index
    assert ours[1] == 0.0 and ours[3] == 0.0

    residual = float(np.sum(ours) + full[frozenset()] - full[frozenset(range(4))])
    assert abs(residual) <= 1e-12


def test_observed_mask_controls_the_player_set(background: np.ndarray, model_doc: dict) -> None:
    trees = _trees(model_doc, "CAD")
    case = background[3].copy()
    observed = np.zeros(case.shape[0], dtype=bool)
    observed[[0, 4, 24, 53]] = True
    phi = exact_tree_shapley(trees, background, case, observed)
    split_features = {index for tree in trees for index in tree.split_features}
    allowed = split_features & set(np.flatnonzero(observed))
    for index in range(phi.shape[0]):
        if index not in allowed:
            assert phi[index] == 0.0, f"unobserved/non-split feature {index} credited"

    observed_all = np.ones(case.shape[0], dtype=bool)
    phi_all = exact_tree_shapley(trees, background, case, observed_all)
    assert not np.allclose(phi, phi_all), "mask had no effect on attribution"


def test_attribution_is_deterministic(model_doc: dict, background: np.ndarray) -> None:
    trees = _trees(model_doc, "LCX")
    case = background[11].copy()
    observed = np.ones(case.shape[0], dtype=bool)
    first = exact_tree_shapley(trees, background, case, observed)
    second = exact_tree_shapley(trees, background, case, observed)
    assert first.tobytes() == second.tobytes()


def test_linear_attributions_match_the_closed_form(background: np.ndarray, model_doc: dict) -> None:
    linear = model_doc["components"]["RCA"]["linear"]
    case = background[5].copy()
    observed = np.zeros(case.shape[0], dtype=bool)
    observed[:6] = True
    phi = linear_attributions(linear, case, observed, background.mean(axis=0))
    coefficients = np.asarray(linear["coefficientByFeature"], dtype=np.float64)
    scales = np.asarray(linear["scaleByFeature"], dtype=np.float64)
    means = background.mean(axis=0)
    expected = coefficients * (case - means) / scales
    for index in range(phi.shape[0]):
        want = float(expected[index]) if observed[index] else 0.0
        assert phi[index] == pytest.approx(want, abs=1e-15)
    with pytest.raises(ShapExactError, match="width"):
        linear_attributions(linear, case[:-1], observed[:-1], means)


def test_reference_interventional_treeshap_within_1e_6(
    model_doc: dict, background: np.ndarray, deployed: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    """C-06/§14.1: exact attribution == shap 0.52 interventional reference."""
    worst = 0.0
    worst_where = ""
    for target_id in model_doc["targets"]:
        trees = _trees(model_doc, target_id)
        booster = deployed["targets"][target_id]["xgb"].get_booster()
        explainer = shap.TreeExplainer(
            booster,
            data=background,
            feature_perturbation="interventional",
            model_output="raw",
        )
        rows = background[list(CASE_INDICES)]
        reference = np.asarray(explainer.shap_values(rows), dtype=np.float64).reshape(
            len(CASE_INDICES), -1
        )
        target_worst = 0.0
        for position, case_index in enumerate(CASE_INDICES):
            case = background[case_index].copy()
            ours = exact_tree_shapley(trees, background, case, np.ones(54, dtype=bool))
            diff = float(np.max(np.abs(ours - reference[position])))
            target_worst = max(target_worst, diff)
            if diff > worst:
                worst, worst_where = diff, f"{target_id} row {case_index}"
        with capsys.disabled():
            print(
                f"[shap-reference] target {target_id}: interventional max|diff| "
                f"over {len(CASE_INDICES)} cases = {target_worst:.3e}"
            )
    with capsys.disabled():
        print(f"[shap-reference] OVERALL interventional max|diff| = {worst:.3e} ({worst_where})")
    assert worst <= REFERENCE_TOLERANCE, (
        f"interventional TreeExplainer differs by {worst:.3e} ({worst_where}) "
        f"> {REFERENCE_TOLERANCE:.0e}"
    )


def test_reference_linear_explainer_within_1e_6(
    model_doc: dict, background: np.ndarray, capsys: pytest.CaptureFixture[str]
) -> None:
    worst = 0.0
    bg_mean = background.mean(axis=0)
    for target_id in model_doc["targets"]:
        linear = model_doc["components"][target_id]["linear"]
        coefficients = np.asarray(linear["coefficientByFeature"], dtype=np.float64)
        scales = np.asarray(linear["scaleByFeature"], dtype=np.float64)
        intercept = float(linear["intercept"])
        means = np.asarray(linear["meanByFeature"], dtype=np.float64)
        effective = (
            coefficients / scales,
            np.asarray([intercept - float(np.sum(coefficients * means / scales))]),
        )
        explainer = shap.LinearExplainer(effective, background)
        rows = background[list(CASE_INDICES)]
        reference = np.asarray(explainer.shap_values(rows), dtype=np.float64).reshape(
            len(CASE_INDICES), -1
        )
        for position, case_index in enumerate(CASE_INDICES):
            case = background[case_index].copy()
            ours = linear_attributions(linear, case, np.ones(54, dtype=bool), bg_mean)
            worst = max(worst, float(np.max(np.abs(ours - reference[position]))))
    with capsys.disabled():
        print(f"[shap-reference] LinearExplainer max|diff| = {worst:.3e}")
    assert worst <= REFERENCE_TOLERANCE, f"linear reference differs by {worst:.3e}"


def test_path_dependent_mode_is_a_different_answer(
    model_doc: dict, background: np.ndarray, deployed: dict, capsys: pytest.CaptureFixture[str]
) -> None:
    """The interventional/path-dependent distinction is real, not cosmetic."""
    worst_interventional = 0.0
    worst_path_dependent = 0.0
    for target_id in model_doc["targets"]:
        trees = _trees(model_doc, target_id)
        booster = deployed["targets"][target_id]["xgb"].get_booster()
        case = background[7].copy()
        ours = exact_tree_shapley(trees, background, case, np.ones(54, dtype=bool))
        interventional = np.asarray(
            shap.TreeExplainer(
                booster, data=background, feature_perturbation="interventional",
                model_output="raw",
            ).shap_values(np.asarray([case])),
            dtype=np.float64,
        ).reshape(-1)
        path_dependent = np.asarray(
            shap.TreeExplainer(
                booster, feature_perturbation="tree_path_dependent", model_output="raw"
            ).shap_values(np.asarray([case])),
            dtype=np.float64,
        ).reshape(-1)
        worst_interventional = max(
            worst_interventional, float(np.max(np.abs(ours - interventional)))
        )
        worst_path_dependent = max(
            worst_path_dependent, float(np.max(np.abs(ours - path_dependent)))
        )
    with capsys.disabled():
        print(
            "[shap-reference] mode diff: interventional "
            f"{worst_interventional:.3e} vs path-dependent {worst_path_dependent:.3e}"
        )
    assert worst_interventional <= REFERENCE_TOLERANCE
    assert worst_path_dependent > 100 * REFERENCE_TOLERANCE, (
        "path-dependent results converged on the interventional ones — the mode "
        "distinction documented in the module docstring would be untestable"
    )
