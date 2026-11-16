"""Independent hand-solvable, boundary and invariant fixtures, no customer data."""
import hashlib, json, platform, random
from datetime import datetime, timezone
from decimal import Decimal as D
from pathlib import Path
from planning_core import (Balance, GoalDue, transfer_to_investment, liquidate,
    pay_principal, settle_arrears, accrue_month, fund_goals, earmark,
    required_opening_cash, annual_effective_to_monthly, joint_goal_success,liquidity_gap)

checks=[]
def check(name, actual, expected, tolerance=D(0)):
    passed = abs(actual-expected)<=tolerance if isinstance(actual,(D,float,int)) else actual==expected
    checks.append(dict(name=name,actual=str(actual),expected=str(expected),
                       tolerance=str(tolerance),passed=passed))
def rejects(name, fn):
    try: fn()
    except ValueError: check(name,True,True)
    else: check(name,False,True)

s=Balance(100,200,50)
t=transfer_to_investment(s,40)
check('internal_transfer_net_worth',t.net_worth,D(250))
check('cash_reduced_once',t.cash,D(60))
t=liquidate(t,30,2)
check('liquidation_fee_not_double_counted',t.net_worth,D(248))
t,paid=pay_principal(t,200)
check('repayment_capped_at_debt',paid,D(50))
check('principal_repayment_net_worth',t.net_worth,D(248))
rejects('overinvestment_rejected',lambda:transfer_to_investment(s,101))
rejects('oversale_rejected',lambda:liquidate(s,201))
rejects('nonfinite_input_rejected',lambda:Balance('NaN',0,0))

# Closed form independent of step ordering: net worth0=250, income20,
# return gain20, cost30, interest5 gives net worth255.
t,audit=accrue_month(s,net_income=20,essential_cost=30,investment_return='.1',debt_rate='.1',scheduled_principal=10)
check('month_hand_calculation_net_worth',t.net_worth,D(255))
check('month_hand_calculation_cash',t.cash,D(80))
check('month_hand_calculation_debt',t.debt,D(45))

t,audit=accrue_month(Balance(5,100,20),net_income=0,essential_cost=12,investment_return='-.2',debt_rate='.1',scheduled_principal=10)
check('essential_cost_shortage_7',audit['essential_shortfall'],D(7))
check('arrears_preserve_unpaid_liability',t.net_worth,D(51))
check('principal_shortage_not_hidden',audit['principal_shortfall'],D(10))
check('missed_principal_carried_forward',t.delinquent_principal,D(10))
rejects('delinquency_blocks_investment',lambda:transfer_to_investment(Balance(20,0,20,0,10),1))
u,_=fund_goals(Balance(20,0,20,0,10),[GoalDue('A',D(5),1)],0)
check('delinquency_blocks_optional_goals',u.cash,D(20))
u,a=accrue_month(Balance(0,0,20,0,10),net_income=15,essential_cost=0,investment_return=0,debt_rate=0,scheduled_principal=2)
check('old_and_new_principal_due_paid_once',a['principal_paid'],D(12))
check('delinquency_not_extra_liability',u.net_worth,D(-5))
check('delinquency_settled_next_month',u.delinquent_principal,D(0))
rejects('delinquency_must_be_subset',lambda:Balance(0,0,5,0,6))
rejects('investment_blocked_by_arrears',lambda:transfer_to_investment(Balance(20,0,0,7),1))
t,paid=settle_arrears(Balance(20,0,0,7))
check('settling_arrears_no_second_expense',t.net_worth,D(13))
check('settling_arrears_cleared',t.arrears,D(0))
rejects('unlevered_below_minus100_rejected',lambda:accrue_month(s,net_income=0,essential_cost=0,investment_return='-1.1',debt_rate=0,scheduled_principal=0))

goals=[GoalDue('A',D(70),1),GoalDue('B',D(70),2)]
t,result=fund_goals(Balance(100,0,0),goals,20)
check('shared_cash_goal_A',result[0]['paid'],D(70))
check('shared_cash_goal_B',result[1]['paid'],D(10))
check('cash_floor_respected',t.cash,D(20))
low,low_goals=fund_goals(Balance(5,0,0),goals,10)
check('preexisting_reserve_gap_reported',liquidity_gap(low,10),D(5))
check('reserve_gap_blocks_goal_spending',sum(g['paid'] for g in low_goals),D(0))
rejects('nonfinite_goal_priority_rejected',lambda:GoalDue('A',D(1),float('nan')))
rejects('empty_goal_id_rejected',lambda:GoalDue('',D(1),1))
check('second_goal_shortfall_explicit',result[1]['shortfall'],D(60))
rejects('tied_goal_priority_requires_policy',lambda:fund_goals(s,[GoalDue('A',D(1),1),GoalDue('B',D(2),1)],0))
rejects('duplicate_goal_rejected',lambda:fund_goals(s,[GoalDue('A',D(1),1),GoalDue('A',D(2),2)],0))
rejects('same_pool_double_earmark_rejected',lambda:earmark(100,{'goalA':70,'goalB':70}))
check('virtual_earmarks_do_not_create_cash',earmark(100,{'goalA':70,'goalB':20}),D(10))
t,result=fund_goals(Balance(100,0,0,1),goals,0)
check('arrears_block_optional_goals',sum(r['paid'] for r in result),D(0))

# Prefix balances -3,-5,-1: 5 needed without floor, 7 with floor2.
check('pathwise_cash_need_prefix_bound',required_opening_cash([-3,-2,4],2),D(7))
check('positive_flow_cash_need',required_opening_cash([2,3],2),D(2))
r=annual_effective_to_monthly('.12')
check('effective_rate_round_trip',(1+r)**12-1,D('.12'),D('1e-25'))
check('effective_rate_is_not_nominal_division',abs(r-D('.01'))>D('.0001'),True)
# Both goals fail together: marginals .75, joint .75, not .75*.75.
joint=joint_goal_success([[True,True],[True,True],[True,True],[False,False]])
check('common_paths_joint_success',joint,D('.75'))
check('independent_probability_product_wrong',joint!=D('.75')**2,True)
rejects('scenario_shape_guard',lambda:joint_goal_success([[True],[False,True]]))

# Non-mirrored random accounting invariant over 1000 integer-valued fixtures.
# External wealth flow identity is independent of payment allocation details.
rng=random.Random(20261116)
max_residual=D(0)
for _ in range(1000):
    cash,investment,debt=[rng.randrange(0,10000) for i in range(3)]
    income,cost,payment=[rng.randrange(0,1000) for i in range(3)]
    rate=D(rng.randrange(-30,31))/100
    dr=D(rng.randrange(0,11))/100
    initial=Balance(cash,investment,debt)
    end,_=accrue_month(initial,net_income=income,essential_cost=cost,investment_return=rate,debt_rate=dr,scheduled_principal=payment)
    independently_expected=D(cash)+D(investment)*(1+rate)-D(debt)*(1+dr)+income-cost
    max_residual=max(max_residual,abs(end.net_worth-independently_expected))
check('1000_accounting_invariants_max_residual',max_residual,D(0))

# An intentionally naive baseline diagnoses each goal independently.
naive_individual=[100>=70,100>=70]
comparison={'fixture':'100 cash; floor20; two due goals70 each; no person or demographic',
 'naive_independent_goal_achievement':naive_individual,
 'integrated_paid':[70,10],'integrated_shortfall':[0,60],
 'purpose':'demonstrates prevention of double spending, not financial performance'}
data={'schema_version':'0.1','created_utc':datetime.now(timezone.utc).isoformat(),
 'python':platform.python_version(),'platform':platform.platform(),
 'fixture_kind':'synthetic mathematical verification only; not customer scenario',
 'source_sha256':hashlib.sha256(Path(__file__).with_name('planning_core.py').read_bytes()).hexdigest(),
 'checks':checks,'checks_passed':sum(c['passed'] for c in checks),'all_passed':all(c['passed'] for c in checks),
 'random_invariant_trials':1000,'baseline_comparison':comparison,
 'limits':['Not Korean tax, pension or product rule engine','No automatic insolvency resolution',
 'No future-return inference','Single investable balance and explicit month-end convention',
 'Essential costs mean incurred obligations; unpurchased needs not represented',
 'No existing-arrears interest or contractual payment-priority model','No web application or runtime LLM validation'],
 'review_correction':{'issue':'Initially missed principal was only logged, so later optional investment was not blocked',
 'fix':'Carry delinquent_principal as subset of debt, block optional allocations, settle once next month',
 'distinction':'Incurred unpaid costs are liabilities; unpurchased essential needs are not',
 'additional_fixes':['Report pre-existing liquidity gap independently of allocation',
 'Reject nonfinite or noninteger priority and empty goal id']}}
Path(__file__).with_name('integration-results.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks':len(checks),'passed':data['checks_passed'],'random_trials':1000,'all_passed':data['all_passed']}))
if not data['all_passed']: raise SystemExit(1)
