import { ACTION_COST } from '@/lib/game/energy-costs';
import { CheckCircle2, FileSignature, Building2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { docketChoices, ensureExecutiveDocket, type DocketRequest } from '@/lib/game/executive-docket';
import { usd } from '@/lib/game/campaign';
import { treasuryFunds } from '@/lib/game/budget';
import { projectCatalog } from '@/lib/game/public-projects';
import governorImage from '@/assets/government-governor.jpg';
import mayorImage from '@/assets/government-mayor.jpg';
import houseImage from '@/assets/government-house.jpg';
import senateImage from '@/assets/government-senate.jpg';
import presidentImage from '@/assets/capitol.jpg';
import billImage from '@/assets/docket-bill-signing.jpg';
import infraImage from '@/assets/docket-infrastructure.jpg';
import pressImage from '@/assets/docket-press-conference.jpg';
import dealImage from '@/assets/backroom-deal.jpg';

export function GovernmentImage({ career }: { career: Career }) {
  const id = career.office?.id;
  const image = id === 'mayor' || id === 'council' ? mayorImage : id === 'senate' ? senateImage : id === 'house' ? houseImage : id === 'president' ? presidentImage : governorImage;
  return <figure className="government-cover"><img src={image} alt={`${career.office?.title ?? 'Public office'} working environment`} width={1280} height={640} /><figcaption><span className="eyebrow">{career.office?.jurisdiction}</span><h2>{career.office?.title}</h2></figcaption></figure>;
}

const slotArt = {
  legislature: { image: billImage, icon: FileSignature, alt: 'Executive signing legislation at a mahogany desk' },
  policy: { image: infraImage, icon: Building2, alt: 'Officials reviewing blueprints at an infrastructure site' },
  routine: { image: pressImage, icon: UsersRound, alt: 'State press room podium with microphones' },
};

const slotName = { legislature: 'Legislative Decision', policy: 'Policy / Project / Cabinet', routine: 'Leadership Routine' } as const;

const tradeOff: Record<string, string> = {
  sign: 'Enacts the measure and commits public funds.',
  veto: 'Blocks the measure; allies in the chamber may resent it.',
  amend: 'Sends it back for changes; delays any result.',
  return: 'Sends it back; a revised version returns later.',
  clean: 'Competitive bid at standard public cost.',
  steer: 'Kickback to you; draws suspicion.',
  siphon: 'Diverts public money to you; triggers prosecution.',
  defer: 'No cost, no gains this quarter.',
  fund: 'Spends public funds now for lasting benefits.',
  decline: 'Saves funds; supporters of the plan are disappointed.',
  meet: 'Builds relationships and coalition support.',
  press: 'Raises public visibility and approval.',
  tour: 'Connects with voters across the regions.',
  low: 'Business +4 · Labor −2 · Public Services −3',
  balanced: 'No change in bloc loyalty.',
  progressive: 'Business −4 · Labor +3 · Public Services +3',
};

const choiceLabel: Record<string, string> = {
  sign: 'Signed into Law', veto: 'Vetoed', amend: 'Returned for Amendment', return: 'Returned to Legislature', clean: 'Awarded Cleanly', steer: 'Steered to Connected Firm', siphon: 'Funds Siphoned', defer: 'Deferred', acknowledge: 'Review Recorded',
  fund: 'Funded', low: 'Low-Tax Budget Adopted', balanced: 'Balanced Budget Adopted', progressive: 'Progressive Budget Adopted', decline: 'Funding Declined', meet: 'Negotiated', press: 'Public Address Delivered', tour: 'Regional Tour Completed', review: 'Administration Reviewed',
  services: 'Services Agenda Set', business: 'Business Agenda Set', environment: 'Environment Agenda Set', safety: 'Safety Agenda Set',
};

function resolvedArt(choice: string | null) {
  if (choice === 'meet') return { image: dealImage, alt: 'Legislative leaders negotiating in a conference room' };
  if (choice === 'sign') return { image: billImage, alt: 'Bill-signing ceremony at the executive desk' };
  if (choice === 'steer' || choice === 'siphon') return { image: dealImage, alt: 'Backroom deal over a public contract' };
  if (choice === 'fund' || choice === 'clean') return { image: infraImage, alt: 'Public project groundbreaking' };
  if (choice === 'press' || choice === 'tour') return { image: pressImage, alt: 'Press briefing room podium' };
  return null;
}

/** Display-only: extracts signed deltas like "+2", "-$1.2M" with their label from outcome text. */
function parseDeltas(outcome: string | null) {
  if (!outcome) return [];
  const out: { text: string; positive: boolean }[] = [];
  for (const m of outcome.matchAll(/([A-Za-z][A-Za-z ]{1,24}?)\s*([+-]\$?[\d.,]+[%MKk]?)/g)) out.push({ text: `${m[2]} ${m[1]!.trim()}`, positive: m[2]!.startsWith('+') });
  for (const m of outcome.matchAll(/([+-]\$?[\d.,]+[%MKk]?)\s+([A-Za-z]+)/g)) if (!out.some(o => o.text.startsWith(m[1]!))) out.push({ text: `${m[1]} ${m[2]}`, positive: m[1]!.startsWith('+') });
  if (/no treasury money spent/i.test(outcome)) out.push({ text: '$0 Treasury', positive: true });
  return out.slice(0, 4);
}

export function ExecutiveDocketPanel({ career, onRequest }: { career: Career; onRequest: (request: DocketRequest) => void }) {
  const current = ensureExecutiveDocket(career), docket = current.executiveDocket;
  if (!docket) return null;
  return <section className="executive-docket" aria-label="Executive docket">
    <div className="panel-row"><h3 className="section-label">{docket.inauguration ? 'Inauguration docket' : `${current.office?.title ?? 'Executive'}’s desk`}</h3><span className="tag-ok">{docket.items.filter(i => i.resolved).length} / 3 resolved</span></div>
    <p className="mini-note">{docket.quarter} · Public treasury {usd(treasuryFunds(current))} · All governing happens here: three decisions per quarter.</p>
    {docket.items.some(i => i.resolved) && <div className="docket-resolution mt-2" role="status" aria-label="This quarter's outcomes"><strong className="docket-resolution-title">This quarter's outcomes</strong>{docket.items.filter(i => i.resolved).map(i => <p key={i.slot}><b>{slotName[i.slot]}:</b> {choiceLabel[i.choice ?? ''] ?? 'Decided'} — {i.title}</p>)}</div>}
    <div className="docket-grid">
    {docket.items.map((item, index) => { const art = slotArt[item.slot]; const Icon = art.icon; const bill = current.bills.find(b => b.id === item.reference); const project = item.kind === 'project' ? projectCatalog(current).find(p => p.catalogId === item.reference) : null;
      const shown = item.resolved ? resolvedArt(item.choice) ?? art : art;
      return <article key={item.slot} className={`docket-card ${item.resolved ? 'resolved' : ''}`}>
        <div className="docket-art"><img src={shown.image} alt={shown.alt} width={1280} height={640} loading="lazy" />{item.resolved && <span className="docket-badge"><CheckCircle2 /> {choiceLabel[item.choice ?? ''] ?? 'Resolved'}</span>}</div>
        <div className="docket-body">
          <div className="docket-heading"><Icon /><div><span className="eyebrow">Slot {index + 1} · {slotName[item.slot]}</span><h4>{item.title}</h4></div></div>
          {item.resolved ? <div className="docket-resolution" role="status">
            <strong className="docket-resolution-title">{choiceLabel[item.choice ?? ''] ?? 'Decision recorded'}</strong>
            <p>{item.outcome}</p>
            {parseDeltas(item.outcome).length > 0 && <div className="docket-deltas">{parseDeltas(item.outcome).map(d => <span key={d.text} className={`docket-delta ${d.positive ? 'up' : 'down'}`}>{d.text}</span>)}</div>}
          </div> : <>
            <div className="docket-tags">
              {bill && <span className="docket-tag">Votes {bill.support?.votes ?? 0}/{bill.support?.seats ?? 0}{bill.support ? ` · ${bill.support.needed} needed` : ''}</span>}
              {bill && <span className="docket-tag">Cost {usd(bill.cost)}</span>}
              {bill && <span className="docket-tag">{bill.stage}</span>}
              {project && <span className="docket-tag">Cost {usd(project.totalCost)}</span>}
              {project && <span className="docket-tag">{project.durationTurns} quarters</span>}
            </div>
            {item.kind === 'appointments' && <p className="mini-note">{current.office?.id === 'president' ? 'Nomination only; Senate confirmation remains required.' : 'Appointment subject to legislative support and available public funds.'}</p>}
            <div className="docket-actions">{docketChoices(current, item).map(choice => <Button key={choice.id} variant={['decline', 'defer', 'return'].includes(choice.id) ? 'gameOutline' : choice.id === 'siphon' || choice.id === 'steer' ? 'destructive' : 'game'} disabled={current.actions < choice.actions * ACTION_COST} title={choice.detail ?? tradeOff[choice.id]} onClick={() => onRequest({ docketId: docket.id, revision: docket.revision, slot: item.slot, choice: choice.id })}><span>{choice.label}{choice.actions ? ' · 15% energy' : ''}{(choice.detail ?? tradeOff[choice.id]) && <small className="docket-trade">{choice.detail ?? tradeOff[choice.id]}</small>}</span></Button>)}</div>
          </>}
        </div>
      </article>;
    })}
    </div>
  </section>;
}
