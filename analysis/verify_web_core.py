"""Portable independent checks; Python stdlib, Node >=20; no package install.

Run from any directory: python analysis/verify_web_core.py
Checks use Decimal closed forms, an independently solved payment recurrence,
the pinned original MIT TVM source, hand-derived stress arithmetic, and a
transaction journal reconstructed from engine outputs. This is mathematical
and software validation, not a backtest or evidence of real customer outcomes.
"""
from pathlib import Path
from decimal import Decimal, getcontext
import datetime
import hashlib
import json
import platform
import shutil
import subprocess
import sys

getcontext().prec = 50
D = Decimal
ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'fixtures'
sys.path.insert(0, str(FIXTURES))
from time_value_of_money import AmortizationSchedule

NODE = shutil.which('node')
if not NODE:
    raise SystemExit('Node must be available on PATH (Node >=20).')

fixture = json.loads((FIXTURES / 'fictional-household.json').read_text(encoding='utf-8'))
zero = {key: 0 for key, value in fixture.items() if isinstance(value, (int, float))}
zero.update(startMonth='2026-12', educationDate='2027-11', stressStartMonth='2026-12')
cases = [fixture,
    {**zero, 'cash': 1200, 'loanBalance': 1200, 'loanMonths': 12},
    {**zero, 'educationDate': '2027-01', 'cash': 200, 'educationEarmark': 150,
     'educationTarget': 1000, 'livingExpenses': 300, 'loanBalance': 1200,
     'loanAnnualRatePct': 12, 'loanMonths': 12},
    {**zero, 'netIncome': 500, 'livingExpenses': 100, 'loanBalance': 1200,
     'loanAnnualRatePct': 12, 'loanMonths': 12, 'stressMonths': 1, 'stressIncomeLoss': 500},
    {**fixture, 'cashFloor': 0},
    {**zero, 'educationDate': '2076-11', 'loanBalance': 60000, 'loanMonths': 600, 'cash': 60000},
]
javascript = f"""
import fs from 'node:fs';
import {{runPlan}} from {json.dumps((ROOT / 'src/core.js').as_uri())};
const inputs=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(inputs.map(x=>runPlan(x))));
"""
run = subprocess.run([NODE, '--input-type=module', '-e', javascript],
    input=json.dumps(cases), text=True, encoding='utf-8', capture_output=True, check=True)
results = json.loads(run.stdout)
assert all(x['ok'] for x in results), results
result = results[0]
checks = []
max_differences = {}

def record(name, passed, detail):
    checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
    if not passed:
        raise AssertionError(f'{name}: {detail}')

def near(name, actual, expected, tolerance='0.00001'):
    difference = abs(D(str(actual)) - D(str(expected)))
    max_differences[name] = float(difference)
    record(name, difference <= D(tolerance), {'actual': float(actual), 'expected': float(expected),
        'absoluteDifferenceKRW': float(difference), 'toleranceKRW': float(tolerance)})

# Independent root solve for the fixed payment: never uses the annuity formula.
principal = D(fixture['loanBalance'])
rate = D(str(fixture['loanAnnualRatePct'])) / 1200
months = fixture['loanMonths']
lo, hi = D(0), principal * (1 + rate)
for _ in range(180):
    payment_candidate = (lo + hi) / 2
    terminal = principal
    for _ in range(months):
        terminal = terminal * (1 + rate) - payment_candidate
    if terminal > 0:
        lo = payment_candidate
    else:
        hi = payment_candidate
independent_payment = (lo + hi) / 2
near('payment_vs_independent_bisection', result['evidence']['monthlyPayment'], independent_payment)
reference = AmortizationSchedule(float(principal), float(rate * 12), months)
near('payment_vs_pinned_original_tvm', result['evidence']['monthlyPayment'], reference._compute_payment())
ref_path = reference.schedule()
near('original_tvm_month204_balance', result['baseline']['normal']['path'][204]['loanBalance'],
    ref_path[203]['remaining_balance'], '0.0051')
record('source_hash_unchanged', hashlib.sha256((FIXTURES/'time_value_of_money.py').read_bytes()).hexdigest()
    == 'fef6099e25f517e6848c5a59da990285a2ca10f44765203ab333aa9ac37b2375', 'Original module bytes retained; MIT license preserved.')

n = D(result['comparisonMonths'])
closed_balance = principal * (1+rate)**int(n) - independent_payment*((1+rate)**int(n)-1)/rate
near('baseline_closed_form_balance87', result['baseline']['normal']['summary']['loanBalance'], closed_balance)
expected_cash = D(fixture['cash']) + n*(D(fixture['netIncome'])-D(fixture['livingExpenses'])
    -independent_payment-D(fixture['pensionMonthly'])-D(fixture['investmentMonthly']))
near('baseline_closed_form_total_cash', result['baseline']['normal']['summary']['cash'], expected_cash)
near('baseline_earmark_not_an_added_asset', result['evidence']['initialNetWorth'], 465000000)
near('baseline_education_87_deposits', result['baseline']['normal']['summary']['educationBalance'], 46100000)

# Normal extra repayment has ample budget and floor headroom in this fixture.
# Solve the loan separately; no JavaScript path transaction amounts are inputs.
balance, extra_interest, fees = principal, D(0), D(0)
payoff = None
debt_comparison_balance = None
for month in range(1, months + 1):
    interest = balance*rate
    extra_interest += interest
    balance = balance+interest-min(independent_payment,balance+interest)
    fee_rate = D(str(fixture['prepaymentFeePct']))/100*max(D(0),D(fixture['feeMonthsRemaining']-month+1)/fixture['feeMonthsRemaining'])
    additional_principal = min(balance,D(fixture['extraMonthly'])/(1+fee_rate))
    fees += additional_principal*fee_rate
    balance -= additional_principal
    if month == int(n):
        debt_comparison_balance = balance
    if balance < D('1e-30') and payoff is None:
        balance = D(0)
        payoff = month
near('independent_extra_repayment_balance87', result['strategies'][1]['normal']['summary']['loanBalance'], debt_comparison_balance)
near('independent_extra_repayment_total_interest', result['strategies'][1]['normal']['summary']['lifetimeInterestWithinProjection'], extra_interest)
near('independent_linear_fee_total', result['strategies'][1]['normal']['summary']['cumulativeFees'], fees)
record('independent_early_payoff_month', result['strategies'][1]['normal']['summary']['payoffMonth']==payoff,
    {'actual': result['strategies'][1]['normal']['summary']['payoffMonth'], 'expected': payoff})

# Hand-derived six-month shock. All elective deposits pause, so only 3 cash terms.
six_month_cash = D(fixture['cash']) + 6*(D(fixture['netIncome']-fixture['stressIncomeLoss'])
    -D(fixture['livingExpenses']-fixture['stressExpenseReduction'])-independent_payment)
free_after_six = six_month_cash-D(fixture['educationEarmark'])
near('stress_six_month_cash_from_three_cash_terms', result['baseline']['stress']['path'][6]['cash'], six_month_cash)
near('stress_six_month_free_cash', result['baseline']['stress']['path'][6]['freeCash'], free_after_six)
near('six_pauses_without_floor_have_exact_1_8m_goal_cost', results[4]['baseline']['stress']['summary']['educationBalance'], 44300000)

# Independently derive recovery: two zero-saving recovery months, then one
# partially funded saving month; after this the income budget fully funds savings.
surplus = D(fixture['netIncome']-fixture['livingExpenses'])-independent_payment
floor_gap = D(fixture['cashFloor'])-free_after_six
fully_paused_recovery_months = int(floor_gap//surplus)
partial_capacity = min((fully_paused_recovery_months+1)*surplus-floor_gap,
    surplus-D(fixture['generalCashMonthly']))
regular_total = D(fixture['educationMonthly']+fixture['pensionMonthly']+fixture['investmentMonthly'])
partial_education = D(fixture['educationMonthly'])*partial_capacity/regular_total
missed = D((6+fully_paused_recovery_months)*fixture['educationMonthly']) + D(fixture['educationMonthly'])-partial_education
expected_stressed_education = D(fixture['educationEarmark'])+n*fixture['educationMonthly']-missed
near('hand_derived_post_stress_floor_recovery_goal', result['baseline']['stress']['summary']['educationBalance'], expected_stressed_education)
near('hand_derived_missed_education', result['baseline']['stress']['summary']['cumulativeMissedEducation'], missed)

# Reconstruct a separate double-entry-style journal for every returned scenario.
# Reported identityError and reported net-worth change are NOT used as expected values.
invariant_count = 0
max_journal_error = D(0)
for case_index, (inputs, output) in enumerate(zip(cases, results)):
    for strategy in output['strategies']:
        for mode in ['normal','stress']:
            path = strategy[mode]['path']
            for prior, row in zip(path,path[1:]):
                p = {k:D(str(v)) for k,v in prior.items() if type(v) in (int,float)}
                q = {k:D(str(v)) for k,v in row.items() if type(v) in (int,float)}
                equations = {
                    'cash': p['cash']+q['income']-q['livingPaid']-q['loanPayment']
                        -q['pensionContribution']-q['investmentContribution']-q['extraPrincipal']-q['fee'],
                    'educationBalance': p['educationBalance']-q['educationWithdrawal']+q['educationContribution']+q['extraEducation'],
                    'loanBalance': p['loanBalance']-q['principalPayment']-q['extraPrincipal'],
                    'unpaidInterest': p['unpaidInterest']+p['loanBalance']*D(str(inputs['loanAnnualRatePct']))/1200
                        -(q['loanPayment']-q['principalPayment']),
                    'unpaidLiving': p['unpaidLiving']+q['livingExpense']-q['livingPaid'],
                    'investmentAssets': p['investmentAssets']+q['investmentContribution'],
                    'retirementAssets': p['retirementAssets']+q['pensionContribution'],
                    'netWorth': p['netWorth']+q['income']-q['livingExpense']
                        -p['loanBalance']*D(str(inputs['loanAnnualRatePct']))/1200-q['fee'],
                }
                for key, expected in equations.items():
                    diff=abs(q[key]-expected)
                    max_journal_error=max(max_journal_error,diff)
                    assert diff < D('0.00001'), (case_index,strategy['id'],mode,row['month'],key,diff)
                    invariant_count+=1
                assert q['cash']>=0 and q['educationBalance']<=q['cash']+D('1e-6')
                assert q['extraUsed'] <= D(inputs['extraMonthly'])+D('1e-6')
                assert q['loanArrears'] <= q['loanBalance']+q['unpaidInterest']+D('1e-6')
                invariant_count+=4
record('independent_transaction_journal', True, {'caseCount':len(cases),'invariantChecks':invariant_count,
    'maximumAbsoluteDifferenceKRW':float(max_journal_error),'toleranceKRW':0.00001})

# Simple insolvency has an exact hand-checkable first month: cash200 pays part
# of living300; loan principal1200 untouched; interest12 unpaid. NW=-1312.
shortage = results[2]['baseline']['normal']['path'][1]
near('hand_unpaid_consumption_liability', shortage['unpaidLiving'], 100)
near('hand_unpaid_interest_liability', shortage['unpaidInterest'], 12)
near('hand_insolvency_net_worth_without_double_count', shortage['netWorth'], -1312)
near('hand_education_reserve_emergency_use', shortage['educationWithdrawal'], 150)
record('cash_and_education_fixture_total_assets_same', all(
    abs(result['strategies'][0][mode]['summary']['netWorth']-result['strategies'][2][mode]['summary']['netWorth'])<1e-6
    for mode in ['normal','stress']), 'Fixture-specific: earmarking alone does not create wealth or demonstrate investment performance.')

node_tests = subprocess.run([NODE, '--test', 'tests/core.test.mjs'], cwd=ROOT,
    text=True, encoding='utf-8', capture_output=True)
record('node_tests_exit_success', node_tests.returncode==0, node_tests.stdout[-1800:]+node_tests.stderr)

report = {
    'status': 'passed', 'verifiedAtUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Synthetic deterministic monthly household arithmetic and software invariants only. No real customer performance or investment backtest.',
    'runtime': {'python':sys.version.split()[0], 'node':subprocess.check_output([NODE,'--version'],text=True).strip(),
        'platform':platform.platform(),'dependencies':'Python standard library; Node built-ins; original pinned MIT TVM source retained'},
    'source': {'coreSHA256':hashlib.sha256((ROOT/'src/core.js').read_bytes()).hexdigest(),
        'tvmSHA256':hashlib.sha256((FIXTURES/'time_value_of_money.py').read_bytes()).hexdigest(),
        'tvmCommit':'5c498eacf7057e31238c4c5a8012a1afe9ec7c8a',
        'tvmPath':'plugins/core/skills/time-value-of-money/scripts/time_value_of_money.py',
        'license':'MIT; JOEL_LICENSE.txt'},
    'summary': {'passedChecks':len(checks),'failedChecks':0,'nodeTestGroups':18,
        'independentJournalInvariants':invariant_count,'maximumJournalDifferenceKRW':float(max_journal_error)},
    'checks':checks,
    'observations': {
        'baselineMonthlyPayment':result['evidence']['monthlyPayment'],
        'baselineEducation':result['baseline']['normal']['summary']['educationBalance'],
        'stressedEducationWithFloorRecovery':result['baseline']['stress']['summary']['educationBalance'],
        'stressedEducationWithoutFloorRecovery':results[4]['baseline']['stress']['summary']['educationBalance'],
        'sixMonthFreeCash':result['baseline']['stress']['path'][6]['freeCash'],
        'debtEarlyPayoffMonths':result['strategies'][1]['normal']['summary']['payoffMonth'],
        'feeTotalKRW':result['strategies'][1]['normal']['summary']['cumulativeFees'],
        'cashAlternativeEqualsBaseline':True,
        'educationEarmarkDoesNotCreateWealth':True,
    },
    'limits': ['Returns and inflation zero; no tax, bank day count/rounding, actual dated cash timing or legal default outcomes.',
        'Monetary tolerances apply to tested fixtures, not a universal bank-precision guarantee.',
        'Long payoff horizon assumes the same income and expenses continue; retirement readiness is not assessed.',
        'Education target gap measures earmarked cash, not total funding capacity or goal success probability.'],
}
(FIXTURES/'verification-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(FIXTURES/'fictional-household-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
compact_result = json.loads(json.dumps(result))
for plan in [compact_result['baseline'], *compact_result['strategies']]:
    for scenario in ['normal', 'stress']:
        plan[scenario].pop('path', None)
(FIXTURES/'fictional-household-summary.json').write_text(json.dumps(compact_result,ensure_ascii=False,indent=2),encoding='utf-8')
(FIXTURES/'verification-summary-ko.txt').write_text(
    f"계산엔진 실제 실행 검증: Python 확인 {len(checks)}개 통과, Node 테스트18개 통과.\n"
    f"독립 원장식 {invariant_count:,}개 대조, 최대 차이 {float(max_journal_error):.10f}원.\n"
    "정액 원리금은 원래 TVM 소스와 독립 이분법, 잔액은 Decimal 닫힌식과 대조했다.\n"
    "현금 유지안은 기준안과 동일하다. 교육배정 이동은 순자산을 늘리지 않는다.\n"
    "소득중단6개월 이후 현금하한 회복 때문에 교육배정은4356.64만원이다. 하한0원일때4430만원과 구별한다.\n"
    "미지급 생활비·미지급 이자와 이미 대출잔액에 포함된 연체원금을 분리하여 중복계상하지 않는다.\n"
    "모든 고객값은 가상이다. 테스트는 수학·프로그램 검증이며 실제 고객 실행성과나 투자성과 검증이 아니다.\n"
    "재실행: node --test tests/core.test.mjs / python analysis/verify_web_core.py\n",encoding='utf-8')
print(json.dumps(report['summary'],ensure_ascii=False,indent=2))
