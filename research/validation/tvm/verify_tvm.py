"""Independent checks of a pinned reference module; no customer data."""
from decimal import Decimal, getcontext
import json, math, platform, hashlib
from pathlib import Path
from time_value_of_money import TimeValueOfMoney as TVM, AmortizationSchedule
getcontext().prec = 40
D = Decimal
checks = []
def record(name, actual, expected, tolerance):
    delta = abs(float(actual) - float(expected))
    checks.append(dict(name=name, actual=float(actual), independent=float(expected),
                       absolute_error=delta, tolerance=tolerance, passed=delta <= tolerance))
# Explicit dated cash flows, unlike the closed-form annuity routines.
for r in ["0", "0.004", "-0.001"]:
    for due in [False, True]:
        n, p = 24, D("100000")
        times = range(n) if due else range(1, n+1)
        pv = sum((p/(1+D(r))**t for t in times), D(0))
        fv = sum((p*(1+D(r))**(n-t) for t in times), D(0))
        record(f"annuity_pv rate={r} due={due}", TVM.annuity_pv(float(p),float(r),n,due),pv,0.00001)
        record(f"annuity_fv rate={r} due={due}", TVM.annuity_fv(float(p),float(r),n,due),fv,0.00001)
for r,g in [("0.03","0.03"),("0.04","0.02")]:
    explicit = sum((D("100000")*(1+D(g))**(t-1)/(1+D(r))**t for t in range(1,31)),D(0))
    record(f"growing_annuity_pv r={r} g={g}",TVM.growing_annuity_pv(100000,float(r),float(g),30),explicit,0.00001)
# Solve payment by zeroing the terminal balance with bisection, not a PMT formula.
principal, monthly_rate, n = D("100000000"), D("0.04")/12, 120
lo, hi = D(0), principal
for _ in range(160):
    mid=(lo+hi)/2
    balance=principal
    for month in range(n):
        balance=balance*(1+monthly_rate)-mid
    if balance>0: lo=mid
    else: hi=mid
independent_payment=(lo+hi)/2
ref=AmortizationSchedule(float(principal),0.04,n)
record("loan_payment_decimal_recurrence_bisection",ref._compute_payment(),independent_payment,0.00001)
record("loan_discounted_payments_equal_principal",
       sum(D(str(ref._compute_payment()))/(1+monthly_rate)**t for t in range(1,n+1)),principal,0.001)
# A hand-solvable NPV example.
record("npv_t0_convention", TVM.npv(.1,[-100,55,60.5]),0,1e-10)
data = {
    "purpose":"Preliminary code eligibility validation, not a fictional-client calculation",
    "python":platform.python_version(),
    "repository":"JoelLewis/finance_skills",
    "commit":"5c498eacf7057e31238c4c5a8012a1afe9ec7c8a",
    "module":"plugins/core/skills/time-value-of-money/scripts/time_value_of_money.py",
    "module_sha256":hashlib.sha256(Path(__file__).with_name("time_value_of_money.py").read_bytes()).hexdigest(),
    "source_self_checks":"Executed --verify and passed before this independent validation",
    "checks":checks,
    "all_passed":all(c["passed"] for c in checks),
    "coverage_limits":["No client simulations","Not full repository validation","No Korean tax/pension/product rules","No irregular-date cash flows","No performance claims"],
}
Path(__file__).with_name("tvm-verification.json").write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps({"checks":len(checks),"all_passed":data["all_passed"],"max_absolute_error":max(c["absolute_error"] for c in checks),"python":data["python"]}))
if not data["all_passed"]: raise SystemExit(1)

