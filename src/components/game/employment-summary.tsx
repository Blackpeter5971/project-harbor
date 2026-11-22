import { Award } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import { employmentPay } from '@/lib/game/employment';
import { employmentForecast } from '@/lib/game/employment-forecast';
import { monthLabel } from '@/lib/game/gameplay';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export function EmploymentSummary({ career }: { career: Career }) {
  const pay = employmentPay(career);
  const forecast = employmentForecast(career);
  const promotion = career.job?.promotion;
  return <>
    {promotion && <section className="notification" aria-label="Promotion confirmation"><Award /><div><b>{promotion.title}</b><p>Promoted {monthLabel(promotion.date)} · level {promotion.fromLevel} → {promotion.toLevel}</p><p>Base pay: {usd(promotion.previousSalary)} → <span className="amt-in">{usd(promotion.salary)}/month</span></p><p>Quarterly wage: {usd(promotion.salary * 3)}</p></div></section>}
    <h3 className="section-label mt-3">Quarterly employment forecast</h3>
    <div className="expense-list"><span>Employment income<b>{usd(pay.quarterly)}</b></span><span>Living budget<b>{usd(forecast.living)}</b></span><span>Family & transport<b>{usd(forecast.family + forecast.transport)}</b></span><span>Loan payments & overdue fees<b>{usd(forecast.loans)}</b></span><span>Projected net employment income<b className={forecast.net >= 0 ? 'amt-in' : 'amt-out'}>{usd(forecast.net)}</b></span></div>
    <p className="mini-note mt-2">Estimate before optional spending and unexpected costs. Other income and campaign, business and treasury balances are excluded.</p>
  </>;
}