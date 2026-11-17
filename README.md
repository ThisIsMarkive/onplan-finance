# OnPlan Finance

가계의 현금·교육자금·대출을 한 원장에서 계산하는 한국어 웹 프로토타입입니다. 같은 추가 예산을 현금 유지, 교육자금 배정, 대출 추가상환에 썼을 때의 차이와 소득중단 스트레스를 비교합니다.

**2026-11-16 공개·배포 상태:** [공개 저장소](https://github.com/ThisIsMarkive/onplan-finance)에 소스를 업로드했고 [웹 배포](https://onplan-finance.daring-coin-5511.chatgpt.site)가 성공했습니다. 웹은 현재 소유자 전용(private)이며 로그인 이후 화면 검증은 보류했습니다. 공개 GitHub와 웹 접근권한은 별개입니다. **로컬 Codex 구독 연결과 수동 AI 전달 기능을 구현했으며 실제 구독 AI 생성 2건(직접 호출·브라우저 요청)을 확인했습니다.** 기본 계산해설은 규칙 기반입니다.

## 실행과 확인

확인한 환경은 Node 24.22.1, 선택적 독립 검산은 Python 3.12.14입니다. 기본 웹에는 외부 npm 패키지 의존성이 없어 설치 없이 실행합니다. 저장소 루트에서:

```sh
npm run dev
```

로컬 주소는 `http://127.0.0.1:4173`이며 `PORT`로 변경할 수 있습니다. 개발 서버는 시작할 때 빌드합니다. 다른 터미널에서:

```sh
npm test
python analysis/verify_web_core.py
npm run build
npm run validate
```

별도 API 비용을 원하지 않는 사용자를 위해 설치된 Codex CLI의 ChatGPT 로그인을 사용하는 로컬 실행 경로를 제공합니다. 해당 경로의 명령은 아래와 같으며, 실제 응답·실패 처리 검증 범위는 [구독 AI 안내](docs/08-subscription-ai.md)를 확인합니다.

```sh
codex login status
npm run dev:ai
```

`dev:ai`는 `node scripts/dev.mjs --ai=codex`를 실행합니다. ChatGPT 로그인이 없으면 사용자가 `codex login`의 공식 로그인 절차를 완료합니다. 앱은 API 키를 요구하거나 인증파일을 복사하지 않으며 API 사용으로 자동 전환하지 않습니다. 구독 한도·계정 정책·기존 크레딧은 적용될 수 있습니다. [공식 인증 안내](https://learn.chatgpt.com/docs/auth?surface=cli), [사용량 안내](https://learn.chatgpt.com/docs/pricing?codex-pricing-plans=individual).

Python 검사는 표준 라이브러리와 포함된 고정 시간가치 모듈을 사용하며 Node가 PATH에 있어야 합니다. 재실행하면 fixtures의 결과 파일을 갱신합니다. 연구용 PyPortfolioOpt/HARK 설치는 웹 실행에 필요하지 않습니다.

빌드는 브라우저 자산·공통 코어를 포함한 `dist/server/index.js`와 `dist/.openai/hosting.json`을 생성합니다. 생성물을 직접 수정하지 않습니다. validate는 ESM·Worker 진입점 검사이며 UI·API·배포 전체의 성공 검사는 아닙니다.

## 사용

1. 시작은 **빈 입력폼**입니다. 금액은 원, 이율은 연 명목 %, 기간은 월 단위입니다. 빈 값과 명시한 0을 구분합니다.
2. 예제는 [contest-customer.json](examples/contest-customer.json)을 내려받아 JSON 가져오기로 선택합니다. 자동 입력되지 않는 합성 사례입니다.
3. 기초 진단·대안·소득중단·월별 원장을 확인합니다. 입력을 바꾸면 기존 결과는 재계산 필요 상태로 표시됩니다.
4. 입력 JSON을 내보낼 수 있습니다. 현재 UI에는 브라우저 저장소 자동 저장이 없으므로 필요한 입력은 직접 내보냅니다.

현금 유지안은 이 모형에서 기준안과 같습니다. 교육 목적 배정은 기존 현금의 표시이므로 자산을 늘리지 않습니다. 추가상환 예산에는 수수료를 포함합니다. 현금 하한은 선택 납입을 제한하지만 의무지출을 막거나 부족한 돈을 만들지 않습니다.

## 구현과 검증

- [src/core.js](src/core.js): 브라우저·Worker 공통 결정론적 월별 계산
- [public](public/), [입력 스키마](src/form-schema.js): 빈폼·JSON 입출력·상태·제한 표시
- [worker/index.js](worker/index.js): 정적 자산, 계산·상태 API, 미설정 AI 응답
- [통합 검증 기록](artifacts/verification.json): **JS 50개(코어 18·서버 18·브리지 14), Python 24개 확인, 독립 원장식 88,992개 대조**
- [실제 구독 AI 직접 호출](artifacts/live-ai-verification.json): 합성 입력, 29.823초, 설명 5개와 수치·근거 연결 확인. 이후 브라우저 요청도 성공하여 실제 생성은 2건입니다. 브리지 14개 자동시험은 모의 실행을 포함한 연결 시험이며 실제 모델 호출 수가 아닙니다.
- [research](research/README.md): 과거 연구·Python 검증·기초 고객 진단의 선별 사본
- [docs](docs/00-project-brief.md): 연구→구조→고객 역설계와 실제 수정·판단 기록

50·24·88,992와 실제 AI 생성 2건은 합산하지 않습니다. Python 확인에는 Node 테스트 성공도 포함됩니다. 독립 원장 대조 최대차이는 약 3.19×10⁻⁷원이며 지정한 합성 입력과 허용오차 내의 결과입니다.

예제의 대학자금은 기초 무수익 산술에서 4,610만원, 소득중단 6개월만 반영하면 4,430만원, 이후 현금 하한 회복까지 반영하면 약 4,356.64만원입니다. 정책 조건이 다른 계산이며 실제 미래 성과가 아닙니다.

로컬 브라우저에서 빈폼·예제 가져오기·재계산·입력 내보내기·0원 고객·390px 폭, 실제 AI 설명 5개 표시와 수동 요약 복사를 확인했습니다. 전체 브라우저·보조기술 검증은 아닙니다. [CI](.github/workflows/verify.yml)는 저장소 업로드 후 실행될 설정이며 원격 실행 결과는 아직 별도 확인하지 않았습니다.

## 한계와 AI 상태

수익률·물가는 0이며 세금·실제 상품 수익·일자별 결제·은행의 일수/원단위 처리·연체 법률효과는 모형화하지 않았습니다. 긴 전망은 입력 소득·지출·금리가 계속된다는 조건부 결과입니다. 은퇴 충족률, 보험 충분성, 법정 DSR, 성공확률과 최적 투자비중을 판단하지 않습니다. 교육 부족액은 배정 현금 기준이며 전체 조달능력과 다릅니다.

PyPortfolioOpt/HARK는 별도 연구에서 실행한 선택 모듈이며 현재 웹 요청에서 호출하지 않습니다. 호스팅 버전에는 서버 AI를 연결하지 않으며 기본 계산·규칙 기반 해설을 제공합니다. 계산 요약을 사용자가 ChatGPT/Claude에 직접 전달하도록 복사·미리보기·TXT 내보내기를 제공합니다. 로컬 Codex 경로와 수동 전달은 서로 다른 기능이며, 호스팅 사이트가 사용자의 PC에 설치된 CLI를 원격 호출하지 않습니다.

로컬 연결도 계산값을 바꾸는 엔진이 아니라 검증된 결과를 설명하는 기능입니다. 실제 호출은 ChatGPT 인증으로 성공했고 설명의 핵심 금액과 해석을 검토했습니다. CLI가 실제 모델 ID를 제공하지 않아 “Codex CLI 기본 모델”로 표시합니다. 합성 사례의 성공은 미래 답변 정확성·가용성 보증이 아니며 계정 청구 화면은 감사하지 않았습니다. 앱은 크레딧을 추가 구매하지 않으며 무제한·항상 무료 사용을 약속하지 않습니다. Claude 자동 연결과 별도 Sign in with ChatGPT OAuth 통합은 구현하지 않았습니다. [실행 방식과 공식 근거](docs/08-subscription-ai.md).

실존 고객 상담·금융거래를 제공하지 않습니다. 기본 계산은 브라우저에서 수행하지만 서버 API·호스팅 로그를 포함한 개인정보 처리 전체를 검증했다는 뜻은 아닙니다. 공개 예제는 합성 자료로 사용합니다.

## 라이선스와 문서

신규 코드는 [MIT](LICENSE), 제3자 파일은 [별도 고지](THIRD_PARTY_NOTICES.md)를 따릅니다.

[전체 과정](docs/00-project-brief.md) · [검증 이력](docs/04-validation-history.md) · [AI 기록](docs/05-ai-and-human-decisions.md) · [배포 기록](docs/07-deployment-runbook.md) · [구독 AI 사용](docs/08-subscription-ai.md)

다른 컴퓨터의 시작 절차는 [인계 안내](docs/09-handoff-other-computer.md)를 따릅니다.
