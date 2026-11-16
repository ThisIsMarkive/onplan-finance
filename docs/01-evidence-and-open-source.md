# 연구 근거와 공개 코드의 채택 범위

아래는 원문과 실행 결과를 대조한 선택이다. 논문의 인정도나 저장소 인기도는 정확성·한국 가계 적합성·투자성과를 보증하지 않는다. 검증하지 못한 인용횟수 순위와 변동하는 stars/forks 수치는 채택 근거로 제시하지 않는다.

## 핵심 논문

| 정확한 서지와 원문 | 채택한 원리 | 적용하지 않은 주장 |
|---|---|---|
| Campbell, J. Y. (2006), *Household Finance*, **The Journal of Finance 61(4), 1553–1604**, DOI 10.1111/j.1540-6261.2006.00883.x. [원문](https://www.nber.org/system/files/working_papers/w12149/w12149.pdf) | 비거래 노동소득, 주택의 비유동성, 차입제약, 세금 등 가계 전체의 조건. AFA Presidential Address라는 학술적 맥락도 확인 | 공통원장 코드나 한국 제도 엔진을 논문이 제공·검증했다는 주장 |
| Shefrin, H. & Statman, M. (2000), *Behavioral Portfolio Theory*, **JFQA 35(2), 127–151**, DOI 10.2307/2676187. [출판사](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/abs/behavioral-portfolio-theory/87E1D1AE8C8A8365B38CEA952EC28DF6) | 목표 층위와 기대 수준을 설명하는 관점. 출판사의 Sharpe Best Paper Award 표기 확인 | 계정 간 공분산 무시, 주관적 확률왜곡, 복권형 위험선택을 권장정책으로 채택하지 않음 |
| Das, S., Markowitz, H., Scheid, J. & Statman, M. (2010), *Portfolio Optimization with Mental Accounts*, **JFQA 45(2), 311–334**, DOI 10.1017/S0022109010000141. [저자 원문](https://srdas.github.io/Papers/DMSS.pdf) | 목표 문턱과 허용 부족을 명시하고 금융자산 선택과 연결 | 정규분포 기반 매핑과 공매도 관련 조건을 생략한 전 가계의 최적성 보장 |
| Rockafellar, R. T. & Uryasev, S. (2000), *Optimization of Conditional Value-at-Risk*, **Journal of Risk 2, 21–41**, DOI 10.21314/JOR.2000.038. [원문](https://sites.math.washington.edu/~rtr/papers/rtr179-CVaR1.pdf) | 보조 문턱과 초과손실을 이용한 CVaR 계산·최적화 | 금융수익률 CVaR와 가계 목표부족을 동일시하거나 비선형 세금·이산결정까지 볼록성 보장 |
| Rockafellar, R. T. & Uryasev, S. (2002), *Conditional Value-at-Risk for General Loss Distributions*, **Journal of Banking & Finance 26(7), 1443–1471**. [원문](https://sites.math.washington.edu/~rtr/papers/rtr187-CVaR2.pdf) | 이산 표본의 동률과 VaR 지점의 분수 확률질량 처리 | 분위수 이상 관측치의 단순 평균을 항상 정확한 CVaR라고 부르기 |

확인 위치: Campbell §I.B, Das 2010 §III·V, 2000 CVaR 논문 §2 식 (1)–(10), 2002 논문 Definition 3·Theorem 10. 목표 입력 항목과 원장·부족 지표의 결합은 이 프로젝트의 설계이며 어느 한 논문의 완제품이 아니다.

## 조건부 확장

Carroll, C. D. (1997), *Buffer-Stock Saving and the Life Cycle/Permanent Income Hypothesis*, **QJE 112(1), 1–55**, DOI 10.1162/003355397555109 ([출판사](https://academic.oup.com/qje/article-abstract/112/1/1/1870884))는 예방적 저축의 배경이다. 이후 [이론 원고](https://www.econ2.jhu.edu/people/ccarroll/papers/BufferStockTheory.pdf)와 HARK의 특정 버전은 별개다. 기본 모수로 한국 가계의 적정 비상자금 개월수를 도출하지 않는다.

Das, S. R., Ostrov, D., Radhakrishnan, A. & Srivastav, D. (2020), *Dynamic portfolio allocation in goals-based wealth management*, **Computational Management Science 17, 613–640**, DOI 10.1007/s10287-019-00351-7 ([원문](https://srdas.github.io/Papers/GBWM_DP2.pdf))은 조건부 확장 후보다. 시작 시 정한 현금 유출입, 상태격자, 분포가정과 공통 종말시점의 목표를 임의의 다기간 가계목표와 혼동하지 않는다. 가중 목표값은 단일 성공확률이 아니다. 현재 전체 DP 통합은 채택하지 않았다.

## 실행한 코드와 현재 웹앱은 구분한다

| 코드 | 고정 근거·라이선스 | 실제 확인 | 프로젝트 역할 |
|---|---|---|---|
| [PyPortfolioOpt 1.6.0](https://github.com/PyPortfolio/PyPortfolioOpt/tree/0186e707a0d2ec03406608d3400539d0f140c625) | MIT, 커밋 고정 | 합성 CVaR 6개 검증그룹, 핵심 두 파일의 설치본 대조 | 투자 가능 잉여와 적합한 입력이 있을 때만 금융포트폴리오 후보 생성 |
| [HARK 0.17.2](https://github.com/econ-ark/HARK/tree/269085077b84cb50feb49d0cd54bbf4da5fa3199) | Apache-2.0, 커밋 고정 | 합성 2기간 소비·저축 12개 검사 | 효용·소득위험 가정을 설명할 수 있을 때만 정책 비교 |
| [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills/tree/5c498eacf7057e31238c4c5a8012a1afe9ec7c8a) | MIT, 시간가치 모듈 고정 | 해당 모듈 17개 독립 검산 | 연금현가·상환 산식의 교차검산 참고 |

Riskfolio의 중복 최적화 기능과 TradingAgents의 매매 구조는 이번 가계 진단의 필수 기능으로 선택하지 않았다. 연구용 Python 실행은 웹에서 PyPortfolioOpt/HARK가 매 요청마다 실행된다는 뜻이 아니다. 웹 JavaScript 계산은 별도 구현·시험 대상으로 [현재 구조](06-web-architecture.md)에 표시한다.

현재 웹은 공통 JavaScript 코어로 계산하며 PyPortfolioOpt/HARK를 실행하지 않는다. 연구용 라이브러리 검증을 웹 최적화 기능으로 표시하지 않는다. 세부 증거: [근거 감사](../research/validation/evidence/evidence-audit.json), [검증 이력](04-validation-history.md), [제3자 고지](../THIRD_PARTY_NOTICES.md).
