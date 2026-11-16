# 설치된 구독으로 AI 사용하기

확인일: 2026-11-16. 사용자는 별도 API 비용 대신 이미 사용하는 ChatGPT/Claude 구독을 요청했다. 이 프로젝트는 **설치된 Codex CLI와 사용자의 ChatGPT 로그인을 이용하는 로컬 연결**을 구현했다. API 키 발급은 필요하지 않다. 브리지와 수동 전달 UI를 구현했으며 **실제 구독 AI 생성 2건(직접·브라우저 요청)을 확인했다.** [직접 호출 증거](../artifacts/live-ai-verification.json), [통합 검증 기록](../artifacts/verification.json), [배포 기록](07-deployment-runbook.md)은 서로 다른 검증 범위를 기록한다.

## 세 가지 사용 방식

| 방식 | 계산·설명 | 인증과 실행 위치 |
|---|---|---|
| 호스팅 사이트 | 계산, 규칙 기반 해설, 수동 전달용 요약 경로 | 서버 모델 연결 없음. 방문자의 PC에 설치된 CLI를 원격 호출하지 않음 |
| 로컬 기본 실행 | `npm run dev`: 같은 계산기 | AI 로그인이 필요하지 않음 |
| 로컬 구독 AI | `npm run dev:ai`: 계산 결과의 AI 설명 경로 | 사용자 PC의 Node 서버 → 설치된 Codex CLI → OpenAI. 합성 고객 실제 생성 2건 성공 |

호스팅용 요약은 미리보기·복사·TXT 내보내기를 제공하며 사용자가 ChatGPT나 Claude에 직접 붙여넣는다. 이때 전송할 내용은 사용자가 먼저 확인한다. 요약 파일은 프롬프트 자료이며 모델 답변이 아니다. AI의 해설은 코드가 계산한 금액과 가정을 설명하며 입력이나 계산 결과를 자동 변경하지 않는다.

## 로컬 실행

Node와 공식 Codex CLI가 설치되어 있고 CLI를 터미널에서 실행할 수 있어야 한다. 프로젝트 루트에서 다음 명령을 사용한다.

```sh
codex login status
npm run dev:ai
```

로그인되어 있지 않으면 `codex login`을 실행하고 공식 브라우저 절차에서 ChatGPT 계정으로 로그인한다. 앱은 인증파일을 열거나 복사하지 않는다. `dev:ai`는 `node scripts/dev.mjs --ai=codex`를 호출한다. 기본 서버와 같은 포트를 사용하므로 `npm run dev`를 먼저 종료한다. 화면의 연결 상태를 확인하고 계산을 마친 뒤 AI 설명을 요청한다.

OpenAI 공식 안내는 ChatGPT 로그인을 구독 접근, API 키를 사용량 기반 접근으로 구분한다. `codex exec`는 저장된 CLI 인증을 재사용하며 JSON Schema 출력을 지원한다. 이 동작이 로컬 연결의 근거다. 구조화 출력은 내용의 재무적 정확성까지 보증하지 않는다. [인증](https://learn.chatgpt.com/docs/auth?surface=cli), [비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode).

## 사용량·비용·데이터

- 앱은 API 키를 요구하지 않고 API 과금 경로로 자동 전환하지 않는다. 추가 크레딧 구매도 수행하지 않는다.
- 구독 사용량 한도, 조직 정책, 계정에 이미 있는 크레딧은 적용될 수 있다. 구독 로그인만으로 무제한·항상 무료라고 보장하지 않는다. 실행 전 계정의 사용량 설정을 확인한다. [공식 사용량·크레딧 안내](https://learn.chatgpt.com/docs/pricing?codex-pricing-plans=individual).
- 로컬 브리지는 모델까지 오프라인으로 실행한다는 뜻이 아니다. 설명 요청에 포함된 가상 고객 입력·계산 요약은 CLI를 통해 OpenAI로 전달된다. 공개 예제로 검증하며 실존 고객 식별정보를 넣지 않는다.
- 인증·시간초과·금지 도구·잘못된 응답 등의 모의 브리지 시험 14개가 통과했다. 모든 실제 계정의 한도 초과·장애·청구 조건까지 검증한 것은 아니다.

## 실제 확인한 응답과 한계

2026-11-16 07:20:46 UTC에 합성 입력으로 ChatGPT 인증 호출이 성공했다. 응답은 29.823초, 설명은 5개였으며 숫자·근거 연결과 핵심 해석을 검토했다. CLI가 실제 모델 ID를 제공하지 않아 화면과 증거에는 “Codex CLI 기본 모델”로 표시한다. 입력 해시는 [실호출 기록](../artifacts/live-ai-verification.json)에 있다.

브라우저 AI 버튼으로 두 번째 실제 생성을 요청해 설명 5개와 숫자 근거 표시를 확인했다. 수동 요약은 7,910자로 복사되며 재무 입력 27개·대안 3개를 포함하고 개인 계획명은 제외됐다. 첫 시작 안내를 도구 실행으로 오분류한 오류를 수정했으며, 정확히 알려진 Code Mode 비활성 안내만 허용하고 실제 도구 차단은 유지했다. 수정 전 시작 중단 3회는 성공 2건과 구분한다. 모의 시험을 포함한 브리지 14개는 실제 호출 14건이 아니다. 한 합성 입력의 성공은 미래 답변의 정확성·가용성을 보장하지 않으며 계정 청구 화면은 감사하지 않았다.

## 별도 SIWC 통합과 호스팅의 경계

OpenAI는 로컬·오픈소스 앱의 기존 Codex app-server 인증과 상용·호스팅 서비스의 허용 범위를 구분하고, 더 명확한 사용자 통제를 위해 별도 **Sign in with ChatGPT(SIWC)** 통합을 권장한다. 이번 구현은 `codex exec` 기반 로컬 브리지이며 app-server나 SIWC OAuth를 구현한 제품이라고 주장하지 않는다. [App Server의 Auth endpoints](https://learn.chatgpt.com/docs/app-server#auth-endpoints).

현재 SIWC 공식 안내는 적격 Plus/Pro 사용자의 구독 사용과 로컬 오픈소스 앱 연결을 지원하며, 유료·원격 호스팅 앱에는 별도 접근 신청을 안내한다. 웹사이트에 로그인 버튼을 붙이는 것만으로 구독 모델 이용 권한이 생기는 것은 아니다. 향후 SIWC 채택은 별도 구현·승인·검증 과제다. [Quickstart](https://developers.openai.com/siwc/quickstart), [공식 구현 예제의 Usage policy and terms](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt).

## Claude는 자동 연결하지 않음

현재 개발 환경에서 설치와 로그인을 확인한 CLI는 Codex이며 Claude 자동 연결은 구현하지 않았다. 수동 전달 자료를 사용자가 자신의 Claude 화면에 붙여넣을 수는 있다. Anthropic 공식 안내는 사용자가 변경하지 않은 Claude Code에 자기 구독으로 로그인하는 경우와, 제3자가 구독 인증정보를 수집·저장하거나 사용자를 대신해 요청을 중계하는 경우를 구분한다. 이 문서는 모든 형태의 Claude 연결이 허용된다고 판단하지 않는다. [Claude Code: Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance).

코드·인증파일·사용자 계정을 공개 저장소에 함께 올리는 방식은 채택하지 않는다. 개발에 사용한 AI, 계산해설, 실제 모델 응답을 나누어 기록하는 원칙은 [AI와 사람의 결정](05-ai-and-human-decisions.md)을 따른다.
