import { useEffect } from 'react';
import { Lock, Mic } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import { COVERS, MAGAZINES, kioskOf, interviewOffer, answerInterview, markCoversSeen, INTERVIEW_REP } from '@/lib/game/dispatch';
import capitol from '@/assets/capitol.jpg';
import press from '@/assets/docket-press-conference.jpg';
import bill from '@/assets/docket-bill-signing.jpg';

const ART: Record<string, string> = { 'Crossia Affairs': capitol, 'The Statesman': bill, 'Capital Insight': press };
const SLUG: Record<string, string> = { 'Crossia Affairs': 'mag-affairs', 'The Statesman': 'mag-statesman', 'Capital Insight': 'mag-insight' };
type Props = { career: Career; onUpdate: (c: Career) => void; onNotice: (m: string) => void };

export function MagazinesApp({ career, onUpdate, onNotice }: Props) {
  const k = kioskOf(career), offer = interviewOffer(career);
  useEffect(() => { const n = markCoversSeen(career); if (n !== career) onUpdate(n); }, [career, onUpdate]);
  const won = new Map(k.covers.map(c => [c.id, c]));
  const act = (accept: boolean) => { const r = answerInterview(career, accept); onNotice(r.message); if (r.ok) onUpdate(r.career); };

  return <div className="mag-app">
    <p className="mag-kicker">Newsstand · {MAGAZINES.join(' · ')}</p>
    {offer ? <div className="mag-offer">
      <Mic className="mail-ico" /><div><b>{offer.magazine} wants an exclusive interview</b><p>Boosts your standing with the establishment. Costs 1 action.</p></div>
      <div className="mag-offer-btns"><button type="button" className="tube-btn" onClick={() => act(true)}>Accept</button><button type="button" className="tube-link" onClick={() => act(false)}>Decline</button></div>
    </div> : career.reputation < INTERVIEW_REP && <p className="mini-note">Exclusive interviews open at {INTERVIEW_REP} reputation.</p>}
    <div className="mag-grid">
      {COVERS.map(c => { const got = won.get(c.id); return <article key={c.id} className={`mag-cover ${SLUG[c.magazine]}${got ? '' : ' is-locked'}`}>
        <img src={ART[c.magazine]} alt="" loading="lazy" />
        <div className="mag-cover-text">
          <span className="mag-title">{c.magazine}</span>
          {got ? <><span className="mag-name">{career.character.name}</span><span className="mag-feature">{c.title}</span><small>{got.date.slice(0, 7)}</small></>
            : <span className="mag-lock"><Lock className="mail-ico" />{c.title}<small>Reputation {c.rep}</small></span>}
        </div>
      </article>; })}
    </div>
  </div>;
}
