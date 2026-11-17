# 다른 컴퓨터에서 이어서 작업하기

2026-11-16 인계 기록. 이 문서와 함께 첨부된 소스 ZIP은 앱 코드·연구 검증 코드·문서·가상 고객 예제·실제 시험 기록을 포함한다. 인증정보와 설치 환경은 포함하지 않는다.

## 가장 빠른 시작

Node 24를 설치한 컴퓨터에서 공개 저장소를 받는다. Git이 없다면 Notion의 `ONPLAN_source.zip`을 풀고 `onplan-finance` 폴더를 연다.

```sh
git clone https://github.com/ThisIsMarkive/onplan-finance.git
cd onplan-finance
npm run dev
```

브라우저에서 `http://127.0.0.1:4173`을 연다. 기본 실행에는 npm 패키지 설치·API 키·AI 로그인이 필요 없다. 초기 입력은 비어 있다. 화면의 **불러오기**로 `examples/contest-customer.json`을 선택한 뒤 **진단·대안 비교하기**를 누른다. 다른 고객은 직접 입력하거나 JSON으로 가져온다.

## 구독으로 AI 설명 사용

공식 Codex CLI를 설치하고 **그 컴퓨터에서 본인의 ChatGPT 계정으로 로그인**한다. 다른 컴퓨터의 인증파일을 복사하거나 GitHub·Notion에 올리지 않는다. 기본 서버가 실행 중이면 먼저 Ctrl+C로 종료한다.

```sh
codex login
codex login status
npm run dev:ai
```

로그인 상태가 ChatGPT로 확인되면 계산 뒤 **근거·설명 → AI 설명 요청**을 사용한다. 설치된 CLI가 클라우드 모델을 호출하며 기존 구독 한도가 적용된다. 앱은 API 키 인증을 거부하고 유료 API로 자동 전환하지 않는다. 자체 모델을 오프라인 실행하는 방식은 아니다. 기존 크레딧·계정 사용량 설정은 사용자가 관리한다.

Codex가 없는 환경에서는 **요약 복사 / 요약 파일 저장**으로 계산 요약을 받아, 사용 중인 ChatGPT나 Claude에 직접 전달할 수 있다. 이는 실시간 자동 연결과 별개다.

## 검증 다시 실행

```sh
npm test
python analysis/verify_web_core.py
npm run build
npm run validate
```

Python 독립 검사는 선택 사항이며 Python 3.12에서 확인했다. Node가 PATH에 있어야 한다. 현재 JavaScript 자동시험 50개, Python 확인 24개, 원장 대조 88,992회가 통과했다. Codex 호출을 흉내 낸 테스트와 실제 구독 생성 2건을 구분해 기록했다. `artifacts/verification.json`과 `artifacts/live-ai-verification.json`을 읽는다. GitHub Actions의 원격 실행 결과는 아직 별도 확인하지 않았다.

## 파일 안내

| 경로 | 이어서 할 일 |
|---|---|
| `src/core.js` | 계산 정책·원장 변경. 변경하면 JS·Python 검산을 다시 실행 |
| `public/` | 입력·대안 비교·설명 화면 |
| `scripts/codex-bridge.mjs`, `src/explanation.js` | 로컬 구독 연결·고정 계산근거·AI 응답 검증 |
| `examples/contest-customer.json` | 대회용 가상 고객의 평탄 입력 |
| `research/customer/` | 상세 고객 설정·통계와 제도 근거·기초 진단 |
| `research/validation/` | 이전 논문·오픈소스 검증 코드와 고정 버전 기록 |
| `docs/00`~`docs/08` | 역설계 과정·재무설계 구조·검증·AI 활용·배포 기록 |
| `fixtures/`, `artifacts/` | 시험 결과·계약 가정·실제 생성 증거 |

## 현재 완료 상태와 남은 작업

- 공개 GitHub에 앱 소스를 업로드했다. 최초 코드 공개 커밋은 `8b90f3ee94e0cf8a7ba533f90b461cb66fdee63a`다. 이후 문서 정정은 별도 커밋으로 반영될 수 있다.
- [배포 웹](https://onplan-finance.daring-coin-5511.chatgpt.site)은 배포 성공을 확인했다. 현재 소유자 전용이며 로그인 이후의 배포 화면 검증은 보류했다. 이 주소의 서버에서는 구독 AI를 실행하지 않는다.
- 로컬에서는 빈 입력·가상 고객·다른 고객·모바일 폭·파일 입출력·실제 AI 생성·수동 전달을 확인했다.
- 전체 재무설계가 완성된 참가작 제출 파일이라는 뜻은 아니다. 최종 권고의 우선순위·실행표·모니터링과 대회 본문·부록 양식 반영은 이어서 작업한다.
- 공개 서비스에서 방문자의 구독을 자동 사용하는 별도 OAuth 통합, Claude 자동 연결, 은퇴·세금·보험의 상세 계산은 현재 구현 범위 밖이다.

다음 작업자에게는 이 문서와 Notion 프로젝트 홈을 전달하면 된다. 실제 고객정보·인증정보를 추가할 경우 공개 저장소와 첨부 파일에 포함하지 않는다.
