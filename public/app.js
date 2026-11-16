import { validateInputs, runPlan } from '/src/core.js';
import { FORM_SECTIONS, INPUT_FIELDS, FIELD_MAP, FINANCIAL_FIELDS } from '/src/form-schema.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('ko-KR') + '원' : '—';
const amount = value => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('ko-KR') : '—';
const compact = value => {
  if (!Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) >= 100000000) return `${(n / 100000000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}<span>억원</span>`;
  if (Math.abs(n) >= 10000) return `${(n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}<span>만원</span>`;
  return `${amount(n)}<span>원</span>`;
};
const monthLabel = value => /^\d{4}-\d{2}$/.test(String(value)) ? `${value.slice(0, 4)}년 ${Number(value.slice(5))}월` : String(value ?? '');
const state = { result: null, signature: null, stale: false, aiStatus: null, aiResult: null, aiBusy: false, aiSequence: 0, calculating: false };
let activeView = 'input';
let messageTimer;

function fieldHtml(field) {
  const type = field.type === 'month' ? 'month' : 'text';
  const help = field.help ? `<p class="field-help" id="help-${field.key}">${esc(field.help)}</p>` : '';
  return `<div class="field ${field.fullWidth ? 'full-width' : ''}" data-field="${field.key}"><label for="field-${field.key}">${esc(field.label)} ${field.required ? '<span class="required-marker" aria-hidden="true">*</span>' : '<span class="optional-label">선택</span>'}</label><div class="field-input-wrap"><input id="field-${field.key}" name="${field.key}" type="${type}" ${field.type === 'money' || field.type === 'number' ? 'inputmode="decimal"' : ''} ${field.unit ? 'class="has-unit"' : ''} ${field.required ? 'required' : ''} ${field.maxLength ? `maxlength="${field.maxLength}"` : ''} ${field.placeholder ? `placeholder="${esc(field.placeholder)}"` : ''} autocomplete="off" ${field.help ? `aria-describedby="help-${field.key}"` : ''}>${field.unit ? `<span class="field-unit">${esc(field.unit)}</span>` : ''}</div>${help}<div id="error-${field.key}" class="field-error" hidden></div></div>`;
}

function buildForm() {
  $('#form-sections').innerHTML = FORM_SECTIONS.map((section, i) => `<details class="form-section" data-section="${section.id}" ${section.open ? 'open' : ''}><summary><span class="section-number">${String(i + 1).padStart(2, '0')}</span><h3>${esc(section.title)}</h3><span class="section-summary-status" id="count-${section.id}"></span><span class="chevron" aria-hidden="true"></span></summary><div class="section-body"><p class="section-hint">${esc(section.description)}</p><div class="fields-grid">${section.fields.map(fieldHtml).join('')}</div></div></details>`).join('');
  $('#section-checklist').innerHTML = FORM_SECTIONS.map(section => `<div class="checklist-row" id="check-${section.id}"><span>${esc(section.title)}</span><span class="checklist-mark" aria-hidden="true">·</span></div>`).join('');
}

function readRaw() {
  return Object.fromEntries(INPUT_FIELDS.map(field => {
    const value = $(`#field-${field.key}`).value.trim();
    return [field.key, ['money', 'number'].includes(field.type) ? value.replace(/,/g, '') : value];
  }));
}

function financialInput(raw = readRaw()) { return Object.fromEntries(FINANCIAL_FIELDS.map(key => [key, raw[key]])); }
function signature() { return JSON.stringify(readRaw()); }

function updateProgress() {
  let total = 0, complete = 0;
  FORM_SECTIONS.forEach(section => {
    const required = section.fields.filter(field => field.required);
    const filled = required.filter(field => $(`#field-${field.key}`).value.trim() !== '').length;
    total += required.length; complete += filled;
    $(`#count-${section.id}`).textContent = `${filled} / ${required.length}`;
    const row = $(`#check-${section.id}`);
    row.classList.toggle('complete', filled === required.length);
    row.querySelector('.checklist-mark').textContent = filled === required.length ? '✓' : '·';
  });
  const percent = Math.round(complete / total * 100);
  $('#completion-number').textContent = `${percent}%`;
  $('#completion-bar').style.width = `${percent}%`;
  $('#completion-text').textContent = complete === total ? '필수 항목이 채워졌어요. 계산에서 값의 조건을 확인합니다.' : `필수 ${total}개 중 ${complete}개를 입력했어요.`;
  $('#plan-label').textContent = $('#field-label').value.trim() || '새로운 계획';
}

function showMessage(text, kind = 'success') {
  clearTimeout(messageTimer);
  const element = $('#global-message');
  element.textContent = text; element.className = `message ${kind}`; element.hidden = false;
  messageTimer = setTimeout(() => { element.hidden = true; }, 7000);
}

function showView(view, focus = false) {
  activeView = view;
  document.querySelectorAll('.view-panel').forEach(panel => { panel.hidden = panel.id !== `view-${view}`; });
  document.querySelectorAll('.view-tab').forEach(tab => {
    const selected = tab.dataset.view === view;
    tab.classList.toggle('active', selected);
    if (selected) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  });
  $('#stale-notice').hidden = !state.stale || view === 'input' || view === 'sources';
  if (focus) $('.view-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearErrors() {
  $('#form-errors').hidden = true;
  document.querySelectorAll('.field-error').forEach(element => { element.hidden = true; element.textContent = ''; });
  INPUT_FIELDS.forEach(field => {
    const input = $(`#field-${field.key}`);
    input.removeAttribute('aria-invalid');
    if (field.help) input.setAttribute('aria-describedby', `help-${field.key}`); else input.removeAttribute('aria-describedby');
  });
}

function showErrors(errors) {
  clearErrors();
  const list = Array.isArray(errors) ? errors : [{ message: '입력값을 확인해 주세요.' }];
  list.forEach(error => {
    const key = error.field;
    if (!FIELD_MAP[key]) return;
    const input = $(`#field-${key}`), element = $(`#error-${key}`);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${FIELD_MAP[key].help ? `help-${key} ` : ''}error-${key}`);
    element.textContent = error.message; element.hidden = false;
    input.closest('details').open = true;
  });
  $('#form-errors').innerHTML = `<div><strong>계산 전에 ${list.length}개 항목을 확인해 주세요.</strong><ul>${list.map(error => `<li>${esc(FIELD_MAP[error.field]?.label ? FIELD_MAP[error.field].label + ': ' : '')}${esc(error.message)}</li>`).join('')}</ul></div>`;
  $('#form-errors').hidden = false;
  showView('input');
  const first = list.find(error => FIELD_MAP[error.field]);
  if (first) $(`#field-${first.field}`).focus(); else $('#form-errors').scrollIntoView({ block: 'center' });
}

function updateStale() {
  state.stale = Boolean(state.result && state.signature !== signature());
  $('#stale-notice').hidden = !state.stale || ['input', 'sources'].includes(activeView);
  $('#results-content').classList.toggle('stale-result', state.stale);
  $('#plan-state').textContent = state.stale ? '입력 변경 · 다시 계산 필요' : state.result ? '계산 완료 · 현재 입력 기준' : '아직 계산하지 않았어요';
  updateAIButton();
}

function inputChanged(event) {
  if (event?.target?.matches('input')) {
    event.target.removeAttribute('aria-invalid');
    const error = $(`#error-${event.target.name}`); if (error) error.hidden = true;
  }
  state.aiSequence++; state.aiResult = null; state.aiBusy = false;
  $('#ai-output').innerHTML = '';
  updateProgress(); updateStale();
}

function emptyHtml(title, description) {
  return `<div class="empty-state"><div class="empty-illustration" aria-hidden="true">↗</div><h3>${esc(title)}</h3><p>${esc(description)}</p><button type="button" class="button button-primary" data-go-input>입력부터 시작하기 <span aria-hidden="true">→</span></button></div>`;
}

function resetResults() {
  state.result = null; state.signature = null; state.stale = false;
  state.aiSequence++; state.aiResult = null; state.aiBusy = false;
  $('#results-content').innerHTML = emptyHtml('비교할 계획을 기다리고 있어요', '입력을 완료하면 현금흐름과 세 대안의 차이를 한눈에 볼 수 있습니다.');
  $('#results-content').classList.remove('stale-result');
  $('#rule-explanation').innerHTML = '<p class="inline-empty">먼저 입력을 완료하고 계산해 주세요. 계산 근거가 여기에 표시됩니다.</p>';
  $('#ai-output').innerHTML = ''; $('#stale-notice').hidden = true;
  $('#plan-state').textContent = '아직 계산하지 않았어요';
  updateAIButton(); renderSources();
}

async function calculate(event) {
  event?.preventDefault();
  if (state.calculating) return;
  const raw = financialInput();
  const calculatedSignature = signature();
  let validation;
  try { validation = validateInputs(raw); }
  catch { showMessage('입력을 확인하는 중 문제가 생겼습니다. 잠시 후 다시 계산해 주세요.', 'error'); return; }
  if (!validation.valid) { showErrors(validation.errors); return; }
  clearErrors(); state.calculating = true;
  $('#calculate-button').disabled = true;
  $('#calculate-button').innerHTML = '<span class="spinner" aria-hidden="true"></span> 계산하고 있어요';
  try {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = runPlan(raw);
    if (!result.ok) { showErrors(result.errors); return; }
    state.result = result; state.signature = calculatedSignature; state.stale = false;
    state.aiSequence++; state.aiResult = null; state.aiBusy = false;
    $('#ai-output').innerHTML = '';
    renderResults(); renderRules(); renderSources(); updateStale();
    showView('results', true);
  } catch (error) {
    console.error('Calculation failed', error?.name);
    showMessage('계산을 완료하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요.', 'error');
  } finally {
    state.calculating = false; $('#calculate-button').disabled = false;
    $('#calculate-button').innerHTML = '진단·대안 비교하기 <span aria-hidden="true">→</span>';
  }
}

function safeUrl(url) {
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : ''; } catch { return ''; }
}

function evidenceLinks(ids, allEvidence) {
  if (!Array.isArray(ids)) return '';
  const evidence = Array.isArray(allEvidence) ? allEvidence : [];
  return `<div class="evidence-links">${ids.map(id => {
    const source = evidence.find(item => item.id === id);
    const href = safeUrl(source?.url);
    const baseTitle = source?.title || source?.label || source?.description || id;
    const title = source?.formatted ? `${baseTitle}: ${source.formatted}` : baseTitle;
    return href ? `<a class="evidence-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(title)} ↗</a>` : `<span class="evidence-link">${esc(title)}</span>`;
  }).join('')}</div>`;
}

function updateAIButton() {
  const available = codexConnected();
  $('#ai-button').disabled = !available || !state.result || state.stale || state.aiBusy;
  $('#ai-button').innerHTML = state.aiBusy ? '<span class="spinner" aria-hidden="true"></span> 설명을 작성하고 있어요' : '<span aria-hidden="true">✦</span> AI 설명 요청';
  $('#ai-help').textContent = state.aiBusy ? '계산 엔진이 확인한 숫자를 바탕으로 Codex가 설명을 작성합니다. 최대 약 2분이 걸릴 수 있습니다.' : state.stale ? '입력 변경 후 다시 계산해야 AI 설명을 요청할 수 있습니다.' : !state.aiStatus ? 'Codex 구독 연결을 확인하고 있습니다.' : !available ? '실시간 AI 설명은 연결된 로컬 앱에서 사용할 수 있습니다. 계산해설과 아래 수동 전달 기능은 지금도 사용할 수 있습니다.' : !state.result ? 'Codex 구독이 연결되었습니다. 계산을 완료한 뒤 설명을 요청할 수 있습니다.' : '기존 구독의 사용량·한도가 적용됩니다. 한도에 도달해도 별도 유료 API로 자동 전환하지 않습니다.';
  const canHandoff = Boolean(state.result && !state.stale);
  $('#copy-ai-brief').disabled = !canHandoff;
  $('#download-ai-brief').disabled = !canHandoff;
  $('#handoff-help').textContent = state.stale ? '입력이 바뀌었습니다. 다시 계산하면 전달할 요약이 갱신됩니다.' : canHandoff ? '계획 이름은 제외합니다. 금융정보가 포함되므로 전달할 내용을 먼저 확인하세요. AI 응답은 선택한 서비스에서 별도로 받습니다.' : '먼저 계산을 완료해 주세요. 요약에는 계획 이름을 제외한 금융정보가 포함됩니다.';
  $('#ai-brief-text').value = canHandoff ? buildManualBrief() : '';
}

function codexConnected() {
  return Boolean(state.aiStatus?.aiAvailable && state.aiStatus.provider === 'codex_subscription' && state.aiStatus.authMode === 'chatgpt');
}

async function loadStatus() {
  $('#refresh-ai-status').disabled = true;
  try {
    const response = await fetch('/api/status', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('status');
    state.aiStatus = await response.json();
  } catch { state.aiStatus = { aiAvailable: false }; }
  const connected = codexConnected();
  $('#ai-status').textContent = connected ? 'Codex 구독 연결' : '실시간 AI 연결 안 됨';
  $('#ai-status').classList.toggle('warning', !connected);
  $('#ai-consent').textContent = connected ? '아래 버튼을 누르면 이 기기의 Codex가 금융 숫자와 계산 요약을 OpenAI 클라우드 모델로 보냅니다. 계획 이름은 제외합니다. 기존 ChatGPT/Codex 구독 사용량·한도가 적용되며, 별도 API 결제로 전환하지 않습니다.' : '이 화면에서는 Codex 구독 연결이 확인되지 않았습니다. 이 PC에서 온계획을 실행하고 Codex에 ChatGPT 계정으로 로그인하면 연결할 수 있습니다. AI 요청 전에는 금융정보를 전송하지 않습니다.';
  $('#refresh-ai-status').disabled = false;
  updateAIButton();
}

async function requestAI() {
  if (!state.result || state.stale || !codexConnected() || state.aiBusy) return;
  state.aiBusy = true; const requestId = ++state.aiSequence; const requestSignature = state.signature;
  updateAIButton();
  $('#ai-output').innerHTML = '<div class="loading-state"><span class="spinner" aria-hidden="true"></span>대안별 차이와 확인할 사항을 정리하고 있습니다.</div>';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150000);
  try {
    const response = await fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ input: financialInput() }), signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (requestId !== state.aiSequence || requestSignature !== signature()) return;
    if (!response.ok || data.mode !== 'live_ai' || data.provider !== 'codex_subscription' || data.authMode !== 'chatgpt' || !Array.isArray(data.sections)) throw new Error(data.message || data.error?.message || (typeof data.error === 'string' ? data.error : 'Codex 구독 연결의 AI 응답을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.'));
    state.aiResult = data;
    const evidence = Array.isArray(data.evidence) ? data.evidence : state.result.evidence || [];
    $('#ai-output').innerHTML = data.sections.map(section => `<article class="explanation-item"><h4>${esc(section.title)}</h4><p>${esc(section.text)}</p>${evidenceLinks(section.evidenceIds, evidence)}</article>`).join('') + `<p class="explanation-meta">Codex 구독을 통한 AI 생성 설명 · ${esc(data.model || state.aiStatus.model || '')}<br>OpenAI 클라우드 모델의 응답입니다. 현재 계산을 바탕으로 생성했으며, 최종 선택 전 입력과 가정을 함께 확인하세요.</p>`;
  } catch (error) {
    if (requestId !== state.aiSequence) return;
    $('#ai-output').innerHTML = `<div class="notice notice-error" style="margin-top:20px"><div><strong>AI 설명을 가져오지 못했어요.</strong><p>${esc(error.name === 'AbortError' ? '응답 시간이 길어 요청을 중단했습니다. 다시 시도할 수 있습니다.' : error.message)}</p><p>계산 결과와 계산해설은 그대로 확인할 수 있습니다.</p></div></div>`;
  } finally {
    clearTimeout(timeout);
    if (requestId === state.aiSequence) { state.aiBusy = false; updateAIButton(); }
  }
}

function buildManualBrief() {
  if (!state.result || state.stale) return '';
  const result = state.result;
  const summaryKeys = ['cash', 'educationBalance', 'freeCash', 'loanBalance', 'netWorth', 'cumulativeInterest', 'cumulativeFees', 'educationGap', 'educationMinimumGap', 'minFreeCash', 'firstLiquidityShortfallMonth', 'firstCashFloorBreachMonth', 'monthsWithUnpaidObligations', 'maxLiquidityShortfall', 'cumulativeEducationWithdrawals', 'payoffDate'];
  const summarize = summary => Object.fromEntries(summaryKeys.map(key => [key, typeof summary[key] === 'number' ? Math.round(summary[key]) : summary[key]]));
  const payload = {
    kind: 'onplan_manual_handoff',
    mode: 'manual_transfer_not_live_ai',
    modelVersion: result.modelVersion,
    units: '금액: 원(KRW), 요약 금액은 원 단위 반올림, 입력 금리는 연 %, 월수는 개월',
    input: Object.fromEntries(FINANCIAL_FIELDS.map(key => [key, result.input[key]])),
    fieldLabels: Object.fromEntries(FINANCIAL_FIELDS.map(key => [key, FIELD_MAP[key].label])),
    comparisonMonth: result.comparisonMonth,
    comparisonMonths: result.comparisonMonths,
    currentMonthlyBudget: {
      netIncome: result.input.netIncome,
      livingExpenses: result.input.livingExpenses,
      monthlyPayment: Math.round(result.evidence.monthlyPayment),
      plannedSavings: Math.round(result.evidence.plannedSavings),
      unallocatedMonthly: Math.round(result.evidence.unallocatedMonthly),
      extraMonthly: result.input.extraMonthly,
    },
    alternatives: result.strategies.map(strategy => ({ id: strategy.id, label: strategy.label, normal: summarize(strategy.normal.summary), stress: summarize(strategy.stress.summary) })),
    assumptions: result.assumptions,
    warnings: result.warnings,
    sources: SOURCES.map(source => ({ title: source.title, url: source.url })),
  };
  return '온계획 계산 요약 — 사용자가 직접 전달하는 자료\n\n이 문서는 온계획의 실시간 AI 응답이 아닙니다. 아래 계산 숫자와 가정을 바탕으로 비교 결과를 설명해 주세요.\n\n요청:\n1. 현재 월 현금흐름과 세 대안의 차이를 쉬운 한국어로 설명하세요.\n2. 소득 감소 기간의 현금 하한, 의무지출 미납, 교육 배정금 사용을 구분하세요.\n3. 교육저축은 현금 내부 배정이며 배정 자체가 새 자산을 만들지 않는다는 점을 지키세요.\n4. 수익률·확률·고객 사실을 새로 추정하거나 입력 숫자를 바꾸지 마세요. 추가로 확인할 정보를 명시하세요.\n5. 특정 금융상품 매수, 법정 DSR 판정, 세금 최적화, 은퇴 충분성 판단은 이 계산 범위를 벗어납니다.\n6. 설명에 사용한 수치를 아래 자료와 대조할 수 있도록 제시하세요.\n\n' + JSON.stringify(payload, null, 2);
}

async function copyManualBrief() {
  if (!state.result || state.stale) return;
  const text = buildManualBrief();
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    showMessage('계산 요약을 복사했습니다. 사용할 AI 대화에 직접 붙여 넣어 주세요. 자동 전송하지 않았습니다.');
  } catch {
    $('#brief-preview').open = true;
    $('#ai-brief-text').value = text;
    $('#ai-brief-text').focus(); $('#ai-brief-text').select();
    $('#handoff-help').textContent = '자동 복사를 사용할 수 없습니다. 아래 선택된 내용을 직접 복사해 주세요. 외부 서비스로 전송하지 않았습니다.';
  }
}

function downloadManualBrief() {
  if (!state.result || state.stale) return;
  const blob = new Blob([buildManualBrief()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `onplan-ai-brief-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage('수동 전달용 요약을 저장했습니다. 금융정보가 포함되어 있으며 AI로 자동 전송하지 않았습니다.');
}

function exportInputs() {
  const data = { format: 'onplan-input', version: 1, exportedAt: new Date().toISOString(), input: readRaw() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `onplan-input-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage('현재 입력을 JSON 파일로 저장했습니다. 파일에는 입력한 금융정보가 포함됩니다.');
}

async function importInputs(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('입력 파일은 1MB 이하여야 합니다.');
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON 입력 형식을 확인해 주세요.');
    const raw = parsed.input && typeof parsed.input === 'object' && !Array.isArray(parsed.input) ? parsed.input : parsed;
    if (!FINANCIAL_FIELDS.some(key => Object.hasOwn(raw, key))) throw new Error('온계획 입력 항목이 없는 파일입니다. 이 도구에서 저장한 JSON 또는 호환 입력 파일을 선택하세요.');
    const imported = {};
    INPUT_FIELDS.forEach(field => {
      const value = raw[field.key] ?? '';
      if (!['string', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`${field.label}의 형식을 확인해 주세요.`);
      if (field.key === 'label' && String(value).length > 60) throw new Error('계획 이름은 60자 이하여야 합니다.');
      if (field.type === 'month' && value !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))) throw new Error(`${field.label}은 YYYY-MM 형식이어야 합니다.`);
      imported[field.key] = String(value);
    });
    INPUT_FIELDS.forEach(field => { $(`#field-${field.key}`).value = imported[field.key]; });
    clearErrors(); resetResults(); updateProgress(); showView('input', true);
    showMessage('입력을 불러왔습니다. 값을 확인한 뒤 ‘진단·대안 비교하기’를 눌러 주세요.');
  } catch (error) { showMessage(error instanceof SyntaxError ? 'JSON 파일을 읽지 못했습니다. 올바른 형식의 파일인지 확인해 주세요.' : error.message, 'error'); }
  finally { event.target.value = ''; }
}

function resetInputs() {
  $('#plan-form').reset(); clearErrors(); resetResults(); updateProgress(); showView('input', true);
  $('#global-message').hidden = true;
  FORM_SECTIONS.forEach(section => { $(`[data-section="${section.id}"]`).open = Boolean(section.open); });
  $('#field-label').focus();
}

// Result rendering is kept separate from financial calculations.
const SOURCES = [
  { id: 'SRC-PMT', title: '제주은행 · 대출 금융계산기', url: 'https://www.jejubank.co.kr/hmpg/prdGdnc/calculator.do?mode=loan', note: '원리금균등상환의 정의와 입력 요소. 이 도구는 월 단위 금융수학식으로 계산하며 은행의 실제 납부명세서와 차이가 날 수 있습니다.' },
  { id: 'SRC-FEE', title: '금융위원회 · 중도상환수수료 개편 안내', url: 'https://www.fsc.go.kr/no010101/83833', note: '2025년 1월 13일 이후 신규 대출의 개편 안내. 적용 여부와 수수료는 개별 계약에 따라 확인해야 합니다.' },
  { id: 'SRC-FEE-QA', title: '금융위원회 · 중도상환수수료 Q&A', url: 'https://www.fsc.go.kr/po020201/83840', note: '기존 계약에 자동 소급되지 않습니다. 이 도구의 잔여개월 선형 감소 방식은 비교를 위한 가정이며 약정의 일수·면제한도를 대체하지 않습니다.' },
  { id: 'SRC-PENSION', title: '금융감독원 · 연금저축 유지 및 해지', url: 'https://www.fss.or.kr/fss/main/contents.do?menuNo=200978', note: '연금저축 중도인출·해지의 세금과 상품별 제약을 확인합니다. 이 도구에서는 연금자산을 비상현금으로 자동 사용하지 않습니다.' },
  { id: 'SRC-IRP', title: '국가법령정보센터 · 퇴직급여법 시행령 제18조', url: 'https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1021160497', note: 'IRP의 일부 중도인출에는 법정 사유가 필요합니다. 일부 인출과 전체 계좌 해지를 같은 것으로 보지 않습니다.' },
];

function orderedStrategies() {
  return ['debt', 'cash', 'education'].map(id => state.result.strategies.find(strategy => strategy.id === id)).filter(Boolean);
}

function metric(label, value, detail, className = '') {
  return `<article class="metric ${className}"><p class="metric-label">${esc(label)}</p><div class="metric-value">${compact(value)}</div><p class="metric-detail">${esc(detail)}</p></article>`;
}

function payoffText(summary) {
  if (summary.payoffMonth === 0) return '대출 없음';
  if (summary.payoffDate) return monthLabel(summary.payoffDate);
  return '계산기간 내 미완제';
}

function flowChart(mode = 'normal') {
  const result = state.result, strategies = orderedStrategies();
  const colors = { debt: '#1b3b4b', cash: '#2c9481', education: '#bc995a' };
  const width = 560, height = 245, left = 65, right = 12, top = 20, bottom = 36;
  const length = result.comparisonMonths;
  const series = strategies.map(strategy => ({ ...strategy, points: strategy[mode].path.filter(point => point.month <= length) }));
  const maxValue = Math.max(1, result.input.cashFloor, ...series.flatMap(strategy => strategy.points.map(point => point.freeCash))) * 1.1;
  const x = month => left + month / length * (width - left - right);
  const y = value => top + (1 - value / maxValue) * (height - top - bottom);
  const axisMoney = value => Math.abs(value) >= 100000000 ? `${(value / 100000000).toFixed(1)}억` : Math.abs(value) >= 10000 ? `${Math.round(value / 10000).toLocaleString('ko-KR')}만` : Math.round(value).toLocaleString('ko-KR');
  const grid = [0, 1, 2, 3].map(index => {
    const value = maxValue * index / 3;
    return `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" stroke="#e5ece5" stroke-width="1"/><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end" fill="#85928a" font-size="10">${axisMoney(value)}</text>`;
  }).join('');
  const lines = series.map(strategy => `<path d="${strategy.points.map((point, index) => `${index ? 'L' : 'M'}${x(point.month).toFixed(2)},${y(point.freeCash).toFixed(2)}`).join(' ')}" fill="none" stroke="${colors[strategy.id]}" stroke-width="${strategy.id === 'cash' ? '2.5' : '2'}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const endMonth = result.comparisonMonth;
  const svg = `<svg class="flow-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${mode === 'normal' ? '정상 상황' : '소득 감소 상황'}의 월별 교육 배정금 제외 현금 잔액. 현금유지·추가상환·교육저축을 동일 기간으로 비교합니다.">${grid}<line x1="${left}" y1="${y(result.input.cashFloor)}" x2="${width - right}" y2="${y(result.input.cashFloor)}" stroke="#b8aaa0" stroke-width="1" stroke-dasharray="4 4"/>${lines}<text x="${left}" y="${height - 8}" text-anchor="start" fill="#85928a" font-size="10">시작</text><text x="${width - right}" y="${height - 8}" text-anchor="end" fill="#85928a" font-size="10">${esc(monthLabel(endMonth))}</text></svg>`;
  const legend = `<div class="chart-legend">${strategies.map(strategy => `<span class="legend-item"><i class="legend-dot" style="background:${colors[strategy.id]}"></i>${esc(strategy.label)}</span>`).join('')}<span class="legend-item"><i class="legend-dot" style="background:#b8aaa0"></i>현금 하한</span></div>`;
  return svg + legend;
}

function renderResults() {
  const result = state.result, input = result.input, evidence = result.evidence;
  const strategies = orderedStrategies();
  const descriptions = { debt: '추가 배분액으로 대출원금·수수료 지급', cash: '기존 여유자금을 현금으로 유지', education: '현금 안에서 교육목표로 추가 배정' };
  const row = (label, render, cls = '') => `<tr class="${cls}"><th scope="row">${esc(label)}</th>${strategies.map(strategy => `<td>${render(strategy.normal.summary, strategy)}</td>`).join('')}</tr>`;
  const table = `<div class="table-scroll"><table class="comparison-table"><caption class="sr-only">${esc(monthLabel(result.comparisonMonth))} 기준 세 가지 대안 비교</caption><thead><tr><th scope="col">동일한 출발점<br>매월 ${money(input.extraMonthly)} 비교</th>${strategies.map((strategy, index) => `<th scope="col"><span class="alternative-number">OPTION ${String(index + 1).padStart(2, '0')}</span><span class="alternative-title">${esc(strategy.label)}</span><span class="alternative-description">${esc(descriptions[strategy.id])}</span></th>`).join('')}</tr></thead><tbody>${row('남은 대출잔액', summary => money(summary.loanBalance))}${row('현금·예금 합계', summary => money(summary.cash))}${row('그중 교육 배정금', summary => money(summary.educationBalance))}${row('교육 배정금 제외 현금', summary => money(summary.freeCash), 'emphasis')}${row('교육 배정금 기준 부족액', summary => input.educationTarget === 0 ? '목표 없음' : `${money(summary.educationGap)}<small>희망 목표 ${money(input.educationTarget)} 대비</small>`)}${row('교육 최소금액 대비', summary => input.educationTarget === 0 ? '목표 없음' : summary.educationMinimumMet ? '배정금 충족' : `<span class="negative">${money(summary.educationMinimumGap)} 부족</span>`)}${row('기간 중 이자 + 수수료', summary => `${money(summary.cumulativeInterest + summary.cumulativeFees)}<small>수수료 ${money(summary.cumulativeFees)} 포함</small>`)}${row('기준월 순자산', summary => money(summary.netWorth))}${row('참고: 대출 완제 시점', summary => `${esc(payoffText(summary))}<small>비교월 이후에도 같은 조건 유지 가정</small>`)}</tbody></table></div>`;
  const monthlyRows = [
    ['세후 월소득', input.netIncome], ['생활비', input.livingExpenses], ['주담대 월 원리금', evidence.monthlyPayment], ['현재 월 저축·투자 합계', evidence.plannedSavings],
  ].map(([label, value]) => `<div class="balance-row"><span>${label}</span><strong>${money(value)}</strong></div>`).join('');
  const warnings = result.warnings.length ? `<div class="notice notice-warning"><span class="notice-icon" aria-hidden="true">!</span><div><strong>해석 전에 확인할 사항</strong><ul class="warning-list">${result.warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></div></div>` : '';
  const stressCards = strategies.map(strategy => {
    const summary = strategy.stress.summary;
    const unpaid = summary.monthsWithUnpaidObligations > 0;
    return `<article class="stress-card"><h4>${esc(strategy.label)}</h4><span class="stress-status ${unpaid ? 'bad' : ''}">${unpaid ? `의무지출 미납 ${summary.monthsWithUnpaidObligations}개월` : '의무지출 미납 없음'}</span><div class="stress-value">${amount(summary.minFreeCash)}<small> 원</small></div><p class="stress-caption">기간 중 최소 비배정현금</p><div class="stress-extra"><p>현금 하한 미달: <strong>${summary.firstCashFloorBreachMonth ? esc(monthLabel(summary.firstCashFloorBreachMonth)) + '부터' : '없음'}</strong></p><p>교육 배정금 사용: <strong>${money(summary.cumulativeEducationWithdrawals)}</strong></p><p>기준월 교육 배정금: <strong>${money(summary.educationBalance)}</strong></p>${unpaid ? `<p class="negative-text">최대 미납액 ${money(summary.maxLiquidityShortfall)}</p>` : ''}</div></article>`;
  }).join('');
  $('#results-content').innerHTML = `<div class="section-heading result-heading"><div><p class="eyebrow">YOUR PLAN AT A GLANCE</p><h2>한눈에 보는 현재와 다음 선택</h2></div><button type="button" class="button button-small" data-go-input>입력 수정 <span aria-hidden="true">↗</span></button></div><p class="data-note">현재 입력을 기준으로 계산했습니다. 아래 대안의 금액은 ${esc(monthLabel(result.comparisonMonth))}, ${result.comparisonMonths}개월 차 시점입니다.</p>${warnings}<div class="metrics-grid">${metric('현재 월 미배분 여유자금', evidence.unallocatedMonthly, '기존 저축·투자 납입을 뺀 뒤', evidence.unallocatedMonthly < 0 ? 'negative' : 'metric-featured')}${metric('현재 주담대 월 원리금', evidence.monthlyPayment, '원금 + 이자 · 같은 금리 가정')}${metric('시작 비배정현금', input.cash - input.educationEarmark, '전체 현금에서 교육 배정금 제외')}${metric('시작 순자산', evidence.initialNetWorth, '총자산 − 대출잔액')}</div><div class="two-column"><section class="surface"><div class="card-heading"><span class="card-icon" aria-hidden="true">≡</span><div><p class="mini-label">MONTHLY BUDGET</p><h3>현재 월 현금흐름</h3></div></div><div class="balance-list">${monthlyRows}<div class="balance-row total"><span>미배분 여유자금</span><strong>${money(evidence.unallocatedMonthly)}</strong></div></div><p class="chart-caption">월 추가 배분액 ${money(input.extraMonthly)}은 여유자금에서 나갑니다. 가용금액이 부족하면 실제 배분액이 줄어듭니다.</p></section><section class="surface"><div class="section-heading"><div><p class="mini-label">CASH OVER TIME</p><h3>월별 비배정현금</h3></div><select id="chart-mode" class="chart-select" aria-label="현금 차트 상황"><option value="normal">정상 상황</option><option value="stress">소득 감소 시</option></select></div><div id="flow-chart-content">${flowChart()}</div><p class="chart-caption">현금·예금에서 교육 배정금을 제외한 잔액입니다. 점선은 입력한 현금 하한이며 추가 자산이 아닙니다.</p></section></div><section class="comparison-section"><div class="section-heading"><div><p class="eyebrow">SAME BUDGET, DIFFERENT CHOICES</p><h2>같은 여유자금의 세 가지 쓰임</h2></div><span class="pill">${esc(result.comparisonMonth)} 기준</span></div>${table}<p class="table-footnote">현금유지는 기존 여유자금이 예금에 남는 기준안과 같습니다. 교육저축은 같은 현금 안의 용도 배정이며, 배정 자체가 자산을 늘리지는 않습니다. 다만 교육 배정금이 늘면 현금 하한을 지키기 위한 후속 연금·투자 납입과 총예금·연금·투자 잔액이 달라질 수 있습니다. 교육 배정금의 목표 충족은 총자산 증가를 뜻하지 않습니다.</p></section><section class="surface"><div class="section-heading"><div><p class="eyebrow">A WHAT-IF CHECK</p><h2>소득이 줄어들어도 이어갈 수 있을까요?</h2></div><span class="pill">확률 예측 아님</span></div><p class="muted">${esc(monthLabel(input.stressStartMonth))}부터 ${input.stressMonths}개월 동안 월소득 ${money(input.stressIncomeLoss)} 감소, 생활비 ${money(input.stressExpenseReduction)} 조정을 가정합니다. 저축·투자·추가배분은 이 소득 감소 기간에만 중단합니다. 소득 회복 후에도 현금 하한을 지키기 위해 납입이 추가로 줄어들 수 있습니다. 아래는 비교월까지의 결과입니다.</p><div class="stress-grid">${stressCards}</div><p class="chart-caption">비배정현금이 모자라면 교육 배정금을 의무지출에 사용합니다. 연금·투자·주택을 자동 처분하지 않습니다. 미납 없음은 입력한 시나리오의 결과이며 생활 안정이나 목표 달성을 보장하지 않습니다.</p></section><div class="results-actions"><button type="button" class="button button-secondary" data-go-input>입력을 바꿔 다시 비교</button><button type="button" class="button button-primary" id="go-explain">계산 근거 살펴보기 <span aria-hidden="true">→</span></button></div>`;
  $('#chart-mode').addEventListener('change', event => { $('#flow-chart-content').innerHTML = flowChart(event.target.value); });
  $('#go-explain').addEventListener('click', () => showView('explain', true));
}

function renderRules() {
  const result = state.result, x = result.input, e = result.evidence;
  const debt = result.strategies.find(strategy => strategy.id === 'debt').normal.summary;
  const cash = result.strategies.find(strategy => strategy.id === 'cash').normal.summary;
  const education = result.strategies.find(strategy => strategy.id === 'education').normal.summary;
  const rules = [
    { title: '1. 먼저, 매월 남는 금액을 확인합니다.', text: `세후 소득 ${money(x.netIncome)}에서 생활비 ${money(x.livingExpenses)}, 주담대 원리금 ${money(e.monthlyPayment)}, 현재 저축·투자 ${money(e.plannedSavings)}를 빼면 미배분 여유자금은 ${money(e.unallocatedMonthly)}입니다. 비교할 추가 배분액은 월 ${money(x.extraMonthly)}입니다. 실제 배분은 현금 하한과 가용금액의 제한을 받습니다.` },
    { title: '2. 추가상환은 이자와 현금 여유를 함께 바꿉니다.', text: `${monthLabel(result.comparisonMonth)} 기준 현금유지의 대출잔액은 ${money(cash.loanBalance)}, 추가상환은 ${money(debt.loanBalance)}입니다. 같은 기간 이자와 수수료 합계는 각각 ${money(cash.cumulativeInterest + cash.cumulativeFees)}, ${money(debt.cumulativeInterest + debt.cumulativeFees)}입니다. 상환에 쓴 돈은 비상현금으로 남지 않으므로 스트레스 결과도 함께 보세요.`, evidenceIds: ['SRC-PMT', 'SRC-FEE-QA'] },
    { title: '3. 교육저축은 현금 안에서 목적을 정하는 선택입니다.', text: `교육 배정금은 현금유지 ${money(cash.educationBalance)}, 교육저축 ${money(education.educationBalance)}입니다. 교육저축의 배정금 기준 목표 부족액은 ${money(education.educationGap)}입니다. 이 차이는 별도 자산이나 투자수익이 생겼다는 의미가 아닙니다. 현금유지안의 비배정현금도 향후 교육에 쓸 수 있지만 그러면 다른 용도의 현금이 줄어듭니다.` },
    { title: '4. 비상 상황에서는 자동 납입도 멈춥니다.', text: `설정한 ${x.stressMonths}개월에는 저축·투자·추가배분을 중단합니다. 의무지출은 비배정현금, 교육 배정금 순서로 충당하고 부족분을 미납으로 표시합니다. 회복 뒤에도 현금 하한 때문에 납입이 줄어들 수 있으며 놓친 납입을 자동으로 보충하지 않습니다. 연금·투자·주택은 현금화하지 않습니다.`, evidenceIds: ['SRC-PENSION', 'SRC-IRP'] },
  ];
  $('#rule-explanation').innerHTML = rules.map(rule => `<article class="explanation-item"><h4>${esc(rule.title)}</h4><p>${esc(rule.text)}</p>${evidenceLinks(rule.evidenceIds, SOURCES)}</article>`).join('') + '<p class="explanation-meta">계산해설 · 입력과 고정된 계산 규칙으로 작성한 설명입니다. AI 생성 문장이 아닙니다.</p>';
}

function renderSources() {
  const assumptions = state.result?.assumptions || [
    '계산은 월말 단위이며, 입력한 세후 소득·생활비·금리를 고정해 비교합니다. 예금·투자 수익률과 물가상승률은 0%입니다.',
    '대출은 원리금균등·무거치로 계산합니다. 추가상환은 기존 월 원리금을 유지하면서 만기를 줄이는 방식입니다.',
    '추가상환 수수료는 입력한 적용 잔여개월 동안 선형 감소하는 단순 가정입니다. 실제 계약의 일할 계산·면제한도·은행 반올림은 반영하지 않습니다.',
    '교육 배정금은 현금의 일부이고 교육저축도 그 안의 용도 배정입니다. 교육 준비금 비교 뒤 실제 지출하는 사건은 포함하지 않습니다.',
    '소득 감소 기간에는 저축·투자·추가배분을 중단합니다. 부족한 의무지출에는 교육 배정금도 사용하지만 연금·투자·주택을 자동 처분하지 않습니다.',
  ];
  $('#sources-content').innerHTML = `<div class="sources-grid"><section class="surface"><div class="card-heading"><span class="card-icon" aria-hidden="true">≋</span><div><p class="mini-label">MODEL BOUNDARIES</p><h3>어떻게 계산하나요?</h3></div></div><div class="assumption-group"><ul class="assumption-list">${assumptions.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div><div class="assumption-group"><h4>이 계산에 포함하지 않는 것</h4><ul class="assumption-list"><li>실제 금융상품 매수·매도, 대출 실행·갈아타기, 세금 최적화나 수익 예측</li><li>법정 DSR·LTV 적격 판정, 보험 보장 적정성, 은퇴자금 충분성</li><li>월내 급여일과 청구일, 확률·목표 성공률, 미납 발생 뒤 법적 효과</li></ul></div><div class="assumption-group"><h4>비교 결과를 읽는 순서</h4><ul class="assumption-list"><li>의무지출과 현금 하한 → 교육 배정금 → 대출잔액·이자비용을 함께 확인하세요.</li><li>순자산이 더 많아도 바로 쓸 현금이 더 많다는 뜻은 아닙니다.</li><li>미래 금액은 현재 입력이 계속된다는 조건의 계산값입니다.</li></ul></div></section><section class="surface"><div class="card-heading"><span class="card-icon" aria-hidden="true">↗</span><div><p class="mini-label">PRIMARY REFERENCES</p><h3>직접 확인할 수 있는 출처</h3></div></div><p class="muted">공식 자료는 제도와 상환방식의 근거입니다. 개인 계약을 대신하거나 입력한 금리를 검증하지 않습니다.</p>${SOURCES.map(source => `<article class="source-item" id="${source.id}"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a><p>${esc(source.note)}</p></article>`).join('')}<div class="assumption-group"><h4>입력과 개인정보</h4><p class="muted">입력은 이 기기에서 계산하며 자동 저장하지 않습니다. 저장한 JSON에는 금융정보가 포함됩니다. AI 설명 버튼을 눌렀을 때만 금융 숫자를 전송하며 계획 이름은 제외합니다.</p></div><p class="explanation-meta">제도 근거 확인 기준: 2026년 11월 16일${state.result ? ` · 계산 모형 ${esc(state.result.modelVersion)}` : ''}</p></section></div>`;
}

buildForm(); resetResults(); updateProgress(); loadStatus();
document.querySelectorAll('.view-tab').forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));
$('#plan-form').addEventListener('input', inputChanged);
$('#plan-form').addEventListener('submit', calculate);
$('#stale-recalculate').addEventListener('click', calculate);
$('#ai-button').addEventListener('click', requestAI);
$('#refresh-ai-status').addEventListener('click', loadStatus);
$('#copy-ai-brief').addEventListener('click', copyManualBrief);
$('#download-ai-brief').addEventListener('click', downloadManualBrief);
$('#import-button').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', importInputs);
$('#export-button').addEventListener('click', exportInputs);
$('#reset-button').addEventListener('click', () => { $('#reset-dialog').returnValue = ''; $('#reset-dialog').showModal(); });
$('#reset-dialog').addEventListener('close', () => { if ($('#reset-dialog').returnValue === 'reset') resetInputs(); });
document.addEventListener('click', event => { if (event.target.closest('[data-go-input]')) showView('input', true); });
