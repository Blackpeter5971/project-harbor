import type { Career } from './career';
import { legacySchema, archiveSchema, type Archive, type LegacyMetrics, type LifeRecord } from './legacy-schema';

const bound = (n: number) => Math.max(0, Math.min(100, n));
const mean = (ns: number[], fallback: number) => ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : fallback;
export const legacyOf = (c: Career) => {
  const l = legacySchema.parse(c.legacy ?? {});
  return { ...l, owner: l.owner || `${c.character.name}|${Number(c.date.slice(0, 4)) - c.age}|${c.dynasty?.generation ?? 1}` };
};
const tenureOf = (o: NonNullable<Career['office']>) => `${o.id}|${o.jurisdiction}|${o.since}`;
const months = (a: string, b: string) => Math.max(0, (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
const union = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map(x => [x.id, x])).values()];
/** Permanent records are additive; importing an older save cannot erase newer records. */
export function mergeArchives(a: Archive, b: Archive): Archive {
  const executives = union(a.executives, b.executives).sort((x, y) => x.since.localeCompare(y.since) || x.id.localeCompare(y.id));
  const numbered = executives.map((x, i) => ({ ...x, number: executives.slice(0, i + 1).filter(y => y.office === x.office && y.jurisdiction === x.jurisdiction).length }));
  return { evidence: union(a.evidence, b.evidence), executives: numbered, lives: union(a.lives, b.lives), samples: union(a.samples, b.samples) };
}

/** Capture only actual outcomes. This never enacts a law, resolves a crisis or spends funds. */
export function captureLegacy(c: Career): Career {
  const l = legacyOf(c), archive = l.archive;
  const incoming: Archive['evidence'] = [];
  const put = (key: string, date: string, kind: Archive['evidence'][number]['kind'], title: string, detail: string, tenure = '', outcome = '') => incoming.push({ id: `${l.owner}|${key}`, owner: l.owner, date: archive.evidence.find(e => e.id === `${l.owner}|${key}`)?.date ?? date, kind, title, detail, tenure, outcome });
  for (const e of c.elections) put(`election|${e.office}|${e.date}|${e.stage}`, e.date, 'election', `${e.title} · ${e.stage}`, e.rows.map(r => `${r.name} (${r.party}) ${r.pct}%`).join('; ') || 'Ballot access failed', '', e.won ? 'won' : 'lost');
  for (const b of c.bills.filter(b => b.stage === 'passed')) put(`bill|${b.id}`, b.history.at(-1)?.date ?? b.date, 'law', b.title, `Enacted ${b.policy} measure`, b.tenure, 'enacted');
  for (const b of c.legislature?.bills.filter(b => b.status === 'enacted') ?? []) put(`leg|${c.legislature?.tenure}|${b.id}`, c.date, 'law', b.title, b.executiveAction ?? 'Enacted after chamber approval', c.legislature?.tenure ?? '', 'enacted');
  const governments = [c.city, c.stateGovernment, c.federalGovernment, ...c.termHistory.flatMap(t => [t.government?.city, t.government?.stateGovernment, t.government?.federalGovernment])];
  for (const g of governments) for (const p of g?.publicProjects ?? []) if (p.status === 'completed' && p.completionDate) put(`project|${p.tenure}|${p.id}`, p.completionDate, 'project', p.name, `${p.jurisdiction} infrastructure completed; construction spending $${Math.round(p.constructionSpent).toLocaleString('en-US')}`, p.tenure, 'completed');
  for (const g of [c.city, c.stateGovernment]) for (const p of (g && ('projects' in g ? g.projects : g.agencies)) ?? []) if (p.status === 'completed') put(`program|${g?.tenure}|${p.id}`, p.lastProcessed || c.date, 'project', p.title, 'Completed public program', g?.tenure ?? '', 'completed');
  for (const k of c.crises) if (k.outcome) put(`crisis|${k.id}|${k.outcome}`, k.resolutionDate ?? c.date, 'crisis', k.title, `${k.outcome}; ${k.selectedResponseId ?? 'no response'}`, k.tenure, k.outcome);
  for (const k of c.treasury?.finance?.events ?? []) if (k.status === 'resolved') put(`gov-event|${c.treasury?.tenure}|${k.id}`, k.lastEnd || c.date, 'crisis', k.name, k.outcome, c.treasury?.tenure ?? '', k.response ? 'managed' : 'neglected');
  for (const s of c.scandals) if (s.subject === c.character.name) put(`scandal|${s.id}`, s.closedAt || s.date, 'scandal', s.title, `${s.status}: ${s.finding ?? s.allegation}`, s.tenure, s.status === 'proven' ? 'proven' : s.closedAt || s.status === 'cleared' ? 'weathered' : 'alleged');
  for (const child of c.life?.social?.dependents ?? []) put(`child|${child.id}`, archive.evidence.find(e => e.id === `${l.owner}|child|${child.id}`)?.date ?? c.date, 'family', child.name, `Child in the family; age ${child.age}`, '', child.age >= 18 ? 'adult heir' : 'child');
  if (c.life?.social?.partner?.weddingDate) put(`wedding|${c.life.social.partner.weddingDate}`, c.life.social.partner.weddingDate, 'family', `Wedding · ${c.life.social.partner.name}`, 'Marriage recorded in the family circle');
  for (const paper of c.news) for (const s of paper.stories) if (['election', 'government'].includes(s.tag) && s.subject !== c.character.name) put(`world|${paper.id}|${s.h}`, paper.date, 'milestone', s.h, s.body);
  let samples = archive.samples;
  if (c.office && c.approval && c.date >= c.office.since) {
    const e = c.treasury?.finance?.economy;
    const sample = { id: `${l.owner}|sample|${tenureOf(c.office)}|${c.date}`, owner: l.owner, date: c.date, tenure: tenureOf(c.office), approval: c.approval.overall, economy: e ? mean([e.business, e.employment, e.household], 50) : null, happiness: c.treasury?.finance?.mood ? (c.treasury.finance.mood.score + 5) * 10 : e?.happiness ?? null };
    samples = union(samples, [sample]);
    if (e && mean([e.business, e.employment, e.household], 50) >= 70) put(`prosperity|${tenureOf(c.office)}`, c.date, 'economy', 'Broad economic prosperity', `Business ${e.business} · Employment ${e.employment} · Household ${e.household}`, tenureOf(c.office), 'prosperity');
  }
  let n: Career = { ...c, legacy: { ...l, archive: { ...archive, evidence: union(archive.evidence, incoming), samples } } };
  for (const t of c.termHistory) {
    if (!t.ended || !['president', 'governor'].includes(t.office.id)) continue;
    const current = legacyOf(n), id = `${l.owner}|term|${tenureOf(t.office)}`;
    if (current.archive.executives.some(x => x.id === id)) continue;
    const key = tenureOf(t.office), evidence = current.archive.evidence.filter(e => e.owner === l.owner && e.tenure === key);
    const metrics = legacyMetrics(n, key);
    const gov = t.government;
    const cabinet = [...(gov?.stateGovernment?.officials ?? []).map(x => `${x.role}: ${x.name}`), ...(gov?.federalGovernment?.nominations.filter(x => x.status === 'confirmed') ?? []).map(x => `${x.role}: ${x.name}`)];
    const record = { id, owner: l.owner, name: c.character.name, number: 1, office: t.office.id, title: t.office.title, jurisdiction: t.office.jurisdiction, party: t.office.party, since: t.office.since, ended: t.ended, reason: t.reason ?? 'recorded term end', cabinet, metrics, laws: evidence.filter(e => e.kind === 'law').map(e => e.title), projects: evidence.filter(e => e.kind === 'project').map(e => e.title), crises: evidence.filter(e => e.kind === 'crisis').map(e => `${e.title}: ${e.outcome}`), economicIndicators: gov?.treasury?.finance?.economy ? { ...gov.treasury.finance.economy } : {} };
    n = { ...n, legacy: { ...current, archive: mergeArchives(current.archive, { ...archiveSchema.parse({}), executives: [record] }) } };
  }
  return n;
}

export function legacyMetrics(c: Career, tenure?: string): LegacyMetrics {
  const l = legacyOf(c), records = l.archive.evidence.filter(e => e.owner === l.owner && (!tenure || e.tenure === tenure));
  const samples = l.archive.samples.filter(e => e.owner === l.owner && (!tenure || e.tenure === tenure));
  const laws = records.filter(e => e.kind === 'law').length, projects = records.filter(e => e.kind === 'project').length;
  const managed = records.filter(e => e.kind === 'crisis' && e.outcome === 'managed').length, neglected = records.filter(e => e.kind === 'crisis' && e.outcome === 'neglected').length;
  const proven = records.filter(e => e.kind === 'scandal' && e.outcome === 'proven').length, weathered = records.filter(e => e.kind === 'scandal' && e.outcome === 'weathered').length;
  const elections = records.filter(e => e.kind === 'election' && e.title.endsWith('· general'));
  const wins = elections.filter(e => e.outcome === 'won').length, losses = elections.filter(e => e.outcome === 'lost').length;
  const terms = c.termHistory.filter(t => !tenure || tenureOf(t.office) === tenure);
  const held = new Map(terms.map(t => [tenureOf(t.office), { office: t.office, end: t.ended ?? c.date }]));
  if (c.office && (!tenure || tenureOf(c.office) === tenure)) held.set(tenureOf(c.office), { office: c.office, end: c.date });
  const years = Math.round([...held.values()].reduce((s, t) => s + months(t.office.since, t.end), 0) / 12 * 10) / 10;
  const snapshots = terms.flatMap(t => t.government ? [t.government] : []);
  const approval = samples.length ? samples.at(-1)?.approval ?? null : snapshots.at(-1)?.approval?.overall ?? c.approval?.overall ?? null;
  const economy = Math.round(mean(samples.flatMap(s => s.economy === null ? [] : [s.economy]), mean(snapshots.flatMap(g => g.treasury?.finance ? [mean([g.treasury.finance.economy.business, g.treasury.finance.economy.employment, g.treasury.finance.economy.household], 50)] : []), 50)));
  const happiness = Math.round(mean(samples.flatMap(s => s.happiness === null ? [] : [s.happiness]), 50));
  const convictions = tenure ? 0 : new Set([...(c.legal?.served.map(s => s.caseId) ?? []), ...(c.legal?.cases.filter(s => s.stage === 'convicted' || !!s.trial?.verdict && !['acquitted', 'dropped'].includes(s.trial.verdict.type)).map(s => s.id) ?? [])]).size;
  const integrity = Math.round(bound(c.reputation - proven * 20 - convictions * 25));
  const governance = Math.round(bound(laws * 6 + projects * 8 + managed * 7 - neglected * 12 + mean(samples.map(s => s.approval), approval ?? 0) * 0.4));
  const score = Math.round((governance * 0.35 + economy * 0.25 + happiness * 0.2 + integrity * 0.2) * 10);
  const hasOffice = held.size > 0;
  const classification: LegacyMetrics['classification'] = proven >= 2 || convictions > 0 ? 'Corrupt Leader' : !hasOffice || governance < 25 ? 'Failed Leader' : proven > 0 || integrity < 30 ? 'Controversial Leader' : score >= 800 && governance >= 75 && integrity >= 70 ? 'Great Leader' : laws >= 5 && projects >= 3 && economy >= 65 ? 'Transformational Leader' : governance >= 60 && economy >= 55 ? 'Successful Administrator' : (approval ?? 0) >= 65 && happiness >= 60 ? 'Popular Leader' : years >= 8 || wins >= 3 || weathered >= 2 ? 'Political Survivor' : score >= 450 ? 'Successful Administrator' : 'Failed Leader';
  return { governance, economy, happiness, integrity, score, classification, years, wins, losses, laws, projects, managed, neglected, proven, weathered, approval, offices: [...new Set([...held.values()].map(t => t.office.title))] };
}

export function recordLife(c: Career, kind: LifeRecord['kind'], cause: string, officeAtEnd = c.office?.title ?? null): Career {
  let n = captureLegacy(c);
  const l = legacyOf(n), id = `${l.owner}|${kind}`;
  if (l.archive.lives.some(r => r.id === id)) return n;
  const metrics = kind === 'death' && c.dynasty?.retired ? l.archive.lives.find(r => r.owner === l.owner && r.kind === 'retirement')?.metrics ?? legacyMetrics(n) : legacyMetrics(n);
  const reaction = metrics.approval === null ? 'Family and friends remember a private life; no final public approval was recorded.' : metrics.approval >= 65 ? 'The public mourns a widely admired figure.' : metrics.approval >= 40 ? 'Tributes and criticism reflect a divided public.' : 'Low final approval leaves a deeply contested public memory.';
  const obituary = `${c.character.name}, age ${c.age}, ${kind === 'death' ? `died: ${cause}` : `concluded active politics: ${cause}`} on ${c.date}. ${metrics.years} years in elected office; ${metrics.wins} general-election victories, ${metrics.laws} enacted measures, ${metrics.projects} completed projects and ${metrics.managed} crises managed. Historical verdict: ${metrics.classification}.`;
  const record: LifeRecord = { id, owner: l.owner, name: c.character.name, generation: c.dynasty?.generation ?? 1, age: c.age, date: c.date, kind, cause, officeAtEnd, metrics, obituary, reaction };
  const evidence = { id: `${id}|timeline`, owner: l.owner, date: c.date, kind: 'milestone' as const, title: `${c.character.name} · ${kind}`, detail: obituary, tenure: '', outcome: kind };
  n = { ...n, legacy: { ...l, death: kind === 'death' ? record : l.death, archive: { ...l.archive, lives: [...l.archive.lives, record], evidence: [...l.archive.evidence, evidence] } } };
  return n;
}

export function carryArchive(fresh: Career, previous: Career): Career {
  const p = legacyOf(captureLegacy(previous)), f = legacyOf(fresh);
  return { ...fresh, legacy: { ...f, archive: mergeArchives(p.archive, f.archive) } };
}