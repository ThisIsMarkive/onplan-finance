"""Synthetic audit of PyPortfolioOpt 1.6.0; not an investment backtest.

Run with Python 3.12 and requirements-lock.txt. The reference LP uses SciPy/HiGHS,
not PyPortfolioOpt/CVXPY. Empirical CVaR also uses a separate sorted-tail formula.
All inputs are artificial equal-probability single-period return scenarios.
"""
from __future__ import annotations

import hashlib
import importlib.metadata as metadata
import inspect
import json
import math
import platform
import subprocess
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

import cvxpy as cp
import numpy as np
import pandas as pd
from pypfopt import EfficientCVaR
from pypfopt.exceptions import OptimizationError
from scipy.optimize import linprog

ROOT = Path(__file__).resolve().parent
TOL = 1e-7
BETA = 0.8
BOUNDS = [(0.05, 0.75)] * 3
# C's low training variability does not make it a risk-free asset.
TRAIN = np.array([
    [-0.12, 0.04, 0.001], [0.04, -0.06, 0.001],
    [-0.03, -0.02, 0.001], [0.09, 0.04, 0.001],
    [0.05, 0.03, 0.001], [0.04, 0.01, 0.001],
    [0.02, 0.03, 0.001],
], dtype=float)
# A deliberately adverse, predeclared change in distribution, not market data.
SHIFTED = np.array([
    [0.01, 0.008, -0.12], [0.005, 0.004, -0.08],
    [0.02, 0.01, -0.06], [-0.01, -0.005, 0.003],
    [0.015, 0.007, 0.001], [0.005, 0.002, 0.002],
    [0.012, 0.009, 0.001],
], dtype=float)
MU = TRAIN.mean(axis=0)  # Same period as the scenarios; never annualized here.
TARGET = 0.0065


def empirical_cvar(losses, beta):
    """Expected loss in exactly (1-beta) probability mass of empirical upper tail.

    Equal sample weights. A fractional final order statistic is essential when
    N*(1-beta) is noninteger. Handles ties and a tail mass below one observation.
    """
    losses = np.asarray(losses, dtype=float)
    if losses.ndim != 1 or not len(losses) or not np.isfinite(losses).all():
        raise ValueError("Finite nonempty vector of losses required")
    if not 0 <= beta < 1:
        raise ValueError("0 <= beta < 1 required")
    tail_mass = len(losses) * (1 - beta)
    whole = int(math.floor(tail_mass))
    frac = tail_mass - whole
    ordered = np.sort(losses)[::-1]
    total = float(ordered[:whole].sum())
    if whole < len(losses):
        total += frac * float(ordered[whole])
    return total / tail_mass


def independent_lp(returns, beta, bounds, mu=None, target=None):
    """Variables: [weights, unrestricted alpha, nonnegative tail slacks]."""
    returns = np.asarray(returns, dtype=float)
    n, m = returns.shape
    objective = np.r_[np.zeros(m), 1.0, np.full(n, 1.0 / (n * (1-beta)))]
    # -R*w - alpha - u <= 0, equivalent to u >= loss-alpha.
    aub = np.c_[-returns, -np.ones(n), -np.eye(n)]
    bub = np.zeros(n)
    if target is not None:
        aub = np.vstack([aub, np.r_[-np.asarray(mu), np.zeros(n+1)]])
        bub = np.r_[bub, -target]
    aeq = np.zeros((1, m+n+1))
    aeq[0, :m] = 1
    return linprog(objective, A_ub=aub, b_ub=bub, A_eq=aeq, b_eq=[1.0],
                   bounds=list(bounds) + [(None, None)] + [(0, None)] * n,
                   method="highs")


def library_solver(returns=TRAIN, mu=MU, beta=BETA, bounds=BOUNDS, target=None):
    labels = [f"asset_{i}" for i in range(returns.shape[1])]
    model = EfficientCVaR(pd.Series(mu, index=labels),
                          pd.DataFrame(returns, columns=labels), beta=beta,
                          weight_bounds=bounds, solver="CLARABEL",
                          solver_options={"tol_gap_abs": 1e-10,
                                          "tol_gap_rel": 1e-10,
                                          "tol_feas": 1e-10})
    if target is None:
        model.min_cvar()
    else:
        model.efficient_return(float(target))
    return model


def assert_close(a, b, tolerance=TOL):
    if abs(float(a)-float(b)) > tolerance:
        raise AssertionError(f"{a} != {b} within absolute tolerance {tolerance}")


def check_weights(weights, bounds=BOUNDS, mu=MU, target=None):
    assert_close(np.sum(weights), 1)
    for w, (lower, upper) in zip(weights, bounds):
        assert lower-TOL <= w <= upper+TOL, (w, lower, upper)
    if target is not None:
        assert float(mu @ weights) >= target-TOL


def fractional_tail_fixture():
    losses = np.array([-0.04, -0.01, 0.0, 0.01, 0.02, 0.04, 0.10])
    exact = (0.10 + 0.4*0.04)/1.4  # Independently hand-calculable fixture.
    result = empirical_cvar(losses, 0.8)
    model = library_solver((-losses).reshape(-1, 1), np.array([-losses.mean()]),
                           0.8, [(1.0, 1.0)])
    observed = model.portfolio_performance()[1]
    reference = independent_lp((-losses).reshape(-1, 1), 0.8, [(1.0, 1.0)])
    assert reference.success
    for value in [result, observed, reference.fun]:
        assert_close(value, exact)
    naive = float(losses[losses >= np.quantile(losses, 0.8)].mean())
    assert abs(naive-exact) > 0.01
    edges = []
    for label, edge_losses, edge_beta, edge_expected in [
        ("integer mass", losses, 5/7, 0.07),
        ("mass below one", losses, 0.95, 0.10),
        ("ties", np.array([0.10, 0.10, 0.04, 0, -0.01]), 0.7, 0.10),
    ]:
        edge_returns = (-edge_losses).reshape(-1, 1)
        edge_model = library_solver(edge_returns, np.array([-edge_losses.mean()]),
                                    edge_beta, [(1.0, 1.0)])
        edge_lp = independent_lp(edge_returns, edge_beta, [(1.0, 1.0)])
        assert edge_lp.success
        edge_tail = empirical_cvar(edge_losses, edge_beta)
        edge_library = edge_model.portfolio_performance()[1]
        for value in [edge_tail, edge_library, edge_lp.fun]:
            assert_close(value, edge_expected)
        edges.append({"name": label, "expected": edge_expected,
                      "independent_tail": edge_tail, "library_cvar": edge_library,
                      "scipy_lp_cvar": edge_lp.fun})
    return {"tail_mass": 1.4, "hand_expected": exact,
            "sorted_fractional_tail": result, "library_cvar": observed,
            "scipy_lp_cvar": reference.fun, "naive_quantile_tail_mean": naive,
            "additional_edges": edges}


def compare_lp(target=None):
    model = library_solver(target=target)
    reference = independent_lp(TRAIN, BETA, BOUNDS, MU, target)
    assert reference.success, reference.message
    check_weights(model.weights, target=target)
    check_weights(reference.x[:3], target=target)
    observed_mu, observed_cvar = model.portfolio_performance()
    tail = empirical_cvar(-TRAIN @ model.weights, BETA)
    assert_close(observed_cvar, reference.fun)
    assert_close(tail, reference.fun)
    assert_close(observed_mu, MU @ model.weights)
    baseline = np.full(3, 1/3)
    check_weights(baseline, target=target)
    baseline_cvar = empirical_cvar(-TRAIN @ baseline, BETA)
    assert tail <= baseline_cvar + TOL
    return {"target_return_per_period": target,
            "weights_library": model.weights.tolist(),
            "weights_reference": reference.x[:3].tolist(),
            "cvar_library": observed_cvar, "cvar_reference": reference.fun,
            "cvar_independent_tail": tail,
            "absolute_lp_objective_difference": abs(observed_cvar-reference.fun),
            "expected_return_per_period": observed_mu,
            "equalweight_cvar_same_scenarios": baseline_cvar,
            "equalweight_mean_same_scenarios": float(MU @ baseline),
            "reference_status": reference.message}


def infeasible(target=None, bounds=BOUNDS):
    reference = independent_lp(TRAIN, BETA, bounds, MU, target)
    assert reference.status == 2, reference.message
    try:
        library_solver(bounds=bounds, target=target)
    except OptimizationError as exc:
        return {"target_return": target, "bounds": bounds,
                "reference_status": reference.message,
                "library_exception": type(exc).__name__, "library_message": str(exc)}
    raise AssertionError("Library failed to reject infeasible problem")


def changed_distribution():
    # Reuse the policy selected on TRAIN; never refit it on SHIFTED.
    weights = library_solver(target=TARGET).weights
    equal = np.full(3, 1/3)
    train_opt = empirical_cvar(-TRAIN @ weights, BETA)
    train_eq = empirical_cvar(-TRAIN @ equal, BETA)
    shifted_opt = empirical_cvar(-SHIFTED @ weights, BETA)
    shifted_eq = empirical_cvar(-SHIFTED @ equal, BETA)
    assert train_opt <= train_eq + TOL
    assert shifted_opt > shifted_eq + 0.001
    return {"frozen_training_weights": weights.tolist(),
            "train_cvar_optimized": train_opt, "train_cvar_equalweight": train_eq,
            "shifted_cvar_optimized": shifted_opt, "shifted_cvar_equalweight": shifted_eq,
            "interpretation": "Predeclared synthetic distribution-shift counterexample. "
                              "Not a historical or forward performance estimate; "
                              "sample optimization does not guarantee future dominance."}


def capture_environment():
    distributions = sorted(metadata.distributions(), key=lambda d: d.metadata["Name"].lower())
    packages = {d.metadata["Name"]: d.version for d in distributions}
    details = [{"name": d.metadata["Name"], "version": d.version,
                "license_expression": d.metadata.get("License-Expression"),
                "license_classifiers": [s for s in d.metadata.get_all("Classifier", [])
                                        if s.startswith("License ::")]} for d in distributions]
    freeze = subprocess.check_output([sys.executable, "-m", "pip", "freeze", "--all"],
                                     text=True, encoding="utf-8")
    (ROOT / "requirements-lock.txt").write_text(freeze, encoding="utf-8")
    (ROOT / "dependency-license-metadata.json").write_text(
        json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")
    source = Path(inspect.getfile(EfficientCVaR))
    return {"python": sys.version,
            "platform": platform.platform(), "machine": platform.machine(),
            "packages": packages, "installed_solvers": cp.installed_solvers(),
            "tested_solver": "CLARABEL", "reference_solver": "SciPy linprog / HiGHS",
            "library_cvar_source_file": str(source),
            "library_cvar_source_sha256": hashlib.sha256(source.read_bytes()).hexdigest()}


def main():
    result = {"schema_version": 1, "run_utc": datetime.now(timezone.utc).isoformat(),
              "audit_type": "synthetic mathematical fixtures; no customer or market data",
              "environment": capture_environment(),
              "source_commit": "0186e707a0d2ec03406608d3400539d0f140c625",
              "required_version": "1.6.0", "absolute_tolerance": TOL,
              "scenario_period": "one unspecified period; no annualization",
              "inputs": {"train": TRAIN.tolist(), "shifted": SHIFTED.tolist(),
                         "expected_returns": MU.tolist(), "beta": BETA,
                         "bounds": BOUNDS, "target": TARGET}, "checks": []}
    assert metadata.version("pyportfolioopt") == "1.6.0"
    cases = [
        ("fractional_empirical_CVaR_and_edge_cases", fractional_tail_fixture),
        ("bounded_min_CVaR_vs_independent_LP", lambda: compare_lp()),
        ("target_return_CVaR_vs_independent_LP", lambda: compare_lp(TARGET)),
        ("infeasible_return_under_bounds", lambda: infeasible(0.012)),
        ("infeasible_budget_and_bounds", lambda: infeasible(bounds=[(0, 0.2)]*3)),
        ("frozen_policy_distribution_shift_counterexample", changed_distribution),
    ]
    for name, function in cases:
        try:
            result["checks"].append({"name": name, "status": "pass", "details": function()})
        except Exception as exc:
            result["checks"].append({"name": name, "status": "fail", "error": repr(exc),
                                      "traceback": traceback.format_exc()})
    result["passed"] = sum(c["status"] == "pass" for c in result["checks"])
    result["failed"] = sum(c["status"] == "fail" for c in result["checks"])
    (ROOT / "portfolio-validation-results.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"passed": result["passed"], "failed": result["failed"],
                      "results": "portfolio-validation-results.json"}, indent=2))
    return int(result["failed"] != 0)


if __name__ == "__main__":
    raise SystemExit(main())
