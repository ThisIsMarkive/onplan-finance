/** Monthly, deterministic household ledger. All amounts KRW, rates percent/year.
 * Original implementation; pinned MIT TVM reference is used only by Python QA.
 * No bank-day rounding, taxes, investment return, inflation or default-law model.
 */
export const MODEL_VERSION = '1.0.0';
export const NUMERIC_FIELDS = Object.freeze([
  'netIncome','livingExpenses','cash','educationEarmark','investmentAssets',
  'retirementAssets','homeValue','otherAssets','loanBalance','loanAnnualRatePct',
  'loanMonths','prepaymentFeePct','feeMonthsRemaining','educationTarget',
  'educationMinimum','educationMonthly','pensionMonthly','investmentMonthly',
  'generalCashMonthly','extraMonthly','cashFloor','stressIncomeLoss',
  'stressExpenseReduction','stressMonths',
]);
export const DATE_FIELDS = Object.freeze(['startMonth','educationDate','stressStartMonth']);
const INTEGER_FIELDS = new Set(['loanMonths','feeMonthsRemaining','stressMonths']);
const EPS = 1e-6;
const MAX_MONEY = 1e13;

function monthIndex(s) {
  if (typeof s !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return null;
  const [y,m] = s.split('-').map(Number);
  return y >= 1900 && y <= 2200 ? y*12+m-1 : null;
}
function monthLabel(index) {
  return `${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`;
}
export function monthlyPayment(principal, annualRatePct, months) {
  if (principal === 0) return 0;
  const r = annualRatePct/1200;
  return r === 0 ? principal/months : principal*r/(-Math.expm1(-months*Math.log1p(r)));
}

/** Never coerces a blank, boolean, array or null to zero. */
export function validateInputs(raw) {
  const errors = [], input = {};
  const fail = (field,message) => errors.push({field,message});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {valid:false,errors:[{field:'input',message:'입력 객체가 필요합니다.'}],input:null};
  }
  for (const field of NUMERIC_FIELDS) {
    const v = raw[field];
    if ((typeof v !== 'number' && typeof v !== 'string') ||
        (typeof v === 'string' && (!v.trim() || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v.trim())))) {
      fail(field,'빈칸을 허용하지 않습니다. 해당 없음은 0을 입력하세요.'); continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) {
      fail(field,'0 이상 10조원 이하의 유한한 수를 입력하세요.'); continue;
    }
    if (INTEGER_FIELDS.has(field) && (!Number.isInteger(n) || n > 600)) {
      fail(field,'개월 수는 0부터 600까지 정수로 입력하세요.'); continue;
    }
    input[field] = n;
  }
  for (const field of DATE_FIELDS) {
    if (monthIndex(raw[field]) === null) fail(field,'1900~2200년의 YYYY-MM 형식 기준월이 필요합니다.');
    else input[field] = raw[field];
  }
  if (errors.length) return {valid:false,errors,input:null};
  if (input.loanAnnualRatePct > 100) fail('loanAnnualRatePct','연 이율은 0~100% 범위로 입력하세요.');
  if (input.prepaymentFeePct > 100) fail('prepaymentFeePct','수수료율은 0~100% 범위로 입력하세요.');
  if (input.educationEarmark > input.cash) fail('educationEarmark','교육 배정금은 총예금에 포함되어야 합니다.');
  if (input.educationMinimum > input.educationTarget) fail('educationMinimum','최소 목표는 희망 목표 이하여야 합니다.');
  if (input.educationTarget === 0 && (input.educationMinimum || input.educationEarmark || input.educationMonthly))
    fail('educationTarget','교육 목표가 없으면 교육 최소액·배정금·월납입도 0이어야 합니다.');
  if (input.loanBalance > 0 && input.loanMonths < 1) fail('loanMonths','대출 잔액이 있으면 남은 개월 수가 필요합니다.');
  if (input.loanBalance === 0 && (input.loanMonths || input.loanAnnualRatePct || input.prepaymentFeePct || input.feeMonthsRemaining))
    fail('loanBalance','대출이 없으면 이율·남은 개월·수수료율·수수료 잔여개월도 0이어야 합니다.');
  if (input.feeMonthsRemaining > input.loanMonths) fail('feeMonthsRemaining','수수료 잔여기간은 대출 잔여기간 이하여야 합니다.');
  if (input.prepaymentFeePct > 0 && input.feeMonthsRemaining === 0) fail('feeMonthsRemaining','수수료율이 양수이면 적용 잔여기간을 입력하세요.');
  if (input.stressIncomeLoss > input.netIncome) fail('stressIncomeLoss','소득 감소액은 현재 소득 이하여야 합니다.');
  if (input.stressExpenseReduction > input.livingExpenses) fail('stressExpenseReduction','지출 감소액은 현재 생활비 이하여야 합니다.');
  const start = monthIndex(input.startMonth);
  const comparisonMonths = monthIndex(input.educationDate)-start+1;
  const stressStart = monthIndex(input.stressStartMonth)-start+1;
  if (comparisonMonths < 1 || comparisonMonths > 600) fail('educationDate','비교 기준월은 시작월부터 600개월 이내여야 합니다.');
  if (stressStart < 1 || stressStart > 600 || (input.stressMonths && stressStart+input.stressMonths-1 > 600))
    fail('stressStartMonth','스트레스 시작·종료는 시작월부터 600개월 이내여야 합니다.');
  return {valid:errors.length === 0,errors,input:errors.length ? null : input};
}

const ASSUMPTIONS = Object.freeze([
  '금액은 원, 입력 소득·지출·금리는 매월 고정 반복합니다. 투자·예금 수익률과 물가상승률은 0%입니다.',
  '월말 예산 모형입니다. 월내 급여일·만기일·지출일, 은행 원 단위 반올림·일할이자·세금은 반영하지 않습니다.',
  'cash는 교육 배정금을 포함한 총예금입니다. 교육 배정은 자산 추가가 아닌 예금 내부 표시입니다.',
  '의무지출은 비배정예금부터 지급하고 부족하면 교육 배정금을 사용합니다. 투자·연금·주택 매각은 하지 않습니다.',
  '의무지출 뒤 기존 교육·연금·투자 납입을 동일 비율로 충족한 후 추가 월예산을 적용합니다. 일반예금 적립액은 잉여예금에 포함됩니다.',
  '현금 하한은 추가 자산이 아닙니다. 자발적 납입만 제한하며 의무지출은 하한 아래로 예금을 사용할 수 있습니다.',
  '소득 중단 기간에는 모든 자발적 납입과 추가배분을 중단합니다. 놓친 교육·연금·투자 납입을 자동 보충하지 않습니다.',
  '추가상환은 기존 월 원리금을 유지해 만기를 줄입니다. 수수료는 입력 잔여개월 동안 월별 선형 감소하며 추가원금+수수료가 추가 월예산 이내입니다.',
  '교육 납입은 희망 목표액까지, 비교 기준월까지 시행합니다. 실제 등록금 지출 이벤트는 모형에 없으며 기준월 준비금을 비교합니다.',
  '미지급 생활비와 미지급 이자는 별도 채무로 남기며 연체 원금은 대출 잔액에 이미 포함됩니다. 연체이율·압류·강제기한이익상실은 계산하지 않습니다.',
  '비교 기준월 이후 대출 만기는 동일 소득·지출·금리 조건의 참고값입니다. 퇴직·연금수령·은퇴 적정성을 모델링하지 않습니다.',
]);

function simulate(x, policy, stressed, projectionMonths, comparisonMonths) {
  const payment = monthlyPayment(x.loanBalance,x.loanAnnualRatePct,x.loanMonths);
  const rate = x.loanAnnualRatePct/1200;
  const start = monthIndex(x.startMonth), stressStart = monthIndex(x.stressStartMonth)-start+1;
  let cash=x.cash, earmark=x.educationEarmark, investments=x.investmentAssets;
  let retirement=x.retirementAssets, principal=x.loanBalance;
  let interestArrears=0, livingArrears=0, installmentArrears=0;
  let cumulativeInterest=0, cumulativeFees=0, cumulativeIncome=0, cumulativeLiving=0;
  let cumulativeEducationWithdrawals=0, cumulativeMissedEducation=0;
  let cumulativePension=0, cumulativeInvestment=0, cumulativeEducation=0, cumulativeExtra=0;
  let maxIdentityError=0, payoffMonth=x.loanBalance === 0 ? 0 : null;
  const initialNetWorth = x.cash+x.investmentAssets+x.retirementAssets+x.homeValue+x.otherAssets-x.loanBalance;
  const path=[];
  const state = () => ({cash,educationBalance:earmark,freeCash:cash-earmark,
    investmentAssets:investments,retirementAssets:retirement,loanBalance:principal,
    unpaidInterest:interestArrears,unpaidLiving:livingArrears,loanArrears:installmentArrears,
    netWorth:cash+investments+retirement+x.homeValue+x.otherAssets-principal-interestArrears-livingArrears,
    cumulativeInterest,cumulativeFees,cumulativeEducationWithdrawals,cumulativeMissedEducation,
    cumulativePension,cumulativeInvestment,cumulativeEducation,cumulativeExtra,
  });
  path.push({month:0,date:x.startMonth,isInitial:true,isStress:false,...state(),income:0,livingExpense:0,
    loanPayment:0,interest:0,principalPayment:0,extraPrincipal:0,fee:0,educationContribution:0,
    pensionContribution:0,investmentContribution:0,extraEducation:0,extraUsed:0,extraUnused:0,
    educationWithdrawal:0,missedEducation:0,liquidityShortfall:0,cashFloorShortfall:Math.max(0,x.cashFloor-(cash-earmark)),
    identityError:0,savingsPaused:false});
  for (let m=1;m<=projectionMonths;m++) {
    const isStress = stressed && m>=stressStart && m<stressStart+x.stressMonths;
    const income=x.netIncome-(isStress ? x.stressIncomeLoss : 0);
    const livingExpense=x.livingExpenses-(isStress ? x.stressExpenseReduction : 0);
    const beforeEarmark=earmark;
    cash+=income;
    cumulativeIncome+=income; cumulativeLiving+=livingExpense;
    // All current living consumption is expensed even if unpaid; unpaid amount is a liability.
    const livingDue=livingArrears+livingExpense;
    const livingPaid=Math.min(cash,livingDue);
    cash-=livingPaid; livingArrears=livingDue-livingPaid;
    const interest=principal*rate;
    cumulativeInterest+=interest; interestArrears+=interest;
    const totalLoanOwed=principal+interestArrears;
    const loanDue=m>=x.loanMonths ? totalLoanOwed : Math.min(totalLoanOwed,payment+installmentArrears);
    const loanPaid=Math.min(cash,loanDue);
    cash-=loanPaid;
    const paidInterest=Math.min(loanPaid,interestArrears);
    interestArrears-=paidInterest;
    const principalPaid=Math.min(principal,Math.max(0,loanPaid-paidInterest));
    principal-=principalPaid;
    installmentArrears=Math.max(0,loanDue-loanPaid);
    earmark=Math.min(earmark,cash);
    const educationWithdrawal=beforeEarmark-earmark;
    cumulativeEducationWithdrawals+=educationWithdrawal;
    const liquidityShortfall=livingArrears+installmentArrears;
    // No initial savings is invented or spent to sustain elective contributions.
    const monthlySurplus=Math.max(0,income-livingPaid-loanPaid);
    let available=Math.min(Math.max(0,cash-earmark-x.cashFloor),Math.max(0,monthlySurplus-x.generalCashMonthly));
    const educationPlanned=m<=comparisonMonths ? Math.min(x.educationMonthly,Math.max(0,x.educationTarget-earmark)) : 0;
    const voluntaryPlanned=educationPlanned+x.pensionMonthly+x.investmentMonthly;
    const scale=isStress || liquidityShortfall>EPS ? 0 : voluntaryPlanned>0 ? Math.min(1,available/voluntaryPlanned) : 1;
    const educationContribution=educationPlanned*scale;
    const pensionContribution=x.pensionMonthly*scale;
    const investmentContribution=x.investmentMonthly*scale;
    earmark+=educationContribution; retirement+=pensionContribution; investments+=investmentContribution;
    cash-=pensionContribution+investmentContribution;
    available=Math.max(0,available-educationContribution-pensionContribution-investmentContribution);
    const missedEducation=educationPlanned-educationContribution;
    cumulativeMissedEducation+=missedEducation;
    cumulativePension+=pensionContribution; cumulativeInvestment+=investmentContribution; cumulativeEducation+=educationContribution;
    let extraPrincipal=0,fee=0,extraEducation=0;
    const extraBudget=isStress || liquidityShortfall>EPS ? 0 : Math.min(x.extraMonthly,available);
    if (policy==='debt' && principal>0) {
      const feeRate=x.feeMonthsRemaining>0 ? x.prepaymentFeePct/100*Math.max(0,(x.feeMonthsRemaining-m+1)/x.feeMonthsRemaining) : 0;
      extraPrincipal=Math.min(principal,extraBudget/(1+feeRate));
      fee=extraPrincipal*feeRate;
      cash-=extraPrincipal+fee; principal-=extraPrincipal;
      cumulativeFees+=fee;
    } else if (policy==='education' && m<=comparisonMonths) {
      extraEducation=Math.min(extraBudget,Math.max(0,x.educationTarget-earmark));
      earmark+=extraEducation; cumulativeEducation+=extraEducation;
    }
    const extraUsed=extraPrincipal+fee+extraEducation;
    cumulativeExtra+=extraUsed;
    if (principal<EPS && interestArrears<EPS) {
      principal=0; interestArrears=0; installmentArrears=0;
      if (payoffMonth===null) payoffMonth=m;
    }
    const s=state();
    const expectedNetWorth=initialNetWorth+cumulativeIncome-cumulativeLiving-cumulativeInterest-cumulativeFees;
    const identityError=s.netWorth-expectedNetWorth;
    maxIdentityError=Math.max(maxIdentityError,Math.abs(identityError));
    path.push({month:m,date:monthLabel(start+m-1),isInitial:false,isStress,...s,
      income,livingExpense,livingPaid,loanPayment:loanPaid,loanPaymentDue:loanDue,interest,
      principalPayment:principalPaid,extraPrincipal,fee,educationContribution,pensionContribution,
      investmentContribution,extraEducation,extraUsed,extraUnused:x.extraMonthly-extraUsed,
      educationWithdrawal,missedEducation,liquidityShortfall,
      cashFloorShortfall:Math.max(0,x.cashFloor-s.freeCash),identityError,savingsPaused:scale===0,
    });
  }
  const point=path[comparisonMonths];
  const comparisonPath=path.slice(0,comparisonMonths+1);
  const firstShortfall=comparisonPath.find(p=>p.liquidityShortfall>EPS);
  const firstFloor=comparisonPath.find(p=>p.cashFloorShortfall>EPS);
  return {summary:{...point,comparisonMonth:x.educationDate,comparisonMonths,monthlyPayment:payment,
    initialNetWorth,educationTarget:x.educationTarget,educationMinimum:x.educationMinimum,
    educationGap:Math.max(0,x.educationTarget-point.educationBalance),
    educationMinimumGap:Math.max(0,x.educationMinimum-point.educationBalance),
    educationTargetMet:point.educationBalance+EPS>=x.educationTarget,
    educationMinimumMet:point.educationBalance+EPS>=x.educationMinimum,
    minFreeCash:Math.min(...comparisonPath.map(p=>p.freeCash)),
    minCash:Math.min(...comparisonPath.map(p=>p.cash)),
    firstLiquidityShortfallMonth:firstShortfall?.date??null,
    firstCashFloorBreachMonth:firstFloor?.date??null,
    monthsWithUnpaidObligations:comparisonPath.filter(p=>p.liquidityShortfall>EPS).length,
    maxLiquidityShortfall:Math.max(...comparisonPath.map(p=>p.liquidityShortfall)),
    payoffMonth,payoffDate:payoffMonth ? monthLabel(start+payoffMonth-1) : null,
    projectionEndLoanBalance:path.at(-1).loanBalance,
    projectionEndUnpaidInterest:path.at(-1).unpaidInterest,
    lifetimeInterestWithinProjection:cumulativeInterest,lifetimeFeesWithinProjection:cumulativeFees,
    maxIdentityError,
  },path};
}

/** Expected invalid customer input is a value result, not an exception. */
export function runPlan(raw) {
  const validation=validateInputs(raw);
  if (!validation.valid) return {ok:false,errors:validation.errors};
  const input=validation.input;
  const start=monthIndex(input.startMonth);
  const comparisonMonths=monthIndex(input.educationDate)-start+1;
  const stressEnd=input.stressMonths ? monthIndex(input.stressStartMonth)-start+input.stressMonths : 0;
  const projectionMonths=Math.max(comparisonMonths,input.loanMonths,stressEnd);
  const pair=id=>({normal:simulate(input,id,false,projectionMonths,comparisonMonths),stress:simulate(input,id,true,projectionMonths,comparisonMonths)});
  const baseline=pair('cash');
  const strategies=[{id:'cash',label:'현금 유지',...baseline},
    {id:'debt',label:'추가상환',...pair('debt')},
    {id:'education',label:'교육저축',...pair('education')}];
  const pmt=baseline.normal.summary.monthlyPayment;
  const surplusBeforeSavings=input.netIncome-input.livingExpenses-pmt;
  const plannedSavings=input.educationMonthly+input.pensionMonthly+input.investmentMonthly+input.generalCashMonthly;
  const unallocatedMonthly=surplusBeforeSavings-plannedSavings;
  const warnings=[];
  if (surplusBeforeSavings<0) warnings.push('현재 월소득만으로 의무지출을 충족하지 못합니다. 예금 사용과 미납 경로를 확인하세요.');
  if (unallocatedMonthly<input.extraMonthly) warnings.push('추가 월예산이 현재 잉여예산보다 큽니다. 실제 배분액은 가용금액으로 제한됩니다.');
  if (input.cash-input.educationEarmark<input.cashFloor) warnings.push('시작 비배정예금이 현금 하한보다 적습니다. 하한 부족분을 자산으로 만들지 않습니다.');
  if (input.stressMonths===0) warnings.push('스트레스 기간이 0개월이므로 스트레스 경로는 정상 경로와 같습니다.');
  if (stressEnd>comparisonMonths) warnings.push('스트레스 일부 또는 전부가 비교 기준월 이후입니다. 기준월 요약과 전체 원장을 구분하세요.');
  return {ok:true,modelVersion:MODEL_VERSION,input,comparisonMonth:input.educationDate,comparisonMonths,projectionMonths,
    baseline,strategies,assumptions:[...ASSUMPTIONS],warnings,
    evidence:{monthlyPayment:pmt,surplusBeforeSavings,plannedSavings,unallocatedMonthly,
      requestedExtraMonthly:input.extraMonthly,cashAlternativeIdenticalToBaseline:true,
      initialNetWorth:baseline.normal.summary.initialNetWorth,
      cashIncludesEducationEarmark:true,returnAssumptionPct:0,
      ledgerIdentity:'순자산 = 최초 순자산 + 누적 소득 − 누적 발생 생활비 − 누적 발생 이자 − 누적 수수료',
      maxLedgerIdentityError:Math.max(...strategies.flatMap(s=>[s.normal.summary.maxIdentityError,s.stress.summary.maxIdentityError])),
      comparisonScope:'비교 기준월의 동일 시작자산·소득·지출·추가월예산. 목표확률 또는 금융상품 수익 검증 아님.',
    },
  };
}
