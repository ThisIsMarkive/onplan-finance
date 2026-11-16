"""Household accounting proof of concept, no customer defaults or product advice.

Money is Decimal in one nominal currency. One period is one month. Inputs must
already be net of the specified taxes. Tax calculation and real products are not
implemented. This narrow kernel demonstrates conservation and shared resources.
"""
from dataclasses import dataclass, replace
from decimal import Decimal, localcontext
from typing import Sequence

D = Decimal
ZERO = D(0)

def amount(value):
    x = D(str(value))
    if not x.is_finite():
        raise ValueError("Non-finite value")
    return x

def nonnegative(value):
    x = amount(value)
    if x < 0:
        raise ValueError("Negative amount")
    return x

@dataclass(frozen=True)
class Balance:
    cash: Decimal
    investment: Decimal
    debt: Decimal
    arrears: Decimal = ZERO
    delinquent_principal: Decimal = ZERO  # subset of debt, not extra liability

    def __post_init__(self):
        for name in ("cash", "investment", "debt", "arrears", "delinquent_principal"):
            object.__setattr__(self, name, nonnegative(getattr(self, name)))
        if self.delinquent_principal > self.debt:
            raise ValueError("Delinquent principal must be a subset of debt")

    @property
    def net_worth(self):
        return self.cash + self.investment - self.debt - self.arrears

def transfer_to_investment(state, value):
    value = nonnegative(value)
    if state.arrears or state.delinquent_principal or value > state.cash:
        raise ValueError("Investment blocked by arrears or insufficient cash")
    return replace(state, cash=state.cash-value, investment=state.investment+value)

def liquidate(state, value, fee=0):
    value, fee = nonnegative(value), nonnegative(fee)
    if value > state.investment or fee > value:
        raise ValueError("Invalid liquidation")
    return replace(state, cash=state.cash+value-fee, investment=state.investment-value)

def pay_principal(state, requested):
    paid = min(nonnegative(requested), state.cash, state.debt)
    return replace(state, cash=state.cash-paid, debt=state.debt-paid,
                   delinquent_principal=max(ZERO,state.delinquent_principal-paid)), paid

def settle_arrears(state):
    paid = min(state.cash, state.arrears)
    return replace(state, cash=state.cash-paid, arrears=state.arrears-paid), paid

def accrue_month(state, *, net_income, essential_cost, investment_return,
                 debt_rate, scheduled_principal):
    """Start balance earns return; income arrives; due costs/interest recognized.

    Liquidation must be explicit before this event. essential_cost is an ALREADY
    INCURRED payment obligation, not an unpurchased consumption wish. Unpaid
    incurred costs become arrears. Unmet unpurchased needs require a separate
    metric and must not generate debt. Debt interest is capitalized in this
    fixture convention; scheduled_principal is NEW principal due, not an EMI.
    Existing arrears block optional allocations until explicitly settled.
    """
    income, cost = nonnegative(net_income), nonnegative(essential_cost)
    r, dr = amount(investment_return), nonnegative(debt_rate)
    if r < -1:
        raise ValueError("Unlevered investment return below -100%")
    gain, interest = state.investment*r, state.debt*dr
    cash = state.cash + income
    essential_paid = min(cash, cost)
    shortage = cost-essential_paid
    updated = Balance(cash-essential_paid, state.investment+gain,
                      state.debt+interest, state.arrears+shortage,
                      state.delinquent_principal)
    principal_due = state.delinquent_principal + min(nonnegative(scheduled_principal),
                          updated.debt-state.delinquent_principal)
    updated, debt_paid = pay_principal(updated, principal_due)
    updated = replace(updated, delinquent_principal=principal_due-debt_paid)
    expected_nw = state.net_worth + income + gain - cost - interest
    if updated.net_worth != expected_nw:
        raise ArithmeticError("Accounting reconciliation failed")
    return updated, {"gain": gain, "interest": interest,
                     "essential_shortfall": shortage, "principal_paid": debt_paid,
                     "principal_shortfall": principal_due-debt_paid,
                     "reconciliation_residual": updated.net_worth-expected_nw}

@dataclass(frozen=True)
class GoalDue:
    key: str
    target: Decimal
    priority: int

    def __post_init__(self):
        if not isinstance(self.key,str) or not self.key.strip():
            raise ValueError("Nonempty goal id required")
        object.__setattr__(self,'target',nonnegative(self.target))
        if type(self.priority) is not int or self.priority < 0:
            raise ValueError("Priority must be a nonnegative integer")

def liquidity_gap(state, cash_floor):
    """Report a pre-existing shortfall; an allocation cannot create a reserve."""
    return max(ZERO, nonnegative(cash_floor)-state.cash)

def fund_goals(state, goals: Sequence[GoalDue], cash_floor):
    """Explicit user priority; goal payments consume the same single cash pool.

    No silent priority is assigned to tied goals. Unmet aspirational goals are
    reported, not booked as legal liabilities. Irrevocable obligations belong in
    essential_cost/arrears instead. Goal minimum/deferral policies are future work.
    """
    floor = nonnegative(cash_floor)
    if len({g.key for g in goals}) != len(goals):
        raise ValueError("Duplicate goal id")
    if len({g.priority for g in goals}) != len(goals):
        raise ValueError("Explicit tie policy required")
    remaining = max(ZERO, state.cash-floor) if state.arrears == 0 and state.delinquent_principal == 0 else ZERO
    results = []
    for g in sorted(goals, key=lambda g: g.priority):
        target = nonnegative(g.target)
        paid = min(remaining, target)
        remaining -= paid
        results.append({"goal": g.key, "target": target, "paid": paid,
                        "shortfall": target-paid, "met": paid == target})
    total = sum((r["paid"] for r in results), ZERO)
    return replace(state, cash=state.cash-total), results

def earmark(available, allocations):
    """Virtual labels, no transfers; each pool can only be counted once."""
    total = sum((nonnegative(x) for x in allocations.values()), ZERO)
    if total > nonnegative(available):
        raise ValueError("Overallocated pool")
    return nonnegative(available)-total

def required_opening_cash(net_flows, floor=0):
    """Zero-interest known-path lower bound, NOT an optimum emergency fund.

    Month-boundary convention only. Add dated intra-month events for real bills.
    Each stress path is evaluated separately; no probability is assumed.
    """
    running, minimum = ZERO, ZERO
    for flow in net_flows:
        running += amount(flow)
        minimum = min(minimum, running)
    return nonnegative(floor)-minimum

def annual_effective_to_monthly(rate):
    rate = amount(rate)
    if rate <= -1:
        raise ValueError("Invalid effective rate")
    with localcontext() as ctx:
        ctx.prec = 40
        return (1+rate)**(D(1)/D(12))-1

def joint_goal_success(rows):
    """Equal-weight SIMULATED path frequency, no claim of real probability."""
    if not rows or not rows[0] or any(len(row) != len(rows[0]) for row in rows):
        raise ValueError("Empty or ragged scenarios")
    if any(type(value) is not bool for row in rows for value in row):
        raise ValueError("Boolean achievement flags required")
    return D(sum(all(row) for row in rows))/D(len(rows))
