// Presentation schema only. Financial validation and calculation live in core.js.
const money = (key, label, help = '', extra = {}) => ({ key, label, type: 'money', unit: '원', required: true, help, ...extra });
const number = (key, label, unit, help = '', extra = {}) => ({ key, label, type: 'number', unit, required: true, help, ...extra });
const month = (key, label, help = '') => ({ key, label, type: 'month', required: true, help });

export const FORM_SECTIONS = [
  { id: 'overview', title: '계획의 기본 정보', description: '이름은 선택 사항입니다. 계산 시작월부터 각 달의 현금흐름을 비교합니다.', open: true, fields: [
    { key: 'label', label: '계획 이름', type: 'text', required: false, placeholder: '구분하기 쉬운 이름', maxLength: 60 },
    month('startMonth', '계산 시작월', '첫 월의 수입·지출·상환이 발생하는 달입니다.'),
  ] },
  { id: 'budget', title: '매월 들어오고 나가는 돈', description: '세후 입금액과 월평균 생활비를 입력하세요. 주담대 상환과 저축 납입은 생활비에 중복해서 넣지 않습니다.', open: true, fields: [
    money('netIncome', '가구 세후 월소득', '함께 계획하는 가구원의 세후 소득 합계'),
    money('livingExpenses', '월 생활비', '현재 교육비·보험료·비정기지출의 월평균 포함'),
    money('educationMonthly', '현재 월 교육저축', '미래 교육목표에 배정하는 매월 납입액'),
    money('pensionMonthly', '현재 월 연금저축', '계속 납입할 개인 연금계좌의 월 합계'),
    money('investmentMonthly', '현재 월 일반투자', '연금 외 투자계좌에 매월 납입하는 금액'),
    money('generalCashMonthly', '현재 월 현금저축', '별도 목표 배정 없이 현금으로 쌓는 금액'),
    money('extraMonthly', '비교할 월 추가 배분액', '기존 납입 후 여유자금 안에서 세 대안을 동일한 추가 예산으로 비교합니다.', { fullWidth: true }),
  ] },
  { id: 'assets', title: '자산과 현금의 용도', description: '교육 준비금은 현금 합계의 일부입니다. 별도 자산으로 더하지 않습니다. 투자·연금·주택은 비상현금과 구분합니다.', fields: [
    money('cash', '사용 가능한 현금·예금', '교육 준비금을 포함한 현금성 원금 합계'),
    money('educationEarmark', '그중 현재 교육 준비금', '위 현금·예금에 포함된 교육목표 배정액'),
    money('cashFloor', '유지하려는 비상현금 하한', '고객이 정하는 기준입니다. 보편적 권장액은 아닙니다.'),
    money('investmentAssets', '일반 투자자산 평가액', '평가액이며 비상현금으로 자동 처분하지 않습니다.'),
    money('retirementAssets', '연금자산 평가액', '연금저축·IRP·DC 등, 이 계획에서는 중도인출하지 않습니다.'),
    money('homeValue', '보유 주택 평가액', '매각하지 않는 자산으로 구분합니다.'),
    money('otherAssets', '그 밖의 자산 평가액', '차량 등. 이 계획에서는 매각하지 않습니다.'),
  ] },
  { id: 'mortgage', title: '주택담보대출 약정', description: '원리금균등·무거치·동일 금리 조건으로 계산합니다. 실제 계약값 또는 명시한 가상 약정값을 입력하세요.', fields: [
    money('loanBalance', '현재 대출잔액', '대출이 없으면 대출 관련 항목을 모두 0으로 입력'),
    number('loanAnnualRatePct', '약정 연금리', '%', '예측금리나 은행의 실시간 견적이 아닙니다.'),
    number('loanMonths', '남은 상환기간', '개월', '현재 잔액을 모두 갚기까지 남은 월수'),
    number('prepaymentFeePct', '추가상환 수수료율', '%', '계약에 정한 수수료율. 면제이면 0'),
    number('feeMonthsRemaining', '수수료 적용 잔여기간', '개월', '이 기간의 추가상환에 수수료를 적용합니다. 면제이면 0'),
  ] },
  { id: 'education', title: '교육목표와 비교 시점', description: '목표는 해당 시점의 미래 명목금액입니다. 준비된 자금을 비교하며, 교육비를 실제 지출하는 사건은 포함하지 않습니다.', fields: [
    month('educationDate', '교육 준비금 비교월', '교육목표가 없어도 세 대안을 비교할 기준월이 필요합니다.'),
    money('educationTarget', '교육목표 금액', '목표가 없다면 0. 물가를 다시 가산하지 않습니다.'),
    money('educationMinimum', '교육목표의 최소 금액', '목표금액 이하여야 합니다. 목표가 없으면 0'),
  ] },
  { id: 'stress', title: '소득이 줄어드는 상황', description: '발생 확률을 예측하지 않는 가정 실험입니다. 이 기간에는 저축·투자·추가배분을 중단하고 주담대 의무상환을 계속 계산합니다. 지급하지 못한 금액은 미납으로 표시합니다.', fields: [
    month('stressStartMonth', '소득 감소 시작월', '계산 시작월 또는 그 이후의 달을 선택하세요.'),
    number('stressMonths', '소득 감소 지속기간', '개월', '한시적인 소득 감소가 이어지는 기간'),
    money('stressIncomeLoss', '줄어드는 월소득', '남은 소득이 아니라 감소하는 금액입니다.'),
    money('stressExpenseReduction', '줄일 수 있는 월 생활비', '생활비 중 이 기간에 실제로 조정할 금액'),
  ] },
];
export const INPUT_FIELDS = FORM_SECTIONS.flatMap(section => section.fields);
export const FIELD_MAP = Object.fromEntries(INPUT_FIELDS.map(field => [field.key, field]));
export const FINANCIAL_FIELDS = INPUT_FIELDS.filter(field => field.key !== 'label').map(field => field.key);
