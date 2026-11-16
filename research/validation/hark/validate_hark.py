"""Actual HARK 0.17.2 validation on synthetic, dimensionless two-period fixtures.

Run in the isolated environment with: python validate_hark.py
No customer, Korean calibration, recommendation, or real-world success probability.
Independent benchmark: closed-form deterministic optimum and scalar FOC root for
the exact discrete income distribution HARK receives (not its grid algorithm).
"""
from __future__ import annotations

import hashlib
import importlib.metadata as md
import inspect
import json
import math
import platform
from pathlib import Path
import sys
import time
import traceback

OUT = Path(__file__).resolve().parent
SOURCE_COMMIT = "269085077b84cb50feb49d0cd54bbf4da5fa3199"
EXPECTED_MODEL_GIT_BLOB = "1106643c9051d2c43ccd8ed3792d3af0bda28fd1"
THRESHOLDS = {
    "deterministic_max_abs_error": 1e-8,
    "constraint_tolerance": 1e-10,
    "fine_stochastic_max_abs_error": 0.002,
    "fine_stochastic_max_relative_euler_residual": 0.01,
}


def git_blob_hash(payload: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(payload)).encode() + b"\0" + payload).hexdigest()


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8")


def run() -> dict:
    import numpy as np
    from scipy.optimize import brentq
    import HARK
    from HARK.ConsumptionSaving.ConsIndShockModel import IndShockConsumerType

    result = {
        "scope": "Synthetic two-period normalized consumption-saving calculation only; no customer calibration.",
        "source": {
            "package": "econ-ark", "required_version": "0.17.2",
            "source_tag": "0.17.2", "source_commit": SOURCE_COMMIT,
            "url": f"https://github.com/econ-ark/HARK/tree/{SOURCE_COMMIT}",
            "license": "Apache-2.0",
        },
        "runtime": {"python": sys.version, "platform": platform.platform()},
        "versions": {p: md.version(p) for p in ["econ-ark", "numpy", "scipy", "numba", "llvmlite", "pandas", "sympy"]},
        "installation_adjustment": {
            "first_attempt": "econ-ark==0.17.2 installed; pip check passed, but import HARK failed because HARK/simulator.py imports undeclared sympy.",
            "evidence": "attempt-1-import-failure.json; release requirements/base.txt does not list sympy.",
            "repair": "Added public sympy package to this isolated venv; full final versions frozen in requirements-lock.txt. No HARK source edited.",
        },
        "acceptance_thresholds_set_before_execution": THRESHOLDS,
        "results": {}, "checks": {},
        "limitations": [
            "Two periods: one decision period plus consume-all terminal period, not a lifelong plan.",
            "One risk-free saving asset, no borrowing, no mortality, no bequests, no taxes or product fees.",
            "All magnitudes normalized by permanent income. A period is an abstract interval, not a specified month/year.",
            "Income uncertainty is a synthetic seven-point approximation, not measured Korean income risk.",
            "Independent root benchmark uses the same discretized shocks; does not validate accuracy of continuous-distribution approximation.",
            "Grid convergence is checked only on the stated resource interval; not a proof for all states/models.",
            "Passing numerical checks does not validate CRRA/time preferences, Korean law, goal priorities or investment performance.",
            "This does not execute the full upstream test suite or validate PortfolioConsumerType.",
        ],
    }
    assert result["versions"]["econ-ark"] == "0.17.2"
    model_path = Path(inspect.getsourcefile(IndShockConsumerType))
    payload = model_path.read_bytes()
    result["source"]["installed_model_module"] = "HARK/ConsumptionSaving/ConsIndShockModel.py"
    result["source"]["installed_model_sha256"] = hashlib.sha256(payload).hexdigest()
    result["source"]["installed_model_git_blob"] = git_blob_hash(payload)
    result["source"]["expected_git_blob"] = EXPECTED_MODEL_GIT_BLOB
    result["checks"]["installed_model_matches_release_source"] = git_blob_hash(payload) == EXPECTED_MODEL_GIT_BLOB
    d = md.distribution("econ-ark")
    license_files = [str(f) for f in (d.files or []) if str(f).endswith("/LICENSE")]
    result["source"]["installed_license_files"] = license_files
    if license_files:
        license_text = Path(d.locate_file(license_files[0])).read_text(encoding="utf-8")
        (OUT / "HARK-LICENSE.txt").write_text(license_text, encoding="utf-8")
    installed = sorted((dist.metadata["Name"], dist.version) for dist in md.distributions() if dist.metadata["Name"])
    (OUT / "requirements-lock.txt").write_text("\n".join(f"{name}=={version}" for name, version in installed) + "\n", encoding="utf-8")

    beta, R, rho = 0.96, 1.02, 2.0
    common = dict(
        cycles=1, T_cycle=1, CRRA=rho, DiscFac=beta, Rfree=[R],
        LivPrb=[1.0], PermGroFac=[1.0], PermShkStd=[0.0], PermShkCount=1,
        TranShkCount=7, UnempPrb=0.0, IncUnemp=0.0,
        UnempPrbRet=0.0, IncUnempRet=0.0, T_retire=0,
        BoroCnstArt=0.0, CubicBool=False, vFuncBool=False,
        aXtraMin=0.0001, aXtraMax=20.0, aXtraNestFac=3,
        seed=20261116, AgentCount=1, T_sim=1,
    )
    result["fixture_inputs"] = {"common": common, "resource_grid": {"minimum": 0.05, "maximum": 10.0, "count": 401}}
    m = np.linspace(0.05, 10.0, 401)

    def solve(sigma: float, grid_count: int):
        start = time.perf_counter()
        agent = IndShockConsumerType(**common, TranShkStd=[sigma], aXtraCount=grid_count)
        agent.solve()
        return agent, time.perf_counter() - start

    agent, elapsed = solve(0.0, 80)
    c = np.asarray(agent.solution[0].cFunc(m))
    # log derivative/CRRA FOC: c1/c0=(beta*R)^(1/rho); c1=R*(m-c0)+1.
    analytic = np.minimum(m, (R * m + 1.0) / (R + (beta * R) ** (1.0 / rho)))
    deterministic_error = float(np.max(np.abs(c - analytic)))
    terminal_error = float(np.max(np.abs(np.asarray(agent.solution[-1].cFunc(m)) - m)))
    result["results"]["deterministic"] = {
        "solve_seconds": elapsed, "max_absolute_policy_error": deterministic_error,
        "terminal_consume_all_max_error": terminal_error,
        "reference": "Closed-form two-period CRRA optimum with deterministic income=1 and nonborrowing constraint.",
    }
    result["checks"]["deterministic_closed_form"] = deterministic_error <= THRESHOLDS["deterministic_max_abs_error"]
    result["checks"]["terminal_consume_all"] = terminal_error <= 1e-12

    rows = []
    policies = []
    ref = None
    for n in [40, 120, 360]:
        agent, elapsed = solve(0.2, n)
        dstn = agent.IncShkDstn[0]
        probs = np.asarray(dstn.pmv, dtype=float)
        atoms = np.asarray(dstn.atoms, dtype=float)
        permanent, income = atoms[0], atoms[1]
        assert np.allclose(permanent, 1.0)
        assert np.all(income > 0.0)
        assert np.isclose(np.sum(probs), 1.0)
        if ref is None:
            result["fixture_inputs"]["stochastic_income_discrete_distribution"] = {
                "transitory_income": income.tolist(), "probabilities": probs.tolist(),
                "permanent_shocks": permanent.tolist(), "income_mean": float(probs @ income),
            }

            def reference_policy(resources: float) -> float:
                def foc(consumption: float) -> float:
                    next_consumption = R * (resources - consumption) + income
                    return consumption ** (-rho) - beta * R * float(probs @ (next_consumption ** (-rho)))
                if foc(resources) >= 0.0:
                    return resources
                return float(brentq(foc, 1e-12, resources, xtol=1e-13, rtol=1e-13))

            ref = np.array([reference_policy(float(x)) for x in m])
        c = np.asarray(agent.solution[0].cFunc(m), dtype=float)
        a = m - c
        next_c = R * a[:, None] + income[None, :]
        lhs = c ** (-rho)
        rhs = beta * R * ((next_c ** (-rho)) @ probs)
        interior = a > 1e-7
        relative_euler = np.abs((lhs[interior] - rhs[interior]) / lhs[interior])
        bound = ~interior
        # At the no-borrowing boundary c=m, u'(c) >= discounted expected next marginal value.
        kkt_violation = np.maximum(rhs[bound] - lhs[bound], 0.0) / lhs[bound]
        budget = c + a - m
        row = {
            "asset_grid_count": n, "solve_seconds": elapsed,
            "max_abs_policy_error_vs_independent_root": float(np.max(np.abs(c - ref))),
            "mean_abs_policy_error_vs_independent_root": float(np.mean(np.abs(c - ref))),
            "max_relative_euler_residual_interior": float(np.max(relative_euler)),
            "max_relative_kkt_violation_at_constraint": float(np.max(kkt_violation)) if np.any(bound) else 0.0,
            "interior_resource_points": int(np.sum(interior)),
            "binding_resource_points": int(np.sum(bound)),
            "min_consumption": float(np.min(c)), "min_saving": float(np.min(a)),
            "max_budget_residual": float(np.max(np.abs(budget))),
            "all_finite": bool(np.all(np.isfinite(c)) and np.all(np.isfinite(next_c))),
        }
        rows.append(row)
        policies.append(c)
    result["results"]["stochastic_grid_refinement"] = rows
    fine = rows[-1]
    result["checks"]["finite_positive_consumption"] = all(r["all_finite"] and r["min_consumption"] > 0 for r in rows)
    result["checks"]["nonborrowing_constraint"] = all(r["min_saving"] >= -THRESHOLDS["constraint_tolerance"] for r in rows)
    # Above algebraic c+a=m is descriptive; verify HARK's actual forward
    # simulation states independently below instead of counting it as a test.
    result["checks"]["boundary_kkt"] = all(r["max_relative_kkt_violation_at_constraint"] <= 1e-8 for r in rows)
    result["checks"]["fine_grid_independent_policy_comparison"] = fine["max_abs_policy_error_vs_independent_root"] <= THRESHOLDS["fine_stochastic_max_abs_error"]
    result["checks"]["fine_grid_interior_euler"] = fine["max_relative_euler_residual_interior"] <= THRESHOLDS["fine_stochastic_max_relative_euler_residual"]
    result["checks"]["grid_refinement_reduces_max_policy_error"] = rows[-1]["max_abs_policy_error_vs_independent_root"] < rows[0]["max_abs_policy_error_vs_independent_root"]
    agent.AgentCount = 64
    agent.T_sim = 1
    agent.track_vars = ["mNrm", "cNrm", "aNrm", "bNrm", "PermShk", "TranShk"]
    agent.initialize_sim()
    initial_a = np.asarray(agent.state_now["aNrm"]).copy()
    agent.simulate()
    history = {k: np.asarray(v).copy() for k, v in agent.history.items()}
    forward_budget = float(np.max(np.abs(history["mNrm"] - history["cNrm"] - history["aNrm"])))
    forward_resources = float(np.max(np.abs(history["mNrm"] - history["bNrm"] - history["TranShk"])))
    forward_return = float(np.max(np.abs(history["bNrm"][0] - R * initial_a / history["PermShk"][0])))
    forward_policy = float(np.max(np.abs(history["cNrm"][0] - agent.solution[0].cFunc(history["mNrm"][0]))))
    agent.initialize_sim()
    agent.simulate()
    replay_error = max(float(np.max(np.abs(history[k] - np.asarray(agent.history[k])))) for k in history)
    result["results"]["actual_forward_simulation"] = {
        "simulated_units": 64, "periods": 1, "seed": 20261116,
        "description": "Synthetic forward-transition integration check; no financial success statistic calculated.",
        "max_budget_identity_residual": forward_budget,
        "max_resource_identity_residual": forward_resources,
        "max_return_transition_residual": forward_return,
        "max_policy_application_error": forward_policy,
        "min_actual_saving": float(np.min(history["aNrm"])),
        "reinitialize_replay_max_error": replay_error,
    }
    result["checks"]["actual_forward_simulation_identities"] = max(forward_budget, forward_resources, forward_return, forward_policy) <= 1e-10
    result["checks"]["actual_forward_nonborrowing"] = float(np.min(history["aNrm"])) >= -1e-10
    result["checks"]["fixed_seed_replay"] = replay_error <= 1e-12
    result["results"]["policy_comparison_sample"] = [
        {"resources": float(m[i]), "deterministic_closed_form": float(analytic[i]),
         "independent_uncertain_income": float(ref[i]), "hark_fine": float(policies[-1][i]),
         "extra_saving_with_synthetic_income_risk": float(analytic[i] - policies[-1][i])}
        for i in [0, 20, 40, 100, 200, 400]
    ]
    np.savetxt(OUT / "policy-comparison.csv", np.column_stack([m, analytic, ref, *policies]), delimiter=",", header="normalized_resources,deterministic_closed_form,independent_root_consumption,hark_grid40,hark_grid120,hark_grid360", comments="")
    result["all_checks_passed"] = bool(all(result["checks"].values()))
    return result


if __name__ == "__main__":
    start = time.perf_counter()
    try:
        results = run()
        results["elapsed_seconds_total"] = time.perf_counter() - start
    except Exception:
        results = {"all_checks_passed": False, "execution_exception": traceback.format_exc(), "elapsed_seconds_total": time.perf_counter() - start}
    write_json(OUT / "validation-results.json", results)
    print(json.dumps(results, ensure_ascii=False, indent=2, allow_nan=False))
    raise SystemExit(0 if results.get("all_checks_passed") else 1)
