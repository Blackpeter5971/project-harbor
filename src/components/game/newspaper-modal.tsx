import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { Portrait } from './portrait';

type Edition = Career['news'][number];
const dateline = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function NewspaperModal({ edition, onContinue }: { edition: Edition; onContinue: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { dialog.current?.focus(); }, []);
  const [lead, ...rest] = edition.stories;
  return <div className="modal-backdrop newspaper-backdrop">
    <section ref={dialog} tabIndex={-1} className="newspaper-modal" role="dialog" aria-modal="true" aria-labelledby="paper-title" onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]');
      const first = controls?.[0], last = controls?.[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="paper-scroll" tabIndex={0} aria-label="Newspaper articles">
        <header className="paper-masthead">
          <div className="paper-kicker"><span>Politics & Public Life</span><span>Quarterly edition</span></div>
          <h2 id="paper-title">{edition.paper}</h2>
          <div className="paper-dateline"><time dateTime={edition.date}>{dateline(edition.date)}</time><span>The political record</span></div>
        </header>
        {lead && <article className="paper-lead">
          <span className="paper-section">{lead.tag} / Front page</span>
          <h3>{lead.h}</h3>
          <p className="paper-sub">{lead.sub}</p>
          <div className={`paper-feature ${lead.portrait !== undefined ? 'paper-feature-illustrated' : ''}`}>
            {lead.portrait !== undefined && <figure><Portrait index={lead.portrait} /><figcaption>{lead.caption ?? `${lead.subject ?? 'Candidate'} · File portrait.`}</figcaption></figure>}
            <div className="paper-copy"><span className="paper-byline">Political desk</span><p>{lead.body}</p></div>
          </div>
        </article>}
        <section className="paper-secondary" aria-label="More stories">{rest.map((s, i) => <article className="paper-story" key={`${edition.id}-${i}`}>
          <span className="paper-section">{s.tag}</span><h3>{s.h}</h3><p className="paper-sub">{s.sub}</p><p className="paper-article-text">{s.body}</p>
        </article>)}</section>
        <div className="paper-colophon">{edition.paper} · {dateline(edition.date)}</div>
      </div>
      <footer className="paper-footer"><Button variant="game" className="w-full" onClick={onContinue}>Continue</Button></footer>
    </section>
  </div>;
}