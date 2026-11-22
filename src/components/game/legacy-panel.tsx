import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Crown, Download, History, ShieldCheck, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { parseCareer, type Career } from '@/lib/game/career';
import { adultHeirs, dynastyOf, passTorch, retireCareer } from '@/lib/game/dynasty';
import { captureLegacy, legacyMetrics, legacyOf } from '@/lib/game/legacy';
import { naturalMortalityRisk, securityAction, securityRisk, type LegacyRequest } from '@/lib/game/mortality';
import type { Result } from '@/lib/game/support';
import { Portrait } from './portrait';

export function SafetyPanel({ career, onRequest }: { career: Career; onRequest: (r: LegacyRequest) => void }) {
  const l = legacyOf(career), security = securityRisk(career);
  const request = (action: LegacyRequest['action']) => onRequest({ action, revision: career.politicalActivityRevision, owner: l.owner, date: career.date });
  return <section className="mt-3" aria-label="Health and protection">
    <h3 className="section-label"><ShieldCheck className="inline size-4" /> Health & protection</h3>
    <p className="mini-note">{security.warning}</p>
    <div className="mini-stats"><span>Natural risk / quarter <b>{(naturalMortalityRisk(career) * 100).toFixed(2)}%</b></span><span>Health <b>{career.health}%</b></span><span>Stress <b>{career.life?.stress ?? 0}%</b></span></div>
    {career.life?.medical?.chronic && <p className="shortfall">Chronic cardiac illness · last care {career.life.medical.lastCheckup || 'not recorded'}</p>}
    <div className="legacy-actions"><Button variant="gameOutline" disabled={security.bodyguard || career.money < 3000} onClick={() => request('bodyguard')}><ShieldCheck /> {security.bodyguard ? 'Protection active' : 'Bodyguard · $3,000 / quarter'}</Button>
      {['president', 'governor'].includes(career.office?.id ?? '') && <Button variant="gameOutline" disabled={l.security.reviewedPeriod === career.date} onClick={() => request('briefing')}>Review intelligence briefing</Button>}</div>
  </section>;
}

export function LegacyPanel({ career, onUpdate, onNotice, onRequest }: { career: Career; onUpdate: (c: Career) => void; onNotice: (s: string) => void; onRequest?: ((r: LegacyRequest) => void) | undefined }) {
  const [tab, setTab] = useState<'service' | 'terms' | 'timeline' | 'dynasty'>('service');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState<Career | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const prepared = captureLegacy(career), l = legacyOf(prepared);
  const retiredRecord = l.archive.lives.find(r => r.owner === l.owner && r.kind === 'retirement');
  const m = retiredRecord?.metrics ?? legacyMetrics(prepared);
  const terms = [...l.archive.executives].sort((a, b) => b.since.localeCompare(a.since));
  const term = terms.find(t => t.id === selected);
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(prepared)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'president-career-and-history.json'; a.click(); URL.revokeObjectURL(url);
  };
  return <section className="legacy-panel" aria-label="National legacy">
    <div className="bank-heading"><History /><div><h2 className="step-title">National Legacy</h2><p className="step-subtitle">{career.character.name} · Generation {dynastyOf(career).generation}</p></div></div>
    <div className="legacy-score"><Portrait index={career.character.portrait} /><div><span className="eyebrow">{dynastyOf(career).retired ? 'Final political record' : 'Lifetime record'}</span><strong>{m.score}<small> / 1,000</small></strong><b>{m.classification}</b></div></div>
    <div className="life-tabs legacy-tabs" role="tablist" aria-label="History views">{(['service', 'terms', 'timeline', 'dynasty'] as const).map(t => <Button key={t} variant="gameQuiet" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setSelected(null); }}>{({ service: 'Service', terms: 'Executives', timeline: 'Timeline', dynasty: 'Dynasty' })[t]}</Button>)}</div>
    {tab === 'service' && <>
      <div className="bank-summary"><div><span>Years in office</span><b>{m.years}</b></div><div><span>General elections</span><b>{m.wins} wins · {m.losses} losses</b></div><div><span>Enacted measures</span><b>{m.laws}</b></div><div><span>Completed infrastructure</span><b>{m.projects}</b></div><div><span>Crises</span><b>{m.managed} managed · {m.neglected} neglected</b></div><div><span>Scandals</span><b>{m.weathered} weathered · {m.proven} proven</b></div></div>
      <h3 className="section-label">Offices held</h3><p className="mini-note">{m.offices.join(' · ') || 'No elected office recorded'}</p>
      <h3 className="section-label mt-3">Legacy assessment</h3><div className="expense-list"><span>Governance · 35%<b>{m.governance}/100</b></span><span>Economic stability · 25%<b>{m.economy}/100</b></span><span>Citizen happiness · 20%<b>{m.happiness}/100</b></span><span>Integrity · 20%<b>{m.integrity}/100</b></span></div>
      <h3 className="section-label mt-3">Public approval record</h3><div className="row-list">{l.archive.samples.filter(s => s.owner === l.owner).slice(-12).map(s => <div className="game-row static" key={s.id}><span>{s.date}</span><b>{s.approval}%</b></div>)}</div>{m.approval === null && <p className="mini-note">No public approval measurements recorded.</p>}
      <h3 className="section-label mt-3">Economic milestones</h3>{l.archive.evidence.filter(e => e.owner === l.owner && e.kind === 'economy').map(e => <div className="game-row static" key={e.id}><div><b>{e.title}</b><p>{e.date} · {e.detail}</p></div></div>)}
      <SafetyPanel career={career} onRequest={onRequest ?? (r => { const result = securityAction(career, r); if (result.ok) onUpdate(result.career); onNotice(result.message); })} />
    </>}
    {tab === 'terms' && (term ? <><Button variant="gameQuiet" onClick={() => setSelected(null)}><ArrowLeft /> Executive archive</Button><h3 className="step-title mt-2">No. {term.number} · {term.title}</h3><p className="mini-note">{term.name} · {term.party}<br />{term.jurisdiction}<br />{term.since} — {term.ended} · {term.reason}</p><p className="text-primary font-bold">{term.metrics.classification} · {term.metrics.score}/1,000</p>{[['Cabinet / Commissioners', term.cabinet], ['Legislative record', term.laws], ['Completed infrastructure', term.projects], ['Crises handled', term.crises]].map(([title, items]) => <section className="mt-3" key={String(title)}><h4 className="section-label">{title}</h4><ul className="mini-note">{(items as string[]).length ? (items as string[]).map((item, i) => <li key={i}>{item}</li>) : <li>No recorded entries</li>}</ul></section>)}<h4 className="section-label mt-3">Final economic indicators</h4><div className="expense-list">{Object.entries(term.economicIndicators).map(([key, value]) => <span key={key}>{key}<b>{Math.round(value)}/100</b></span>)}</div><p className="mini-note">Final approval: {term.metrics.approval === null ? 'not recorded' : `${term.metrics.approval}%`}</p></> : <div className="row-list">{terms.length ? terms.map(t => <Button variant="gameChoice" className="game-row h-auto whitespace-normal" key={t.id} onClick={() => setSelected(t.id)}><div><b>No. {t.number} · {t.title}</b><p>{t.name} · {t.party}<br />{t.since} — {t.ended}<br />{t.metrics.classification}</p></div><ArrowRight /></Button>) : <p className="mini-note">No completed presidential or gubernatorial terms recorded.</p>}</div>)}
    {tab === 'timeline' && <div className="legacy-timeline">{[...l.archive.evidence].sort((a, b) => b.date.localeCompare(a.date)).map(e => <article key={e.id}><span className="eyebrow">{e.date} · {e.kind}</span><h4>{e.title}</h4><p className="mini-note">{e.detail}</p></article>)}{!l.archive.evidence.length && <p className="mini-note">No historical events recorded yet.</p>}</div>}
    {tab === 'dynasty' && <><div className="mini-stats"><span>Family prestige <b>{dynastyOf(career).prestige}</b></span><span>Adult heirs <b>{adultHeirs(career).length}</b></span></div>{l.archive.lives.map(r => <article className="legacy-life" key={r.id}><span className="eyebrow">Generation {r.generation} · {r.kind} · {r.date}</span><h3>{r.name}</h3><p className="mini-note">{r.obituary}</p><p className="mini-note">{r.reaction}</p></article>)}{!l.archive.lives.length && <p className="mini-note">No concluded ancestral careers recorded.</p>}</>}
    <div className="legacy-actions mt-3"><Button variant="gameOutline" onClick={download}><Download /> Export career & history</Button><Button variant="gameOutline" onClick={() => input.current?.click()}><Upload /> Import save</Button></div>
    <input ref={input} type="file" accept="application/json,.json" className="hidden" aria-label="Import career save" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 20_000_000) { onNotice('This save file is too large.'); return; } const imported = parseCareer(await file.text()); if (imported) setConfirmImport(imported); else onNotice('This file is not a valid career save.'); e.target.value = ''; }} />
    {confirmImport && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-label="Replace active career"><h2 className="step-title">Import {confirmImport.character.name}?</h2><p>Your active career will be replaced. Permanent history will be retained.</p><div className="modal-actions"><Button variant="game" onClick={() => { onUpdate(confirmImport); setConfirmImport(null); onNotice('Career imported; permanent history retained.'); }}>Import career</Button><Button variant="gameOutline" onClick={() => setConfirmImport(null)}>Cancel</Button></div></section></div>}
  </section>;
}

export function EndgameSequence({ career, onResult, onNew, onMenu, onContinue }: { career: Career; onResult: (r: Result) => void; onNew: () => void; onMenu: () => void; onContinue: () => void }) {
  const [step, setStep] = useState(1);
  const prepared = captureLegacy(career), l = legacyOf(prepared);
  const record = l.death ?? l.archive.lives.find(r => r.owner === l.owner && r.kind === 'retirement');
  if (!record) return null;
  const heirs = adultHeirs(career);
  return <div className="modal-backdrop"><section className="game-modal legacy-memorial" role="dialog" aria-modal="true" aria-labelledby="memorial-title">
    <span className="eyebrow">{l.death ? 'In memoriam' : 'Retirement'} · {step} of 3</span><div className="legacy-score"><Portrait index={career.character.portrait} /><div><h2 id="memorial-title" className="step-title">{career.character.name}</h2><p className="mini-note">Age {record.age} · {record.date}</p></div></div>
    {step === 1 && <><p>{record.cause}</p>{record.officeAtEnd && <p className="mini-note">Office at conclusion: {record.officeAtEnd}</p>}<p className="mini-note">{record.obituary}</p></>}
    {step === 2 && <><strong className="stat-value">{record.metrics.score}<small> / 1,000</small></strong><p className="text-primary font-bold">{record.metrics.classification}</p><p>{record.reaction}</p><div className="mini-stats"><span>Service <b>{record.metrics.years} years</b></span><span>Laws <b>{record.metrics.laws}</b></span><span>Projects <b>{record.metrics.projects}</b></span><span>Crises managed <b>{record.metrics.managed}</b></span></div></>}
    {step === 3 && <><h3 className="section-label">The next generation</h3><div className="row-list">{heirs.map(h => <Button key={h.id} variant="gameChoice" className="game-row h-auto whitespace-normal" onClick={() => onResult(passTorch(career, h.id))}><Crown /><div><b>{h.name} · age {h.age}</b><p>Inherits family assets, name recognition and proven-record consequences</p></div><ArrowRight /></Button>)}</div>{!heirs.length && <p className="mini-note">No eligible adult child (18+) is available.</p>}{!l.death && <Button variant="game" className="w-full mt-3" onClick={onContinue}>Continue personal life</Button>}<Button variant="gameOutline" className="w-full mt-2" onClick={onNew}>Fresh career · preserve history</Button><Button variant="gameQuiet" className="w-full mt-1" onClick={onMenu}>Main menu</Button></>}
    <div className="legacy-actions mt-3">{step > 1 && <Button variant="gameQuiet" onClick={() => setStep(step - 1)}><ArrowLeft /> Back</Button>}{step < 3 && <Button variant="game" onClick={() => setStep(step + 1)}>Continue <ArrowRight /></Button>}</div>
  </section></div>;
}

export function RetirementDecision({ career, onResult }: { career: Career; onResult: (r: Result) => void }) {
  const [open, setOpen] = useState(false);
  if (dynastyOf(career).retired) return <section className="mt-3"><h3 className="section-label">Retired from politics</h3><p className="mini-note">Political record locked · personal life, family and businesses continue.</p>{adultHeirs(career).map(h => <Button variant="gameOutline" key={h.id} className="w-full mt-2" onClick={() => onResult(passTorch(career, h.id))}><Crown /> Pass torch to {h.name}</Button>)}</section>;
  return <section className="mt-3"><Button variant="gameChoice" className="w-full" onClick={() => setOpen(true)}>Retire from politics <ArrowRight /></Button>{open && <div className="modal-backdrop"><section className="game-modal" role="dialog" aria-modal="true" aria-label="Confirm retirement"><h2 className="step-title">Conclude active politics?</h2><p>Campaigns and official duties end. Your political record is locked; family, personal and business activities remain available.</p><div className="modal-actions"><Button variant="game" onClick={() => { setOpen(false); onResult(retireCareer(career)); }}>Confirm retirement</Button><Button variant="gameOutline" onClick={() => setOpen(false)}>Cancel</Button></div></section></div>}</section>;
}