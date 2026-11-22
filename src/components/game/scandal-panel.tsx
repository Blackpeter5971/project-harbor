import { ACTION_COST } from '@/lib/game/energy-costs';
import { ShieldAlert, Tv, Newspaper, MessageCircle } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import { HistoryList } from './history-list';
import { activeScandals, coverageTone, isResolved } from '@/lib/game/scandals';
import tvImage from '@/assets/media-tv.jpg';
import { Button } from '@/components/ui/button';
import type { Result } from '@/lib/game/gameplay';
import { canRespond, previewResponse, respondToScandal, responseOptions } from '@/lib/game/scandal-responses';

const outcomeText = { defused: 'Defused', contained: 'Contained', backfired: 'Backfired' } as const;
const likelyText = { defused: 'Likely to work', contained: 'Risky', backfired: 'Likely to backfire' } as const;

export function ScandalPanel({ career, compact = false, onResult }: { career: Career; compact?: boolean; onResult?: (r: Result) => void }) {
  const active = activeScandals(career);
  const records = compact ? active.slice(0, 2) : [...active].reverse();
  const history = compact ? [] : career.scandals.filter(isResolved).reverse();
  if (compact && !records.length) return null;
  return <section className="scandal-watch" aria-label="Scandal watch">
    <h3 className="section-label"><ShieldAlert className="size-4" /> Scandal watch {active.length > 0 && `· ${active.length} ongoing`}</h3>
    {!records.length && !history.length && <p className="mini-note">No recorded controversies.</p>}
    {records.map(s => <article key={s.id} className="scandal-record">
      <div className="panel-row"><span className={s.phase === 'Exploded' ? 'text-destructive' : 'text-primary'}>{s.phase === 'Managed' ? 'Resolved · Historical' : `${s.phase} · Scrutiny case`} · {s.severity}{s.related.length > 0 && ` · ${s.related.length + 1} allegations`}</span><small>{s.date.slice(0, 7)}</small></div>
      <h4>{s.title}</h4><p>{s.summary}</p>
      <div className="mini-stats"><span>Source <b>{s.source}</b></span><span>Evidence <b>{s.evidence}%</b></span><span>Finding <b>{s.status === 'alleged' ? 'Unproven' : s.status === 'cleared' ? 'Unsupported / cleared' : 'Substantiated'}</b></span></div>
      {s.finding && <p className="mini-note">{s.finding}</p>}
      {s.response && s.resolution && <div className={`scandal-outcome ${s.resolution}`}><b>Response · {responseOptions.find(o => o.id === s.response)?.name}</b><span>{outcomeText[s.resolution]}</span></div>}
      {!compact && onResult && canRespond(s) && <div className="scandal-responses" aria-label="Response options">
        <h5 className="section-label">Choose your response · 15% energy</h5>
        {responseOptions.map(o => { const p = previewResponse(career, s, o.id); return <Button key={o.id} variant="gameChoice" className="game-row h-auto whitespace-normal" disabled={career.actions < ACTION_COST || career.money < p.cost} onClick={e => { if (e.detail > 1) return; onResult(respondToScandal(career, s.id, o.id)); }}>
          <div><b>{o.name} <small>/ {o.alt}</small></b><p>{o.summary}</p><p className={p.likely === 'backfired' ? 'text-destructive' : 'text-primary'}>{likelyText[p.likely]}</p></div>
          <span className="row-cost">{p.cost ? `$${p.cost.toLocaleString('en-US')}` : 'Free'}</span></Button>; })}
      </div>}
      {!compact && <><p className="mini-note">Record: {s.id}</p><div className="scandal-coverage"><span><Newspaper className="size-3" /> Newspaper</span><span><Tv className="size-3" /> TV</span><span><MessageCircle className="size-3" /> Social</span><p>{coverageTone(s)}</p></div></>}
    </article>)}
    {!compact && history.length > 0 && <HistoryList title="Resolved cases" defaultOpen={false} items={history} render={s => <div><b>{s.title}</b><p className="mini-note mt-0">Resolved {(s.closedAt || s.responseDate || s.date).slice(0, 7)} · {s.severity}{s.related.length ? ` · ${s.related.length + 1} allegations` : ''} · {s.finding ?? (s.resolution ? outcomeText[s.resolution] : 'Faded from the news')}</p></div>} />}
    {!compact && active.length > 0 && <figure className="scandal-tv"><img src={tvImage} alt="Television newsroom covering political controversy" width={1088} height={608} /><figcaption><Tv className="size-4" /><b>Capitol Tonight · Media watch</b><p>{active[0]?.title} — {active[0] && coverageTone(active[0])}</p></figcaption></figure>}
  </section>;
}