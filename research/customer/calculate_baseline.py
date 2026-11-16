"""Fictional household preliminary arithmetic; not a complete financial plan."""
from pathlib import Path
from decimal import Decimal, getcontext
import hashlib, json, sys

getcontext().prec = 45
D = Decimal
HERE = Path(__file__).resolve().parent
input_path = HERE / 'customer-input-v1.json'
data = json.loads(input_path.read_text(encoding='utf-8'))
principal = D(data['debt']['principal'])
rate = D(data['debt']['nominal_annual_rate']) / 12
periods = data['debt']['remaining_months']
pmt = principal*rate/(1-(1+rate)**(-periods))

# Independent benchmark: solve the terminal-balance recurrence by bisection.
lo, hi = D(0), principal
for _ in range(180):
    test = (lo+hi)/2
    balance = principal
    for _ in range(periods):
        balance = balance*(1+rate)-test
    if balance > 0: lo=test
    else: hi=test
independent_pmt = (lo+hi)/2
reference_dir = HERE/'reference'
if not reference_dir.exists():
    reference_dir = HERE.parent/'research'
sys.path.insert(0,str(reference_dir))
from time_value_of_money import AmortizationSchedule
reference_pmt = D(str(AmortizationSchedule(float(principal),float(rate*12),periods)._compute_payment()))

assets = sum(D(a['amount']) for a in data['assets'])
cashlike = sum(D(a['amount']) for a in data['assets'] if a['type'] in ['cash','deposit'])
income = sum(D(p.get('net_monthly_income',0)) for p in data['family'])
expense = sum(D(x['amount']) for x in data['monthly_expenses'])
allocated_saving = sum(D(x) for x in data['current_monthly_allocations'].values())
surplus_before = income-expense-pmt
surplus_after = surplus_before-allocated_saving

def month_distance_inclusive(start,end):
    y1,m1=map(int,start.split('-')); y2,m2=map(int,end.split('-'))
    return (y2-y1)*12+m2-m1+1

college = next(g for g in data['goals'] if g['id']=='college')
college_months = month_distance_inclusive(data['first_model_month'],college['target_date'])
college_at_zero = D(college['starting_earmark'])+D(college['current_contribution'])*college_months
retirement_months = month_distance_inclusive(data['first_model_month'],data['family'][0]['retirement_goal'])
balance=principal
total_interest=D(0)
for _ in range(retirement_months):
    interest=balance*rate
    total_interest+=interest
    balance=balance+interest-pmt
closed_balance=principal*(1+rate)**retirement_months-pmt*((1+rate)**retirement_months-1)/rate

stress = next(g for g in data['goals'] if g['id']=='liquidity')
monthly_stress_gap = max(D(0),D(stress['stress_monthly_expense_including_annual_average'])+pmt-D(stress['stress_income_remaining']))
six_month_gap = monthly_stress_gap*stress['stress_months']
free_cashlike = cashlike-sum(D(e['amount']) for e in data['earmarks'])
checks = {
    'annuity_vs_independent_recurrence': abs(pmt-independent_pmt)<D('0.000001'),
    'annuity_vs_pinned_open_source': abs(pmt-reference_pmt)<D('0.000001'),
    '204_month_balance_recurrence_vs_formula': abs(balance-closed_balance)<D('0.000001'),
    'cash_budget_conserves_income': expense+pmt+allocated_saving+surplus_after==income,
    'earmarks_do_not_exceed_cash_pool': free_cashlike>=0,
    'asset_earmarks_not_added_as_assets': assets==D('685000000'),
    'college_month_count': college_months==87,
    'retirement_month_count': retirement_months==204
}

def val(x): return float(x)
result = {
    'input_version':data['version'],
    'input_sha256':hashlib.sha256(input_path.read_bytes()).hexdigest(),
    'scope':'Fictional preliminary annual-average budget and fixed-rate mortgage arithmetic; no completed web app, optimization, performance result or actual customer data.',
    'units':'KRW; ratios fractions; amounts unrounded internally',
    'balance_sheet':{'assets':val(assets),'debt':val(principal),'net_worth':val(assets-principal),'home_asset_fraction':val(D('550000000')/assets),'debt_asset_fraction':val(principal/assets),'cashlike_principal_before_earmarks':val(cashlike),'cashlike_after_college_earmark':val(free_cashlike),'retirement_assets_excluded_from_cash_floor':75000000},
    'monthly_budget':{'net_income':val(income),'expense_annual_average':val(expense),'mortgage_pmt':val(pmt),'saving_capacity_before_allocations':val(surplus_before),'current_savings_transfers':val(allocated_saving),'unallocated_surplus':val(surplus_after),'payment_to_net_income_fraction_not_regulatory_DSR':val(pmt/income)},
    'mortgage':{'nominal_annual_rate':val(rate*12),'remaining_months':periods,'first_interest':val(principal*rate),'first_principal':val(pmt-principal*rate),'first_payment_net_worth_reconciliation_note':'Cash outflow includes principal+interest, principal reduces debt equally. Only interest is cost.','balance_after_204_payments':val(balance),'conditional_note':'Same rate and scheduled payments throughout; no extra prepayments/fees, no claim of future rate certainty.','payment_difference_vs_bisection':val(abs(pmt-independent_pmt)),'payment_difference_vs_original_tvm':val(abs(pmt-reference_pmt))},
    'education_zero_return_arithmetic':{'months':college_months,'future_nominal_target':college['target_nominal'],'future_nominal_minimum':college['minimum_nominal'],'starting_earmark':college['starting_earmark'],'monthly_contribution':college['current_contribution'],'projected_at_zero_return':val(college_at_zero),'target_gap':val(D(college['target_nominal'])-college_at_zero),'minimum_surplus':val(college_at_zero-D(college['minimum_nominal'])),'monthly_contribution_needed_for_target':val((D(college['target_nominal'])-D(college['starting_earmark']))/college_months),'note':'Zero return is an arithmetic reference, not a forecast or statement that the goal must fail. No second inflation addition to a future-nominal target.'},
    'six_month_income_stress':{'monthly_averaged_expenses':stress['stress_monthly_expense_including_annual_average'],'remaining_income':stress['stress_income_remaining'],'monthly_gap':val(monthly_stress_gap),'six_month_gap':val(six_month_gap),'cashlike_after_preserving_existing_college_earmarked_principal':val(free_cashlike),'remaining_after_six_month_average_gap':val(free_cashlike-six_month_gap),'college_contributions_paused':val(D(college['current_contribution'])*stress['stress_months']),'college_zero_return_after_pause_without_catchup':val(college_at_zero-D(college['current_contribution'])*stress['stress_months']),'classification':'Nonprobabilistic stress and annual-average approximation; does not prove intra-month or dated payment liquidity. No unemployment benefits or liquidation proceeds assumed.','interpretation':'Do not diagnose a current liquidity crisis: accessible principal can cover this specified average gap, but preserving the existing education earmark leaves little margin. Existing earmark principal is preserved, but future contributions pause and the goal projection changes. The missed savings are not added again as stress spending.'},
    'validation':{'checks':checks,'all_passed':all(checks.values()),'reference_repo':'JoelLewis/finance_skills','reference_commit':'5c498eacf7057e31238c4c5a8012a1afe9ec7c8a','reference_module_sha256':hashlib.sha256((reference_dir/'time_value_of_money.py').read_bytes()).hexdigest()},
    'unsupported_conclusions':['Regulatory DSR or LTV eligibility','Retirement adequacy before pension forecasts','Insurance adequacy from premiums alone','Optimal cash reserve','Optimal asset allocation','Success probability','Actual bank quote or product recommendation']
}
(HERE/'baseline-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
assert all(checks.values())
