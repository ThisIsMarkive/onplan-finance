"""Actual PyPortfolioOpt -> shared household ledger connection test.

Run with the portfolio validation environment. All inputs are synthetic unit
fixtures copied from the portfolio test; one synthetic return observation is
treated as one accounting period. No empirical annual/monthly conversion.
"""
from pathlib import Path
import sys,json,hashlib
from decimal import Decimal as D
import numpy as np
import pandas as pd
from pypfopt import EfficientCVaR
from planning_core import Balance,GoalDue,accrue_month,liquidate,fund_goals

base=Path(__file__).resolve().parent
source=json.loads((base.parent/'portfolio'/'portfolio-validation-results.json').read_text(encoding='utf-8'))
x=np.array(source['inputs']['train'])
mu=x.mean(axis=0)
engine=EfficientCVaR(pd.Series(mu),pd.DataFrame(x),beta=.8,weight_bounds=(.05,.75),solver='CLARABEL')
weights=np.array(list(engine.efficient_return(.0065).values()))
policy_weights={'equal_weight':np.ones(3)/3,'sample_CVaR_target':weights}
results=[]
for name,w in policy_weights.items():
    rows=[]
    for index,r in enumerate(x@w):
        begin=Balance(20,100,0)
        marked,audit=accrue_month(begin,net_income=0,essential_cost=0,
            investment_return=str(r),debt_rate=0,scheduled_principal=0)
        cash=liquidate(marked,marked.investment)
        end,goals=fund_goals(cash,[GoalDue('unit_goal_A',D(70),1),GoalDue('unit_goal_B',D(40),2)],10)
        total=sum(g['paid'] for g in goals)
        expected=D(120)+D(100)*D(str(r))
        residual=end.net_worth+total-expected
        assert abs(residual)<D('1e-24')
        assert end.cash>=10
        assert sum(g['paid'] for g in goals)<=cash.cash-10
        rows.append({'scenario':index,'portfolio_return':float(r),'goal_paid':[str(g['paid']) for g in goals],
            'goal_shortfall':[str(g['shortfall']) for g in goals],
            'all_goals_met':all(g['met'] for g in goals),'ending_cash':str(end.cash),
            'reconciliation_residual':str(residual)})
    results.append({'policy':name,'weights':w.tolist(),'rows':rows,
        'joint_achievement_frequency':sum(row['all_goals_met'] for row in rows)/len(rows),
        'mean_total_shortfall':float(sum(sum(D(x) for x in row['goal_shortfall']) for row in rows)/len(rows))})
data={'purpose':'Synthetic adapter verification; no customer and no performance estimate',
 'source_scenario_sha256':hashlib.sha256(json.dumps(source['inputs']['train']).encode()).hexdigest(),
 'scenarios':7,'policies':2,'reconciled_rows':14,'all_passed':True,
 'timing':'One synthetic observation per accounting period; no real data frequency claim',
 'results':results,'limits':'Single period and full liquidation fixture; no taxes, fee or multi-period policy tested here'}
(base/'adapter-results.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'all_passed':True,'reconciled_rows':14,
 'policies':[{'name':p['policy'],'frequency':p['joint_achievement_frequency'],'mean_shortfall':p['mean_total_shortfall']} for p in results]}))
