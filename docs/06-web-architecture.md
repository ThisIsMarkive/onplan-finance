# 현재 웹 아키텍처

2026-11-16 공개 준비 기준. 브라우저와 Cloudflare Worker가 **같은 JavaScript 계산 모듈**을 사용한다. 초기 Python/Streamlit 제안과 다른 구현 선택이며 연구용 Python 검증은 비교 근거다. 소스 업로드와 웹 배포는 아직 완료로 기록하지 않는다.

## 파일과 실행 경계

| 경로 | 역할 |
|---|---|
| [src/core.js](../src/core.js) | 입력 검증, 월별 원장, 기준안·현금·교육배정·추가상환과 스트레스 |
| [src/form-schema.js](../src/form-schema.js) | UI 필드·단위·설명·계산 필드 구분 |
| [public](../public/) | 빈폼, JSON 입출력, 기초 진단·대안·원장·출처 화면 |
| [worker/index.js](../worker/index.js) | 자산·계산 API·AI 설정상태·오류 응답 |
| [build.mjs](../scripts/build.mjs), [dev.mjs](../scripts/dev.mjs) | 단일 Worker ESM 빌드와 로컬 HTTP 서버 |
| [codex-bridge.mjs](../scripts/codex-bridge.mjs), [explanation.js](../src/explanation.js) | 로컬 구독 CLI 연결, 동일 입력 재계산, 설명 스키마·수치·근거 검증. 호스팅 Worker는 CLI를 호출하지 않음 |
| [JS 시험](../tests/core.test.mjs), [Python 검증](../analysis/verify_web_core.py) | 코어 JS 18개·Python 24개 확인, 독립 원장 대조 88,992회 |
| [수동 가져오기 예제](../examples/contest-customer.json) | UI 기본값이 아닌 합성 입력 |

상세 고객 v1과 웹 평탄 입력의 차이는 [provenance.json](../fixtures/provenance.json)에 있다. 새 현금 하한·추가예산·수수료·스트레스 시점은 실제 계약 관측값이 아니다.

기본 계산은 브라우저의 runPlan을 호출한다. 서버의 POST /api/calculate도 같은 함수를 사용한다. 서버는 JSON 형식·크기·Origin과 입력 오류를 처리한다. 모듈 공유가 모든 서버·브라우저 동작의 시험을 대신하지는 않는다.

AI 실행은 세 경로로 구분한다. 호스팅 Worker는 서버 모델 연결 없이 계산·규칙 기반 해설을 제공한다. 일반 `npm run dev`도 계산 전용이다. 선택적 `npm run dev:ai`는 로컬 Node 서버가 설치된 Codex CLI를 실행하며, 명령은 `node scripts/dev.mjs --ai=codex`다. ChatGPT 로그인 확인과 실제 모델 호출 성공은 별개의 증거다. [실제 호출 1건](../artifacts/live-ai-verification.json)은 ChatGPT 인증으로 성공했으며 29.823초에 5개 설명을 반환했다. 모의 브리지 시험 14개와 구분한다.

호스팅 사이트에서 로컬 CLI를 원격 호출하거나 사용자 인증정보를 서버로 올리지 않는다. 호스팅용 수동 전달 기능은 입력·계산 요약의 미리보기·복사·TXT 내보내기를 제공하며 사용자가 ChatGPT/Claude에 직접 전달한다. CLI 호출·수동 전달·규칙 기반 해설의 상태를 UI에서 구별한다. API 키 경로·자동 API 전환·별도 SIWC OAuth 통합·Claude 자동 연결은 구현하지 않는다. [공식 근거와 구독 사용 안내](08-subscription-ai.md).

PyPortfolioOpt/HARK는 별도 Python 연구 의존성이다. 현재 웹을 금융수익률 최적화나 효용 기반 소비정책 엔진이라고 표현하지 않는다.

## 입력과 상태

처음 화면은 빈폼이며 예제를 자동 입력하지 않는다. 빈 값·0·미확정을 구분하고 수치·날짜 범위, 이중배정과 대출·목표 간 모순을 검증한다. JSON 가져오기는 명시적인 파일 선택이다.

입력 변경 후 이전 결과를 오래된 상태로 표시하고 재계산을 요구하는 UI를 구현했다. [통합 기록](../artifacts/verification.json)에 로컬 브라우저에서 빈폼·가져오기·수치·내보내기·재계산·초기화·0원 고객·390px 폭을 확인한 결과가 있다. 접근성 전체·교차 브라우저·배포 후 화면 검증은 완료하지 않았다.

현재 UI에는 localStorage/sessionStorage 자동 저장이 없다. 기본 계산은 외부 AI로 전송하지 않는다. 사용자가 로컬 AI 설명을 요청하면 계산 요약은 CLI를 통해 OpenAI로 전달되므로 “모든 AI 처리도 기기 내부”라고 표현하지 않는다. 서버 API·호스팅 로그도 별도 경계다. 브리지는 루프백 주소·동일 Origin·ChatGPT 인증을 확인하고 도구 사용을 끈 읽기 전용 실행을 사용한다. 모의 시험에서 인증 거부·시간초과·도구 차단·응답 검증 등을 확인했으며 실제 합성 호출의 숫자·근거 연결도 검토했다. 모든 실제 장애·계정 과금·모든 고객을 검증한 것은 아니다. 인증은 공식 CLI가 관리하며 앱이 인증파일을 읽거나 복사하지 않는다.

코어 18개·서버 18개(HTTP 하위시험 6개 포함)·모의 실행을 포함한 브리지 14개가 통과하여 JS 자동시험은 50개다. Python의 24개 확인, 원장 대조 88,992회, 실제 구독 생성 2건은 단위·중첩이 달라 합산하지 않는다. 브라우저 AI 버튼을 통한 두 번째 실제 생성·설명 5개·수치 근거 표시와 수동 요약 복사를 확인했다. [통합 기록](../artifacts/verification.json)에 수정 전 시작 중단 3회와 성공 2건을 분리했다.

## 계산 정책

현금 유지안은 기준안과 같고 교육배정만으로 자산이 증가하지 않는다. 추가상환 예산에는 수수료를 포함한다. 의무지출 뒤 현금 하한을 고려하고 기존 선택 납입을 같은 비율로 충족한 뒤 추가배분을 적용한다. 스트레스에서 선택 납입을 중단하며 정상소득 회복 후에도 현금 하한 회복 때문에 납입이 일부 제한될 수 있다. 이는 명시한 모의 정책이지 모든 목표의 합의된 최적 우선순위가 아니다.

수익률·물가·세금·실제 결제일·계약별 원단위 처리·은퇴 후 소득 변화는 지원 범위 밖이다. [검증 결과](../fixtures/verification-results.json)는 지정된 합성 입력의 계산·소프트웨어 증거이며 개인 권고나 장기 성과 검증이 아니다.
