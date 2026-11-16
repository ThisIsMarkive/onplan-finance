# 공개용 연구·검증 기록

웹 구현 이전의 자료평가·수학 검증·가상 고객 기초진단을 위한 **선별 사본**입니다. 현재 제품은 [루트 README](../README.md), 웹 검증은 [fixtures 결과](../fixtures/verification-results.json)를 따릅니다.

과거 파일의 “고객 미선정”, “웹앱 미구현”, “공개 전”은 해당 단계의 사실입니다. 이후 선택·구현을 처음부터 완료했던 것처럼 고치지 않았습니다. 원본 DOCX·개인 대화·공식 양식·가상환경·캐시는 공개하지 않습니다.

| 경로 | 기록 |
|---|---|
| [validation/tvm](validation/tvm/) | 고정 시간가치 모듈·MIT 고지·17개 검산 |
| [validation/integration](validation/integration/) | 원장 46개·1,000회 불변식, 14개 연결 결과 행 |
| [validation/portfolio](validation/portfolio/) | CVaR 6개 검증그룹·lock·소스·라이선스 |
| [validation/hark](validation/hark/) | 2기간 모형 12개 검사·설치 실패·lock |
| [validation/evidence](validation/evidence/) | 원문 채택 범위·원장 검토 |
| [customer](customer/) | 합성 입력 v1·기초계산 8개·통계·제도·수정 |

기본 산술은 별도 패키지 없이 아래와 같이 실행합니다. 결과를 갱신하므로 원래 증거를 보존하려면 작업 사본을 사용합니다.

```sh
python research/validation/tvm/verify_tvm.py
python research/validation/integration/verify_integration.py
python research/customer/calculate_baseline.py
```

PyPortfolioOpt와 HARK는 각각 별도 가상환경을 만든 뒤 해당 lock으로 설치합니다. 활성화 방법은 운영체제에 맞게 선택합니다.

```sh
python -m pip install -r research/validation/portfolio/requirements-lock.txt
python research/validation/portfolio/validate_portfolio.py
python research/validation/integration/verify_adapter.py
```

```sh
python -m pip install -r research/validation/hark/requirements-lock.txt
python research/validation/hark/validate_hark.py
```

연결 검증은 portfolio 결과와 NumPy를 사용합니다. 기본 웹에는 위 Python 패키지가 필요하지 않습니다.

[공개 명세](PUBLIC_MANIFEST.json)는 파일별 원본/사본 해시와 변경을 기록합니다. 개인 컴퓨터 절대경로·실행파일 위치, 원문 작업지시·대화, 비공개 템플릿 경로를 제외했습니다. 제3자 원본 코드·LICENSE는 바이트를 보존했습니다. 두 연구 검증 스크립트는 경로 기록만 정리했고 수학적 계산을 바꾸지 않았습니다.

고객 입력은 합성 자료이므로 원본 바이트를 보존하여 기존 결과의 입력 해시가 대응합니다. 다른 JSON은 공개용 정리·서식 변경으로 해시가 달라질 수 있습니다. 공개 요약은 참가자 발화의 완전한 전사나 최종 승인서가 아닙니다.

[검증 맥락](../docs/04-validation-history.md) · [AI와 사람의 결정](../docs/05-ai-and-human-decisions.md) · [제3자 고지](../THIRD_PARTY_NOTICES.md)
