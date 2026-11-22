import { ACTION_COST } from '@/lib/game/energy-costs';
import type { Career } from '@/lib/game/career';
import { activeCrisisWarnings } from '@/lib/game/crisis-news';

const TIPS = [
  'Rallies build momentum, but momentum fades between turns — keep campaigning steadily.',
  'Commissioned polls show where voters stand, including the undecided share you can still win.',
  'Endorsements from voter groups add support and momentum to an active campaign.',
  'Campaign funds and personal savings are separate: donations cannot pay your bills.',
  'Salaries are paid monthly and settled at the end of each three-month turn.',
  'You get five actions every turn. Unused actions do not carry over.',
  'Party positions unlock more influential activities, but make switching parties costlier.',
  'Primaries come before the general election — win your party first.',
];

const monthName = (d: Date) => d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
export function periodLabel(date: string) {
  const s = new Date(date + 'T00:00:00Z'); const e = new Date(s); e.setUTCMonth(e.getUTCMonth() + 2);
  return `${monthName(s)}–${monthName(e)} ${e.getUTCFullYear()} · Q${Math.floor(s.getUTCMonth() / 3) + 1}`;
}

export function turnWarnings(c: Career): string[] {
  const w: string[] = [];
  const now = new Date(c.date + 'T00:00:00Z').getTime();
  const months = (d: string) => (new Date(d + 'T00:00:00Z').getTime() - now) / (86400000 * 30.4);
  if (c.money < 0) w.push(`Personal balance is in deficit ($${Math.round(c.money).toLocaleString('en-US')}).`);
  if (!c.job && !c.campaign && c.money < 500) w.push('No regular income — consider applying for a job in Career & Business.');
  if (c.campaign) {
    const cp = c.campaign;
    if (cp.primaryDate && cp.phase === 'primary' && months(cp.primaryDate) <= 6) w.push(`Primary election within ${Math.max(0, Math.ceil(months(cp.primaryDate)))} months.`);
    else if (months(cp.electionDate) <= 6) w.push(`Election day within ${Math.max(0, Math.ceil(months(cp.electionDate)))} months.`);
    if (cp.funds < 1000) w.push(`Campaign funds are low ($${Math.round(cp.funds).toLocaleString('en-US')}).`);
  }
  if (c.actions >= ACTION_COST) w.push(`${c.actions}% unused energy expired this turn.`);
  w.push(...activeCrisisWarnings(c));
  return w;
}

export function TurnLoading({ period, tip, warnings }: { period: string; tip: string; warnings: string[] }) {
  return <div className="modal-backdrop turn-loading" role="status" aria-live="polite" aria-label="Processing turn">
    <section className="game-modal">
      <span className="eyebrow">Processing turn</span>
      <h2 className="mt-1">{period}</h2>
      <div className="turn-progress" aria-hidden="true"><span /></div>
      <p><strong className="text-primary">Tip:</strong> {tip}</p>
      {warnings.length > 0 && <ul className="mini-note report-list">{warnings.map((x, i) => <li key={i}>⚠ {x}</li>)}</ul>}
    </section>
  </div>;
}

export const randomTip = () => TIPS[Math.floor(Math.random() * TIPS.length)] ?? TIPS[0]!;
