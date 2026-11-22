import { useState } from 'react';
import { Inbox, Star, Archive, ArrowLeft, Reply, CheckCheck, Trash2 } from 'lucide-react';
import type { Career } from '@/lib/game/career';
import { dispatchOf, markRead, markAllRead, deleteMail, toggleStar, toggleArchive, replyMail, repliesFor } from '@/lib/game/dispatch';

type Tab = 'inbox' | 'starred' | 'archive';
type Props = { career: Career; onUpdate: (c: Career) => void; onNotice: (m: string) => void };

export function EmailApp({ career, onUpdate, onNotice }: Props) {
  const [tab, setTab] = useState<Tab>('inbox');
  const [open, setOpen] = useState<string | null>(null);
  const items = dispatchOf(career).items;
  const list = items.filter(m => tab === 'archive' ? m.archived : tab === 'starred' ? m.starred && !m.archived : !m.archived);
  const unread = items.filter(m => !m.read && !m.archived).length;
  const mail = open ? items.find(m => m.id === open) : null;

  const view = (id: string) => { setOpen(id); const m = items.find(x => x.id === id); if (m && !m.read) onUpdate(markRead(career, id)); };

  if (mail) {
    const replies = repliesFor(mail);
    return <div className="mail-app"><div className="mail-read">
      <button type="button" className="tube-link" onClick={() => setOpen(null)}><ArrowLeft className="mail-ico" /> Back</button>
      <div className="mail-head">
        {mail.tag && <span className={`mail-tag mail-tag-${mail.tag.toLowerCase()}`}>{mail.tag}</span>}
        <h3>{mail.subject}</h3>
        <p className="mail-from">{mail.from} · {mail.date}</p>
      </div>
      <p className="mail-body">{mail.body}</p>
      {mail.replied === null
        ? <div className="mail-replies">{replies.map((r, i) => <button key={i} type="button" className="mail-reply" onClick={() => { const res = replyMail(career, mail.id, i); onNotice(res.message); if (res.ok) onUpdate(res.career); }}><Reply className="mail-ico" />{r.label}</button>)}</div>
        : <p className="mini-note">You replied: “{replies[mail.replied]?.label}”</p>}
      <div className="mail-actions">
        <button type="button" onClick={() => onUpdate(toggleStar(career, mail.id))}><Star className={`mail-ico${mail.starred ? ' is-starred' : ''}`} />{mail.starred ? 'Unstar' : 'Star'}</button>
        <button type="button" onClick={() => { onUpdate(toggleArchive(career, mail.id)); setOpen(null); }}><Archive className="mail-ico" />{mail.archived ? 'Unarchive' : 'Archive'}</button>
      </div>
    </div></div>;
  }

  return <div className="mail-app">
    <nav className="mail-tabs">
      {([['inbox', Inbox, 'Inbox'], ['starred', Star, 'Starred'], ['archive', Archive, 'Archive']] as const).map(([id, I, l]) =>
        <button key={id} type="button" className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}><I className="mail-ico" />{l}{id === 'inbox' && unread > 0 && <i className="mail-count">{unread}</i>}</button>)}
    </nav>
    {list.length > 0 && <div className="mail-actions">
      <button type="button" disabled={!list.some(m => !m.read)} onClick={() => { onUpdate(markAllRead(career)); onNotice('All mail marked as read.'); }}><CheckCheck className="mail-ico" />Mark all as read</button>
      <button type="button" onClick={() => { if (window.confirm(`Delete all ${list.length} letters here? This can't be undone.`)) { onUpdate(deleteMail(career, list.map(m => m.id))); onNotice('Mail deleted.'); } }}><Trash2 className="mail-ico" />Delete all</button>
    </div>}
    <div className="mail-list">
      {!list.length && <p className="mini-note mail-empty">{tab === 'inbox' ? 'No new correspondence.' : 'Nothing here.'}</p>}
      {list.map(m => <button key={m.id} type="button" className={`mail-row${m.read ? '' : ' is-unread'}`} onClick={() => view(m.id)}>
        <span className="mail-avatar">{m.from.slice(0, 1).toUpperCase()}</span>
        <span className="mail-row-main">
          <span className="mail-row-top"><b>{m.from}</b><small>{m.date}</small></span>
          <span className="mail-subject">{m.subject}</span>
          <span className="mail-row-top">{m.tag && <span className={`mail-tag mail-tag-${m.tag.toLowerCase()}`}>{m.tag}</span>}{m.starred && <Star className="mail-ico is-starred" />}{m.replied !== null && <small>Replied</small>}</span>
        </span>
      </button>)}
    </div>
  </div>;
}
