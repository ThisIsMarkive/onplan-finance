# 실행·공개·배포 기록

2026-11-16 기준. **로컬 Codex 연결·수동 전달 UI 구현과 실제 구독 AI 생성 2건(직접·브라우저 요청) 확인 완료, 공개 소스 업로드·소유자 전용 웹 배포 성공**다. 호스팅 사이트의 서버 AI는 연결하지 않는다.

| 항목 | 확인 상태 |
|---|---|
| 저장소 | [ThisIsMarkive/onplan-finance](https://github.com/ThisIsMarkive/onplan-finance), 최초 코드 공개 커밋 8b90f3ee94e0cf8a7ba533f90b461cb66fdee63a |
| 배포 웹 주소 | [onplan-finance.daring-coin-5511.chatgpt.site](https://onplan-finance.daring-coin-5511.chatgpt.site), 소유자 전용(private) 배포 성공, 로그인 화면 확인. 로그인 이후 화면 검증 보류 |
| 코드·배포 버전 | Sites 소스 a2423a9fd22bc94465835ae38e299808783bacec; 배포 appgdep_6afab1bcd46c81918978b802a46d1a88; 2026-11-16 07:33:27 UTC 성공 |
| 계산·연결 검증 | [통합 기록](../artifacts/verification.json): JS 50(코어18·서버18·모의 브리지14)·Python24·원장대조88,992. 단위·중첩이 달라 합산하지 않음 |
| 화면·API·배포 검수 | 로컬 브라우저·서버 API·실제 AI 확인. 원격 배포 성공과 로그인 화면 확인; 로그인 뒤 동작은 미검증 |
| 호스팅 AI | 서버 모델 연결 없음. 계산과 수동 전달용 요약 경로로 운영 |
| 로컬 AI | [직접 호출 기록](../artifacts/live-ai-verification.json), 2026-11-16 07:20:46 UTC, 29.823초. 브라우저 요청도 성공하여 실제 생성 2건·설명 5개 표시 확인. 수정 전 시작 중단 3회는 별도 |
| AI 검증 한계 | 모의 실행을 포함한 브리지 14개와 실제 생성 2건 분리. 실제 모델 ID 미제공, 계정 청구 화면 미감사. 합성 고객·한 브라우저 범위 |

## 실제 실행 명령

확인한 환경은 Node 24.22.1, Python 3.12.14다. 기본 웹은 외부 npm 패키지 설치가 필요하지 않다. 저장소 루트에서:

```sh
npm run dev
```

개발 서버는 빌드 후 http://127.0.0.1:4173에서 실행하며 Ctrl+C로 종료한다. 다른 터미널에서 다음 명령을 실행한다.

```sh
npm test
python analysis/verify_web_core.py
npm run build
npm run validate
```

Python 검사는 Node가 PATH에 있어야 하며 fixtures 결과를 갱신한다. [package.json](../package.json)을 명령 기준으로 삼는다.

로컬 구독 AI 경로의 실행 명령은 다음과 같다. 설치된 Codex CLI와 사용자의 ChatGPT 로그인이 필요하다. 로그인되지 않았다면 사용자가 공식 `codex login` 절차를 완료한다. 개발 환경에서 실제 호출을 확인했지만 다른 기기의 설치·계정·한도 상태까지 보장하지 않는다.

```sh
codex login status
npm run dev:ai
```

`dev:ai`는 `node scripts/dev.mjs --ai=codex`다. 기본 계산 서버와 AI 서버를 같은 포트로 동시에 실행하지 않는다. 로컬 브리지는 호스팅 빌드에 인증정보를 넣는 방식이 아니다. [구독 AI 안내](08-subscription-ai.md)에 비용·인증·지원 범위를 정리했다.

build는 브라우저 파일·공통 코어·Worker를 묶어 dist/server/index.js와 호스팅 manifest를 생성한다. 생성물을 직접 수정하지 않는다. validate는 ESM·default.fetch 형태 검사이며 시각 검수·네트워크·모든 API 시험이 아니다. 기존 build.sh도 현재는 같은 Node 빌드를 실행하는 wrapper다.

연구용 Python은 [research/README.md](../research/README.md)의 별도 환경·lock을 따른다. PyPortfolioOpt/HARK 설치는 일반 웹 실행에 필요하지 않다.

## 외부 공개를 완료할 때

1. 소스를 업로드하고 커밋을 기록한다. 합성 입력·연구 자료·LICENSE·고지가 함께 있는지 확인한다.
2. 해당 소스의 테스트·빌드·산출물 검사를 실행한다. 변경된 core의 해시와 기존 검증 결과가 다르면 필요한 시험을 다시 수행한다.
3. 생성한 Worker 산출물을 현재 소유자 전용(private) 접근권한을 유지하여 배포하고 실제 식별자·시각·URL을 기록한다. 공개 GitHub 요청을 웹 공개 승인과 동일시하지 않는다.
4. 배포 URL의 응답·빈폼·파일 가져오기·오류·재계산·예제 수치·작은 화면, health·상태·계산 API를 실제 확인한다.
5. 위 대기 항목을 실제 결과로 바꾼다. 예상 URL이나 자동시험만으로 배포·시각 검수 완료라고 쓰지 않는다.

[CI 설정](../.github/workflows/verify.yml)은 Node24·Python3.12에서 테스트·독립 검산·빌드·산출물 검사를 수행하도록 작성되었다. 저장소에 업로드되어 실제 실행되기 전에는 CI 성공 이력이 아니다.

## 보안과 고지

공개 자료는 합성 고객·수학 예제다. 개인 대화·공식 양식·실제 고객·인증정보·컴퓨터 절대경로는 제외한다. [공개 사본 명세](../research/PUBLIC_MANIFEST.json)에 정리와 해시를 기록했다. 재실행한 결과를 공개할 때도 경로·입력·키 노출을 확인한다.

구독 AI 연결은 사용자의 로컬 Codex CLI를 사용한다. API 키를 만들거나 요청하지 않으며 인증파일·세션 토큰을 저장소·브라우저·호스팅 서버로 복사하지 않는다. API로 자동 전환하거나 크레딧을 추가 구매하지 않는다. 구독 한도·기존 크레딧·계정 정책은 적용될 수 있다. 인증·시간초과·금지 도구·응답 검증 등의 모의 시험과 실제 응답의 숫자·근거·해석 검토를 구분한다. 아직 시험하지 않은 실제 장애와 계정 청구 조건까지 검증한 것으로 쓰지 않는다.

신규 코드는 [MIT](../LICENSE), 제3자 파일은 [별도 고지](../THIRD_PARTY_NOTICES.md)를 따른다. 연구 의존성 전체가 루트 MIT로 바뀌지 않는다. 대회 제출은 [공식 안내](https://www.ifpk.org/?data_usn=181814&mnu_usn=67&mode=view&page_no=1)의 본문·부록·식별정보·동의서 요건을 별도로 충족해야 한다.

GitHub와 Sites 소스는 각각의 커밋을 사용합니다. 첫 게시 이후의 문서 정정은 실행 코드 변경과 구분합니다. GitHub Actions 원격 실행은 아직 확인하지 않았으며 로컬 50개 시험 통과를 원격 성공으로 대신 표시하지 않습니다.
