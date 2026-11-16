# Third-party notices

신규 프로젝트 코드의 [MIT License](LICENSE)는 아래 원저작자의 저작권·라이선스를 대체하지 않습니다. 연구 자료와 현재 웹 런타임 의존성을 구분합니다.

## 시간가치 모듈 — MIT, 원본 포함

[JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills)의 커밋 `5c498eacf7057e31238c4c5a8012a1afe9ec7c8a`, 원본 경로 `plugins/core/skills/time-value-of-money/scripts/time_value_of_money.py`입니다. Copyright (c) 2026 Joel Lewis.

[fixtures 원본](fixtures/time_value_of_money.py)과 [MIT 고지](fixtures/JOEL_LICENSE.txt)를 보존했습니다. 같은 사본은 [research/validation/tvm](research/validation/tvm/) 및 [research/customer/reference](research/customer/reference/)에도 있습니다. 원본 SHA-256은 `fef6099e25f517e6848c5a59da990285a2ca10f44765203ab333aa9ac37b2375`입니다. 원본 바이트를 수정하지 않았습니다.

Python 독립 검사의 기준값으로 사용하며 브라우저·Worker에서 로드하지 않습니다. 원저장소 전체를 검증했다는 뜻은 아닙니다.

## PyPortfolioOpt — MIT, 연구 소스 일부 포함

[PyPortfolioOpt 1.6.0](https://github.com/PyPortfolio/PyPortfolioOpt/tree/0186e707a0d2ec03406608d3400539d0f140c625), 커밋 `0186e707a0d2ec03406608d3400539d0f140c625`를 검토했습니다.

검토한 원본 모듈·시험·프로젝트 메타데이터를 [source_snapshot](research/validation/portfolio/source_snapshot/)에, 원저작권·허가 고지를 [LICENSE](research/validation/portfolio/source_snapshot/LICENSE)에 보존했습니다. 원본 소스 사본은 수정하지 않았습니다. 대조 범위는 [source-and-license-info.json](research/validation/portfolio/source-and-license-info.json)을 따릅니다.

프로젝트의 독립 검증 스크립트는 공개 사본에서 컴퓨터 절대경로 출력만 정리했습니다. 현재 웹은 PyPortfolioOpt를 설치·호출하지 않습니다.

## HARK — Apache-2.0, 별도 연구 의존성

[econ-ark/HARK 0.17.2](https://github.com/econ-ark/HARK/tree/269085077b84cb50feb49d0cd54bbf4da5fa3199), 커밋 `269085077b84cb50feb49d0cd54bbf4da5fa3199`입니다. [Apache-2.0 고지](research/validation/hark/HARK-LICENSE.txt)와 [패키지 출처](research/validation/hark/package-provenance.json)를 보존합니다.

HARK 전체 소스·설치 패키지는 포함하지 않습니다. 연구용 스크립트·결과·lock을 재실행할 때 별도로 설치합니다. HARK 원본은 수정하지 않았습니다. 프로젝트 검증 스크립트는 공개용 경로 기록만 정리했습니다. 현재 웹 런타임에 HARK 실행 기능은 없습니다.

## 전이 의존성과 웹 런타임

[portfolio lock](research/validation/portfolio/requirements-lock.txt)과 [hark lock](research/validation/hark/requirements-lock.txt)은 별도 Python 연구환경의 버전 목록입니다. NumPy·SciPy·CVXPY·솔버 등은 각자의 라이선스를 따르며 루트 MIT로 일괄 변경되지 않습니다.

[라이선스 메타데이터](research/validation/portfolio/dependency-license-metadata.json)는 일부 값이 비어 있는 설치 메타데이터 기록입니다. 완전한 라이선스 감사나 모든 배포 형태의 의무 충족을 뜻하지 않습니다. 패키지 바이너리·가상환경은 포함하지 않았습니다. 이후 함께 배포하는 패키지의 LICENSE/NOTICE는 별도로 확인해야 합니다.

현재 package.json에는 외부 npm 의존성이 없습니다. 빌드·시험은 Node 내장 모듈을 사용합니다. Node 및 호스팅 플랫폼 자체의 조건은 각각 적용됩니다.

논문·공식 통계·규정은 [근거 문서](docs/01-evidence-and-open-source.md)와 [고객 근거](docs/03-fictional-customer.md)에 링크합니다. 논문 전문·공식 통계 PDF·참가작 양식은 복제하지 않았습니다. 연구 인용은 저작권을 이전받았다는 뜻이 아닙니다.

공개 정리 내역과 원본/사본 해시는 [PUBLIC_MANIFEST.json](research/PUBLIC_MANIFEST.json)에 있습니다.
