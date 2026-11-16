import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NUMERIC_FIELDS, DATE_FIELDS, monthlyPayment, validateInputs, runPlan } from '../src/core.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/fictional-household.json', import.meta.url)));
const base = (overrides={}) => ({...fixture,...overrides});
const plan = (overrides={}) => {
  const r=runPlan(base(overrides)); assert.equal(r.ok,true,JSON.stringify(r.errors)); return r;
};
const near=(actual,expected,tol=1e-5)=>assert.ok(Math.abs(actual-expected)<=tol,`${actual} != ${expected}`);
const zero = {
  ...Object.fromEntries(NUMERIC_FIELDS.map(k=>[k,0])),
  startMonth:'2026-12',educationDate:'2027-11',stressStartMonth:'2026-12',
};

test('every required numeric and date field rejects blanks, nulls and absent values',()=>{
  for (const key of [...NUMERIC_FIELDS,...DATE_FIELDS]) {
    for (const value of ['', ' ', null, undefined, false, [], {}]) {
      const r=runPlan(base({[key]:value})); assert.equal(r.ok,false,`${key}=${value}`);
      assert.ok(r.errors.some(e=>e.field===key));
    }
  }
});
test('nonfinite, negative, excessive numeric values and invalid dates are rejected',()=>{
  for (const v of [Infinity,NaN,-1,1e13+1,'NaN','Infinity','1e999','0x10']) assert.equal(runPlan(base({cash:v})).ok,false);
  for (const v of ['2026-00','2026-13','2026-2','2026-02-01','1899-01','2201-01']) assert.equal(runPlan(base({startMonth:v})).ok,false);
  for (const field of ['loanMonths','feeMonthsRemaining','stressMonths']) assert.equal(runPlan(base({[field]:1.5})).ok,false);
});
test('cross-field validation prevents duplicated earmarks, inconsistent zero goals and invalid stress',()=>{
  for (const overrides of [
    {educationEarmark:30000001},{educationMinimum:60000001},{educationTarget:0},
    {loanMonths:0},{loanBalance:0},{feeMonthsRemaining:301},{prepaymentFeePct:101},
    {loanAnnualRatePct:101},{stressIncomeLoss:6500001},{stressExpenseReduction:3500001},
    {educationDate:'2026-11'},{educationDate:'2076-12'},
    {stressStartMonth:'2076-11',stressMonths:2},
  ]) assert.equal(runPlan(base(overrides)).ok,false,JSON.stringify(overrides));
});
test('all-zero customer with explicit fields is valid, has no debt and no invented cash',()=>{
  const r=runPlan(zero); assert.equal(r.ok,true); assert.equal(r.baseline.normal.summary.payoffMonth,0);
  assert.equal(r.baseline.normal.summary.netWorth,0); assert.equal(r.baseline.normal.summary.cash,0);
  assert.deepEqual(r.baseline.normal,r.baseline.stress);
});
test('numeric strings normalize without mutating caller input',()=>{
  const x=base({netIncome:'6500000',loanAnnualRatePct:'4.8'}); const before=JSON.stringify(x);
  assert.equal(validateInputs(x).input.netIncome,6500000); runPlan(x); assert.equal(JSON.stringify(x),before);
});
test('zero-rate loan and zero-interest principal transfer preserve wealth',()=>{
  near(monthlyPayment(1200,0,12),100);
  const r=runPlan({...zero,cash:1200,loanBalance:1200,loanMonths:12});
  assert.equal(r.ok,true); near(r.baseline.normal.summary.cash,0); near(r.baseline.normal.summary.loanBalance,0);
  near(r.baseline.normal.summary.netWorth,0); assert.equal(r.baseline.normal.summary.payoffMonth,12);
});
test('fictional baseline matches independent original preliminary arithmetic',()=>{
  const r=plan(), s=r.baseline.normal.summary;
  near(s.monthlyPayment,1260593.316547084); near(s.initialNetWorth,465000000);
  assert.equal(r.comparisonMonths,87); assert.equal(r.projectionMonths,300);
  near(s.educationBalance,46100000); near(s.educationGap,13900000);
  near(r.baseline.normal.path[204].loanBalance,100326416.350240,0.0001);
  near(r.evidence.unallocatedMonthly,439406.683452916);
});
test('cash alternative is exactly baseline and education earmarks cannot create assets',()=>{
  const r=plan(); assert.deepEqual(r.strategies[0].normal,r.baseline.normal);
  assert.deepEqual(r.strategies[0].stress,r.baseline.stress);
  for (const type of ['normal','stress']) {
    const cash=r.strategies[0][type].summary, edu=r.strategies[2][type].summary;
    near(cash.cash,edu.cash); near(cash.netWorth,edu.netWorth);
    near(edu.educationBalance,fixture.educationTarget);
    near(cash.cash-cash.educationBalance,cash.freeCash);
  }
});
test('same extra budget includes fee and loans keep scheduled payment until early payoff',()=>{
  const r=plan(), debt=r.strategies[1].normal;
  const first=debt.path[1], lastFee=debt.path[12];
  near(first.extraPrincipal,400000/1.005); near(first.fee,400000-first.extraPrincipal);
  near(lastFee.fee/lastFee.extraPrincipal,0.005/12);
  assert.equal(debt.path[13].fee,0); assert.equal(debt.summary.payoffMonth,190);
  for (const row of debt.path.slice(1)) {
    assert.ok(row.extraUsed<=fixture.extraMonthly+1e-6);
    if (row.month<debt.summary.payoffMonth) near(row.loanPayment,debt.summary.monthlyPayment);
  }
  assert.ok(debt.summary.cumulativeInterest<r.baseline.normal.summary.cumulativeInterest);
});
test('stress pauses all elective payments and connects floor recovery to future education',()=>{
  const r=plan(), s=r.baseline.stress;
  for (const row of s.path.slice(1,7)) {
    assert.equal(row.educationContribution,0); assert.equal(row.pensionContribution,0);
    assert.equal(row.investmentContribution,0); assert.equal(row.extraUsed,0);
  }
  near(s.path[6].freeCash,336440.1007175);
  assert.equal(s.path[6].loanArrears,0);
  assert.equal(s.path[7].educationContribution,0);
  assert.ok(s.summary.cumulativeMissedEducation>1800000);
  near(s.summary.educationBalance,43566398.04532287);
  assert.equal(s.summary.firstLiquidityShortfallMonth,null);
  assert.equal(s.summary.firstCashFloorBreachMonth,'2027-03');
});
test('without recovery floor, six missed contributions reduce future education by exactly 1.8 million',()=>{
  const r=plan({cashFloor:0}); near(r.baseline.stress.summary.educationBalance,44300000);
});
test('mandatory deficits consume earmarks and then record unpaid obligations, not negative hidden cash',()=>{
  const r=runPlan({...zero,educationDate:'2027-01',cash:200,educationEarmark:150,educationTarget:1000,
    netIncome:0,livingExpenses:300,loanBalance:1200,loanAnnualRatePct:12,loanMonths:12});
  assert.equal(r.ok,true); const row=r.baseline.normal.path[1];
  assert.equal(row.cash,0); assert.equal(row.educationBalance,0); assert.equal(row.educationWithdrawal,150);
  assert.equal(row.unpaidLiving,100); near(row.unpaidInterest,12);
  near(row.loanBalance,1200); near(row.netWorth,-1312);
  assert.ok(row.loanArrears>0); assert.equal(r.baseline.normal.summary.firstLiquidityShortfallMonth,'2026-12');
});
test('arrears are repaid upon income recovery without double-counting principal liabilities',()=>{
  const r=runPlan({...zero,cash:0,netIncome:500,livingExpenses:100,loanBalance:1200,
    loanAnnualRatePct:12,loanMonths:12,stressMonths:1,stressIncomeLoss:500});
  const first=r.baseline.stress.path[1], second=r.baseline.stress.path[2];
  assert.equal(first.unpaidLiving,100); assert.ok(first.loanArrears>0);
  assert.equal(second.unpaidLiving,0); assert.equal(second.loanArrears,0); assert.equal(second.unpaidInterest,0);
  near(second.netWorth,zero.cash+500-200-24-1200);
});
test('cash floor constrains elective funding but never fabricates cash or prevents mandatory spending',()=>{
  const r=runPlan({...zero,netIncome:100,livingExpenses:200,cash:100,cashFloor:500});
  near(r.baseline.normal.path[0].cash,100); near(r.baseline.normal.path[1].cash,0);
  assert.equal(r.baseline.normal.path[1].cashFloorShortfall,500);
  assert.equal(r.baseline.normal.path[2].unpaidLiving,100);
});
test('excess requested budget remains capped and warns instead of fabricating funding',()=>{
  const r=plan({extraMonthly:1e8}); assert.ok(r.warnings.length);
  for (const row of r.strategies[1].normal.path.slice(1,88)) assert.ok(row.extraUsed<=r.evidence.unallocatedMonthly+1e-5);
});
test('no stress is exactly normal and stress beyond comparison is labelled',()=>{
  const r=plan({stressMonths:0}); assert.deepEqual(r.baseline.normal,r.baseline.stress);
  const later=plan({stressStartMonth:'2034-03'});
  near(later.baseline.normal.summary.netWorth,later.baseline.stress.summary.netWorth);
  assert.ok(later.warnings.some(w=>w.includes('기준월 이후')));
});
test('600-month boundary is supported; nonpositive education scenario has no phantom earmark',()=>{
  const r=runPlan({...zero,educationDate:'2076-11',loanBalance:60000,loanMonths:600,cash:60000});
  assert.equal(r.ok,true); assert.equal(r.projectionMonths,600);
  assert.equal(r.baseline.normal.path.length,601); near(r.baseline.normal.summary.loanBalance,0);
  for (const s of r.strategies) assert.equal(s.normal.summary.educationBalance,0);
});
test('seeded heterogeneous customer ledgers obey resource, liability and net-worth invariants',()=>{
  let seed=9371;
  const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  for (let i=0;i<36;i++) {
    const cash=Math.floor(rand()*10000), earmark=Math.floor(cash*rand());
    const input={...zero,netIncome:Math.floor(rand()*2000),livingExpenses:Math.floor(rand()*1800),
      cash,educationEarmark:earmark,educationTarget:20000,educationMinimum:10000,
      educationMonthly:Math.floor(rand()*100),pensionMonthly:Math.floor(rand()*100),
      investmentMonthly:Math.floor(rand()*100),generalCashMonthly:Math.floor(rand()*100),
      extraMonthly:Math.floor(rand()*200),cashFloor:Math.floor(rand()*2000),
      loanBalance:Math.floor(rand()*20000)+1,loanAnnualRatePct:rand()*25,loanMonths:24,
      prepaymentFeePct:rand()*5,feeMonthsRemaining:6,stressMonths:3};
    input.stressIncomeLoss=input.netIncome*rand(); input.stressExpenseReduction=input.livingExpenses*rand();
    const r=runPlan(input); assert.equal(r.ok,true);
    for (const strategy of r.strategies) for (const mode of ['normal','stress']) {
      for (const row of strategy[mode].path) {
        assert.ok(row.cash>=-1e-6); assert.ok(row.loanBalance>=-1e-6);
        assert.ok(row.educationBalance<=row.cash+1e-6); assert.ok(row.educationBalance>=-1e-6);
        assert.ok(row.extraUsed<=input.extraMonthly+1e-6); assert.ok(Math.abs(row.identityError)<0.001);
        assert.ok(row.loanArrears<=row.loanBalance+row.unpaidInterest+1e-6);
      }
    }
  }
});
