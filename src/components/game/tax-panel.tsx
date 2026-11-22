import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { AlertTriangle, Landmark, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import type { Result } from '@/lib/game/gameplay';
import { essentialObligations } from '@/lib/game/obligations';
import { addMonths, progressiveTax, propertyTax, setTaxStance, stanceInfo, taxStance, taxableIncome, LOOPHOLE_SHARE, type TaxStance } from '@/lib/game/taxes';
import { adviseSolvency } from '@/lib/ai-solvency.functions';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

function estimate(c: Career) {
  const income = taxableIncome(c, addMonths(c.date, -3));
  const incomeTax = progressiveTax(income), pt = propertyTax(c), stance = taxStance(c), liability = incomeTax + pt;
  const due = stance === 'honest' ? liability : stance === 'loophole' ? Math.round(liability * LOOPHOLE_SHARE) : 0;
  return { income, incomeTax, pt, liability, due, stance };
}

export function TaxCard({ career, onResult }: { career: Career; onResult?: ((r: Result) => void) | undefined }) {
  const t = estimate(career);
  const hidden = career.life?.unpaidTax ?? 0, exposure = Math.round(career.corruption?.exposure ?? 0);
  return <section className="game-card p-4 mt-3" aria-label="Quarterly Tax & Compliance">
    <h3 className="section-label"><Landmark className="inline size-4" /> Quarterly Tax & Compliance</h3>
    {hidden > 0 && <div className="life-warning" role="alert"><AlertTriangle className="size-4" /> {usd(hidden)} in undeclared tax. Audit exposure {exposure}% — at 70% auditors demand it back plus a 50% fine.</div>}
    <div className="expense-list">
      <span>Taxable income (last quarter)<b>{usd(t.income)}</b></span>
      <span>Income tax (10% / 20% / 35%)<b>{usd(t.incomeTax)}</b></span>
      <span>Property & luxury asset tax<b>{usd(t.pt)}</b></span>
      <span className="total">Estimated tax you will pay<b data-testid="tax-due">{usd(t.due)}</b></span>
    </div>
    <div className="grid gap-2 mt-3">
      {(Object.keys(stanceInfo) as TaxStance[]).map(s => <Button key={s} variant={t.stance === s ? 'game' : 'gameOutline'} className="w-full h-auto flex-col items-start py-2" disabled={!onResult || t.stance === s} onClick={() => onResult?.(setTaxStance(career, s))}>
        <span>{stanceInfo[s].label}</span><small className="opacity-80 font-normal">{stanceInfo[s].hint}</small>
      </Button>)}
    </div>
  </section>;
}

const offlineTips = (c: Career) => {
  const o = essentialObligations(c), tips: string[] = [];
  if (c.money < o.total) tips.push('Your cash will not cover next quarter. Move to a cheaper home or lower your lifestyle tier.');
  if ((c.life?.billArrears ?? 0) > 0) tips.push('Clear past-due bills first; they grow 10% every quarter and hurt your credit.');
  if (!c.job) tips.push('A steady job adds monthly income — check Career & Business.');
  if (c.businesses.length) tips.push('A dividend from a profitable company can bridge a shortfall.');
  return tips.length ? tips : ['You are solvent. Keep a quarter of bills in reserve and file honestly.'];
};

export function SolvencyAdvisor({ career }: { career: Career }) {
  const [goal, setGoal] = useState(''), [advice, setAdvice] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const advise = useServerFn(adviseSolvency);
  const run = async () => {
    setBusy(true); setError(''); setAdvice('');
    const o = essentialObligations(career), t = estimate(career);
    try {
      const r = await advise({ data: { goal, money: { cash: career.money, arrears: career.life?.billArrears ?? 0, obligations: o.total, taxDue: t.due, income: t.income, stance: t.stance, exposure: career.corruption?.exposure ?? 0, housing: career.housing?.currentPropertyId ?? 'room', lifestyle: career.life?.lifestyle?.tierId ?? 'balanced' } } });
      if (r.ok) setAdvice(r.text); else setError(r.error);
    } catch { setError('The advisor is offline. Here are some quick tips instead.'); }
    finally { setBusy(false); }
  };
  return <details className="game-card p-4 mt-3">
    <summary className="section-label cursor-pointer"><Sparkles className="inline size-4" /> AI Financial Solvency Advisor</summary>
    <input className="w-full mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm" maxLength={200} placeholder="e.g. Save $50,000 for a Senate run" value={goal} onChange={e => setGoal(e.target.value)} />
    <Button variant="game" className="w-full mt-2" disabled={busy || goal.trim().length < 2} onClick={run}>{busy ? 'Thinking…' : 'Get my plan'}</Button>
    {advice && <p className="mt-3 text-sm">{advice}</p>}
    {error && <div className="mt-3 text-sm"><p className="text-muted-foreground">{error}</p><ul className="list-disc pl-5 mt-1">{offlineTips(career).map(t => <li key={t}>{t}</li>)}</ul></div>}
  </details>;
}
