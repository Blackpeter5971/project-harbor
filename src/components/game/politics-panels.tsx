import { ACTION_COST } from '@/lib/game/energy-costs';
import { HistoryList } from './history-list';
import { clearHistory } from '@/lib/game/history';
import { useState } from 'react';
import { ArrowRight, Award, Flag, Handshake, Landmark, Newspaper, Users, ShieldAlert, Briefcase, Scale, Radio } from 'lucide-react';
import { supportGroupsView, supportGroupsOf, backing, ENDORSE_AT, OPPOSE_BELOW } from '@/lib/game/support-groups';
import { Button } from '@/components/ui/button';
import type { Career } from '@/lib/game/career';
import { fmt, monthLabel } from '@/lib/game/gameplay';
import { groups, groupRel, endorsedBy, courtGroup, concedeToGroup, seekEndorsement, endorseWithCapital, ENDORSE_CAPITAL, seekCost, usd } from '@/lib/game/campaign';
import { NewspaperModal } from './newspaper-modal';

export const politicalCategories = [
  { id: 'activities', title: 'Political Activities', icon: Landmark },
  { id: 'party', title: 'Party & Influence', icon: Award },
  { id: 'campaigns', title: 'Campaigns & Elections', icon: Flag },
  { id: 'loyalty', title: 'Support Groups & Loyalty', icon: Users },
  { id: 'groups', title: 'Political Groups & Endorsements', icon: Handshake },
  { id: 'scandals', title: 'Scandals & Media Scrutiny', icon: ShieldAlert },
  { id: 'backroom', title: 'Backroom Deals & Dark Money', icon: Briefcase },
  { id: 'legal', title: 'Legal Investigations', icon: Scale },
] as const;
export type PoliticsPanel = 'menu' | 'media' | typeof politicalCategories[number]['id'];

export function PoliticsMenu({ onOpen }: { onOpen: (panel: PoliticsPanel) => void }) {
  return <div className="politics-menu">{politicalCategories.map(({ id, title, icon: Icon }) =>
    <Button key={id} variant="gameChoice" className="politics-category" onClick={() => onOpen(id)}>
      <span className="choice-icon"><Icon /></span><span className="politics-category-title">{title}</span><ArrowRight />
    </Button>
  )}</div>;
}

type Res = { ok: true; career: Career; message: string } | { ok: false; message: string };
export function PoliticalRecords({ career, panel, onUpdate, onNotice }: { career: Career; panel: 'groups' | 'news'; onUpdate: (c: Career) => void; onNotice: (m: string) => void }) {
  const [article, setArticle] = useState<string | null>(null);
  const [edition, setEdition] = useState(0);
  const [frontPage, setFrontPage] = useState(false);
  const run = (r: Res) => { if (r.ok) onUpdate(r.career); onNotice(r.message); };
  const camp = career.campaign, me = career.character.name, cost = seekCost(career), out = career.actions < ACTION_COST;
  if (panel === 'groups') return <>
    <p className="mini-note">Court leaders, offer policy pledges, then seek endorsements during a campaign. An endorsement permanently boosts your polling and fundraising for that race.</p>
    <div className="row-list mt-2">{groups.map(g => { const rel = Math.round(groupRel(career, g.id)); const e = endorsedBy(camp, g.id); return <div key={g.id} className="game-row static group-card"><div className="w-full">
      <b>{g.name} {e === me ? <span className="tag-ok">Endorsed you</span> : e ? <span className="tag-warn">Backs {e}</span> : null}</b>
      <p>{g.members} · {g.lean ?? 'Swing'} lean · influence {'★'.repeat(g.influence)}</p>
      <div className="meter" role="meter" aria-label={`${g.name} favorability`} aria-valuenow={rel} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${rel}%` }} /></div>
      <p className="mini-note">Favorability {rel}/100 · {g.impact}</p>
      <div className="group-actions">
        <Button size="sm" variant="gameOutline" disabled={out} onClick={() => run(courtGroup(career, g.id))}>Meet Leaders</Button>
        <Button size="sm" variant="gameOutline" disabled={out || career.reputation < 1} onClick={() => run(concedeToGroup(career, g.id))}>Policy Pledge</Button>
        <Button size="sm" variant="game" disabled={out || !camp || !!e || (camp?.funds ?? 0) < cost} onClick={() => run(seekEndorsement(career, g.id))}>Seek Endorsement</Button>
        <Button size="sm" variant="gameOutline" disabled={out || !camp || !!e || rel < 40 || career.reputation < ENDORSE_CAPITAL} onClick={() => run(endorseWithCapital(career, g.id))}>Spend Capital</Button>
      </div></div></div>; })}</div>
    <p className="mini-note mt-2">Meet: 1 action · Pledge: 1 action, 1 reputation (upsets a rival group) · Seek: 1 action (guaranteed at 60+ favorability){camp ? `, ${usd(cost)} campaign funds` : ', requires active campaign'}</p>
    {!!career.campaign?.endorsements.length && <><h3 className="section-label mt-3">All endorsements this race</h3><div className="row-list">{career.campaign.endorsements.map(e => <div className="game-row static" key={e.group}><div><b>{groups.find(g => g.id === e.group)?.name ?? e.group}</b><p>{e.candidate}</p></div></div>)}</div></>}
  </>;
  return <>
    {career.news.length ? (() => { const ed = career.news[Math.min(edition, career.news.length - 1)]!; return <>
      {career.news.length > 1 && <label className="field"><span className="field-label">Archive · {career.news.length} editions</span><select className="game-input" value={edition} onChange={e => { setEdition(Number(e.target.value)); setArticle(null); }}>{career.news.map((n, i) => <option key={n.id} value={i}>{monthLabel(n.date)}{i === 0 ? ' (latest)' : ''}</option>)}</select></label>}
      {career.news.length > 1 && <HistoryList title="Past editions" defaultOpen={false} protectedIndex={0} items={career.news} render={(n, i) => <span>{monthLabel(n.date)} · {n.paper}{i === 0 ? ' (latest, kept)' : ''} · {n.stories.length} stories</span>} onClear={ix => { setEdition(0); setArticle(null); onUpdate(clearHistory(career, 'news', ix)); }} />}<section className="political-edition mt-2"><h2>{ed.paper}</h2><p className="mini-note">Quarterly edition · {monthLabel(ed.date)}</p><Button variant="gameOutline" className="w-full mt-2" onClick={() => setFrontPage(true)}><Newspaper /> View front page</Button><div className="row-list">{ed.stories.map((story, i) => { const id = `${ed.id}-${i}`; return <div key={id}><Button variant="gameChoice" className="political-story" aria-expanded={article === id} onClick={() => setArticle(article === id ? null : id)}><span><span className="eyebrow">{story.tag}</span><b>{story.h}</b><span className="mini-note">{story.sub}</span></span><ArrowRight /></Button>{article === id && <p className="political-article">{story.body}</p>}</div>; })}</div></section>{frontPage && <NewspaperModal edition={ed} onContinue={() => setFrontPage(false)} />}</>; })() : <div className="political-empty"><Newspaper /><h2>No newspaper editions</h2><p>The first quarterly edition prints after your next turn.</p></div>}
  </>;
}
export function SupportGroupsPanel({ career }: { career: Career }) {
  const v = supportGroupsView(career);
  const bk = backing(career), hist = supportGroupsOf(career).history.slice(0, 5);
  const names = Object.fromEntries(v.groups.map(g => [g.id, g.name]));
  const approval = career.approval ? `${Math.round(career.approval.overall)}%` : 'Not in office';
  return <>
    <p className="mini-note">How loyal each voter bloc is to you personally. Separate from public approval, reputation and party standing.</p>
    <div className="sgpl-metrics mt-2">
      <div><span>Public approval</span><b>{approval}</b></div>
      <div><span>Reputation</span><b>{career.reputation}</b></div>
      <div><span>Party standing</span><b>{v.partyStanding === null ? 'Independent' : `${Math.round(v.partyStanding)}%`}</b></div>
    </div>
    <div className="row-list mt-2">{v.groups.map((g, i) => <div key={g.id} className="game-row static group-card sgpl-card" style={{ animationDelay: `${i * 60}ms` }}><div className="w-full">
      <b>{g.name} {g.loyalty > ENDORSE_AT ? <span className="tag-ok">Endorses you</span> : g.loyalty < OPPOSE_BELOW ? <span className="tag-warn">Opposes you</span> : g.backing ? <span className="tag-ok">Backs you</span> : <span className="tag-warn">Not backing</span>}</b>
      <p>{g.alignment} · {g.sentiment}</p>
      <div className="meter" role="meter" aria-label={`${g.name} loyalty`} aria-valuenow={Math.round(g.loyalty)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${g.loyalty}%` }} /></div>
      <p className="mini-note">Loyalty {Math.round(g.loyalty)}% · Concerns: {g.concerns.join(', ')}</p>
      <p className="mini-note">Expects: {g.expects}</p>
    </div></div>)}</div>
    <p className="mini-note mt-2">Backs you at 60%+. Above {ENDORSE_AT}% a group formally endorses you (better polls and donations); below {OPPOSE_BELOW}% it campaigns against you. Loyalty drifts back toward neutral each quarter.</p>
    <p className="mini-note">Election effect now: {bk.endorsers.length} endorsing, {bk.opponents.length} opposing.</p>
    {!!hist.length && <><h3 className="section-label mt-3">Recent loyalty shifts</h3><div className="row-list">{hist.map((h, i) => <div key={i} className="game-row static sgpl-card" style={{ animationDelay: `${i * 60}ms` }}><div><b>{h.reason}</b><p>{Object.entries(h.changes).map(([id, d]) => <span key={id} className={d > 0 ? 'sgpl-up' : 'sgpl-down'}>{id === 'party' ? 'Party' : names[id] ?? id} {d > 0 ? '+' : ''}{d} </span>)}</p></div></div>)}</div></>}
  </>;
}
