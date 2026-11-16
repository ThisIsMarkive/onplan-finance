// Fixed evidence construction shared by the local subscription bridge and its tests.
// Customer labels, occupation, narratives, prompts and claimed client results are never forwarded.
import {runPlan} from './core.js';

export const EXPLANATION_SCHEMA={
  type:'object',additionalProperties:false,required:['sections'],properties:{sections:{
    type:'array',minItems:3,maxItems:5,items:{type:'object',additionalProperties:false,
      required:['title','text','evidenceIds'],properties:{
        title:{type:'string',minLength:1,maxLength:80},
        text:{type:'string',minLength:1,maxLength:1800},
        evidenceIds:{type:'array',minItems:1,maxItems:12,items:{type:'string',pattern:'^E[1-9][0-9]*$'}},
      },
    },
  }},
};

const money=value=>`${Math.round(value).toLocaleString('ko-KR')}원`;
export function buildExplanationContext(raw){
  const result=runPlan(raw);
  if(!result.ok)return result;
  const normal=id=>result.strategies.find(s=>s.id===id).normal.summary;
  const stress=id=>result.strategies.find(s=>s.id===id).stress.summary;
  const evidence=[];
  const add=(title,value,unit='KRW')=>{
    const formatted=unit==='KRW'?money(value):unit==='months'?`${value}개월`:String(value);
    evidence.push({id:`E${evidence.length+1}`,title,value,formatted,unit,source:'src/core.js · 동일 입력 월별 원장 재계산'});
  };
  add('기준 월 원리금',result.evidence.monthlyPayment);
  add('최초 순자산',result.evidence.initialNetWorth);
  add('기존 납입 후 미배정 월예산',result.evidence.unallocatedMonthly);
  add('대안별 동일 추가 월예산',result.input.extraMonthly);
  add('비교 기준월',result.comparisonMonth,'month');
  add('비교 기간',result.comparisonMonths,'months');
  add('정상 현금안 총예금 · 교육배정 포함',normal('cash').cash);
  add('정상 현금안 비배정예금',normal('cash').freeCash);
  add('정상 현금안 교육배정금',normal('cash').educationBalance);
  add('정상 현금안 대출잔액',normal('cash').loanBalance);
  add('정상 추가상환안 대출잔액',normal('debt').loanBalance);
  add('정상 현금안 누적 발생이자',normal('cash').cumulativeInterest);
  add('정상 추가상환안 누적 발생이자',normal('debt').cumulativeInterest);
  add('정상 추가상환안 누적 수수료',normal('debt').cumulativeFees);
  add('기준월까지 현금안 대비 추가상환안 이자차이에서 수수료를 뺀 값',
    normal('cash').cumulativeInterest-normal('debt').cumulativeInterest-normal('debt').cumulativeFees);
  add('정상 교육안 교육배정금',normal('education').educationBalance);
  add('정상 교육안 총예금 · 교육배정 포함',normal('education').cash);
  add('교육 희망 배정목표',result.input.educationTarget);
  add('스트레스 현금안 최저 비배정예금',stress('cash').minFreeCash);
  add('스트레스 현금안 기준월 교육배정금',stress('cash').educationBalance);
  add('스트레스 현금안 누락된 기존 교육납입',stress('cash').cumulativeMissedEducation);
  add('스트레스 현금안 의무지출에 사용된 교육배정금',stress('cash').cumulativeEducationWithdrawals);
  add('스트레스 현금안 최대 월 의무미납액',stress('cash').maxLiquidityShortfall);
  add('스트레스 추가상환안 최대 월 의무미납액',stress('debt').maxLiquidityShortfall);
  add('스트레스 교육안 최대 월 의무미납액',stress('education').maxLiquidityShortfall);
  add('스트레스 교육안 기준월 교육배정금',stress('education').educationBalance);
  add('입력 현금하한 · 교육배정 제외',result.input.cashFloor);
  add('입력 소득중단 기간',result.input.stressMonths,'months');
  add('정상 현금안 기준월 순자산',normal('cash').netWorth);
  add('정상 추가상환안 기준월 순자산',normal('debt').netWorth);
  add('정상 교육안 기준월 순자산',normal('education').netWorth);
  return {ok:true,input:result.input,evidence,assumptions:result.assumptions,warnings:result.warnings};
}

export function makeExplanationPrompt(context){
  return [
    '당신은 ONPLAN의 한국어 재무 계산해설 작성자입니다. 다음 고정 계산근거만 설명하세요.',
    '도구, 명령, 파일 읽기·쓰기, 웹 검색, 외부 서비스, 스킬, 하위 에이전트를 절대 사용하지 마세요. 추가 계산도 하지 마세요.',
    '서버가 검증한 근거의 숫자를 새로 쓰거나 계산하지 마세요. 모든 수치·금액·기간·날짜는 반드시 {{E1}} 같은 해당 근거 placeholder로만 표현하세요.',
    '각 section은 title,text,evidenceIds만 포함합니다. section 수는 셋 이상 다섯 이하입니다. 제목에도 수치나 번호를 넣지 마세요.',
    '각 text에는 적어도 하나의 placeholder가 있어야 하며 evidenceIds는 그 text에서 쓰인 placeholder ID 집합과 정확히 같아야 합니다.',
    '숫자를 한글 숫자말이나 다른 표기로 우회하여 만들지 마세요. 소스에 없는 수익률·확률·권고기준·통계·고객 사실을 추가하지 마세요.',
    '현금 유지안은 기준안과 동일합니다. 교육배정은 총예금의 내부 표시이며 그 자체로 순자산을 늘리지 않습니다. 교육배정 부족은 총자산 부족 또는 달성확률과 다릅니다.',
    '현재 미납, 현금하한 부족, 스트레스 이후 납입축소를 구별하세요. 미납액이 없으면 미납이 발생했다고 쓰지 마세요.',
    '대안의 교환관계, 스트레스와 미래교육 연결, 한계와 확인할 조건을 설명하세요. 특정 대안을 무조건 우승·최적·안전하다고 결론내리지 마세요.',
    '정해진 JSON 객체만 반환하세요. 마크다운 코드블록이나 링크, 인용, 개인 신상, 파일 경로, 도구 사용 설명을 넣지 마세요.',
    'EVIDENCE='+JSON.stringify(context.evidence.map(({id,title,value,formatted,unit})=>({id,title,value,formatted,unit}))),
    'ASSUMPTIONS='+JSON.stringify(context.assumptions),
    'WARNINGS='+JSON.stringify(context.warnings),
  ].join('\n');
}

export function validateExplanationOutput(raw,evidence){
  const fail=message=>({ok:false,error:'AI_OUTPUT_INVALID',message});
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='sections')return fail('AI 응답 구조가 올바르지 않습니다.');
  if(!Array.isArray(raw.sections)||raw.sections.length<3||raw.sections.length>5)return fail('AI 설명 항목 수가 올바르지 않습니다.');
  const lookup=new Map(evidence.map(e=>[e.id,e]));
  const sections=[];
  for(const section of raw.sections){
    if(!section||typeof section!=='object'||Array.isArray(section)||Object.keys(section).sort().join(',')!=='evidenceIds,text,title')return fail('AI 설명 항목 구조가 올바르지 않습니다.');
    const {title,text,evidenceIds}=section;
    if(typeof title!=='string'||!title.trim()||title.length>80||typeof text!=='string'||!text.trim()||text.length>1800)return fail('AI 설명 길이가 올바르지 않습니다.');
    if(!Array.isArray(evidenceIds)||evidenceIds.length<1||evidenceIds.length>12||new Set(evidenceIds).size!==evidenceIds.length||evidenceIds.some(id=>!lookup.has(id)))return fail('AI 설명에 확인되지 않은 근거가 있습니다.');
    const references=[...text.matchAll(/\{\{(E[1-9]\d*)\}\}/g)].map(match=>match[1]);
    const unique=[...new Set(references)].sort();
    if(!references.length||JSON.stringify(unique)!==JSON.stringify([...evidenceIds].sort()))return fail('AI 문장과 계산근거가 일치하지 않습니다.');
    const residual=text.replace(/\{\{E[1-9]\d*\}\}/g,'');
    if(/[{}]/.test(residual)||/[{}]/.test(title)||/\p{N}/u.test(title+residual))return fail('AI가 검증되지 않은 수치 또는 참조를 추가했습니다.');
    if(/https?:|www\.|<[^>]*>|```/i.test(title+text))return fail('AI가 허용되지 않은 링크 또는 형식을 추가했습니다.');
    sections.push({title:title.trim(),text:text.replace(/\{\{(E[1-9]\d*)\}\}/g,(_,id)=>lookup.get(id).formatted).trim(),evidenceIds:[...evidenceIds]});
  }
  return {ok:true,sections};
}
