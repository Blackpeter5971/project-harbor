import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { parseCareer, type Career } from '@/lib/game/career';
import { crisisCareer } from './crisis-fixture';
import { queueCrisisNews, crisisReportLines, activeCrisisWarnings } from '@/lib/game/crisis-news';
import { crisesTurn, crisisLifecycleTurn } from '@/lib/game/crises';
import { respondToCrisis } from '@/lib/game/crisis-responses';
import { publishEdition } from '@/lib/game/campaign';
import { advanceTurn as advanceGameTurn, continueTurnReport, continueAfterNewspaper } from '@/lib/game/gameplay';

const clean = () => ({ ...crisisCareer(), campaign: null, newsQueue: [], crisisGeneration: { lastProcessed: '', nextEligibleTurn: '2040-01-01' } });
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw Error('Save rejected'); return n; };

describe('Phase 5D crisis reporting', () => {
  it('queues major outbreaks once but not quiet generation or severity-one incidents', () => {
    let major = false, minor = false;
    for (let i = 0; i < 200; i++) {
      const c = { ...clean(), character: { ...clean().character, name: `News ${i}` }, crises: [], crisisGeneration: { lastProcessed: '', nextEligibleTurn: '' } };
      const n = crisesTurn(c, c.date, '2028-07-01');
      const p = n.crises[0];
      expect(n.newsQueue).toHaveLength(p && p.severity >= 2 ? 1 : 0);
      if (p && p.severity >= 2) { major = true; expect(crisesTurn(reload(n), c.date, '2028-07-01').newsQueue).toEqual(n.newsQueue); }
      if (p?.severity === 1) minor = true;
    }
    expect(major).toBe(true); expect(minor).toBe(true);
  });
  it.each(['invest', 'delay'])('queues %s choices only after success and preserves them through reload', id => {
    const c = clean(), r = respondToCrisis(c, 'test-crisis', id); if (!r.ok) throw Error(r.message);
    expect(r.career.newsQueue).toHaveLength(1); expect(r.career.crises[0]?.reportedEvents).toEqual(['response']);
    expect(respondToCrisis(reload(r.career), 'test-crisis', id).ok).toBe(false);
    const n = advanceTurn(reload(r.career)).career;
    expect(n.news[0]?.stories.filter(s => s.h.startsWith(id === 'delay' ? 'Delay draws criticism' : 'Response confirmed'))).toHaveLength(1);
    expect(n.report?.lines.filter(l => l.startsWith('Crisis response confirmed'))).toHaveLength(1);
  });
  it('failed and low-profile responses queue no stories', () => {
    const c = clean(); if (!c.treasury) throw Error('Missing treasury');
    expect(respondToCrisis({ ...c, treasury: { ...c.treasury, balance: 0 } }, 'test-crisis', 'invest').ok).toBe(false);
    expect(c.newsQueue).toEqual([]);
    for (const id of ['targeted', 'negotiate']) { const r = respondToCrisis(c, 'test-crisis', id); if (!r.ok) throw Error(r.message); expect(r.career.newsQueue).toEqual([]); }
  });
  it('first escalation produces one outcry article, not one every lingering quarter', () => {
    const c = clean(), p = c.crises[0]; if (!p) throw Error('Missing crisis');
    const ready = { ...c, crises: [{ ...p, neglectedTurns: 1, durationRemaining: 4 }] };
    const n = crisisLifecycleTurn(ready, c.date, '2028-07-01');
    expect(n.newsQueue).toHaveLength(1); expect(n.crises[0]?.reportedEvents).toEqual(['outcry']);
    const next = crisisLifecycleTurn({ ...reload(n), date: '2028-07-01' }, '2028-07-01', '2028-10-01');
    expect(next.newsQueue).toEqual(n.newsQueue);
    expect(crisisReportLines(next, { ...n, date: '2028-07-01' })).toEqual([]);
  });
  it.each(['managed', 'neglected'] as const)('reports %s resolution honestly and stops repeat articles', outcome => {
    const c = clean(), p = c.crises[0]; if (!p) throw Error('Missing crisis');
    const ready = { ...c, crises: [{ ...p, durationRemaining: 1, trajectory: outcome === 'managed' ? 'stabilizing' as const : 'prolonged' as const }] };
    const n = crisisLifecycleTurn(ready, c.date, '2028-07-01');
    expect(n.newsQueue).toHaveLength(1);
    expect(n.newsQueue[0]?.body.includes('not a successful intervention')).toBe(outcome === 'neglected');
    expect(crisisLifecycleTurn(reload(n), c.date, '2028-07-01').newsQueue).toEqual(n.newsQueue);
    expect(crisisReportLines(n, ready)).toHaveLength(1);
  });
  it('retains all crisis facts beyond four competing stories and permanent archive trimming', () => {
    const c = clean(), p = c.crises[0]; if (!p) throw Error('Missing crisis');
    let n = queueCrisisNews(c, p.id, 'outbreak', c.date);
    n = { ...n, newsQueue: [...Array.from({ length: 5 }, (_, i) => ({ h: `Election ${i}`, sub: 'Result', body: 'Recorded result', tag: 'election', priority: 1 })), ...n.newsQueue] };
    const printed = publishEdition(n, c, c.date, '2028-07-01', []);
    const h = n.newsQueue.at(-1)?.h; expect(printed.news[0]?.stories.some(s => s.h === h)).toBe(true);
    const trimmed = reload({ ...printed, news: [], crises: printed.crises.map(item => ({ ...item, reportedEvents: [] })) });
    expect(queueCrisisNews(trimmed, p.id, 'outbreak', c.date).newsQueue).toEqual([]);
  });
  it('allows a later outbreak with the same title, without reprinting the earlier event', () => {
    const c = clean(), first = queueCrisisNews(c, 'test-crisis', 'outbreak', c.date), p = c.crises[0]; if (!p) throw Error('Missing crisis');
    const later = queueCrisisNews({ ...first, crises: [...first.crises, { ...p, id: 'later', turnCreated: '2029-04-01' }] }, 'later', 'outbreak', '2029-04-01');
    expect(later.newsQueue).toHaveLength(2); expect(new Set(later.newsQueue.map(s => s.h)).size).toBe(2);
  });
  it('migrates missing news/lifecycle fields without resetting personal or government state', () => {
    const c = clean(), old = JSON.parse(JSON.stringify(c));
    for (const field of ['reportedEvents', 'resolutionDate', 'outcome', 'neglectedTurns', 'projectEffectsApplied']) delete old.crises[0][field];
    const n = reload(old);
    expect(n.crises[0]?.reportedEvents).toEqual([]); expect(n.money).toBe(5000); expect(n.treasury).toEqual(c.treasury); expect(n.approval).toEqual(c.approval);
    expect(advanceTurn(n).career.crises[0]?.durationRemaining).toBe(2);
    expect(advanceTurn(n).career.news.flatMap(e => e.stories).some(s => s.h.includes('breaks out'))).toBe(false);
  });
  it('report and paper continuation preserve articles, effects and balances without time replay', () => {
    const r = respondToCrisis(clean(), 'test-crisis', 'invest'); if (!r.ok) throw Error(r.message);
    const n = advanceTurn(r.career).career, report = continueTurnReport(reload(n)), paper = continueAfterNewspaper(reload(report));
    expect(n.newspaperPending).toBe(true); expect(report.report).toBeNull(); expect(paper.newspaperPending).toBe(false);
    for (const state of [report, paper]) { expect(state.news).toEqual(n.news); expect(state.crises).toEqual(n.crises); expect(state.treasury).toEqual(n.treasury); expect(state.date).toBe('2028-07-01'); }
    expect(advanceTurn(reload(n)).career).toEqual(reload(n));
  });
  it('summarizes current-office crises in one loading warning, excluding former/future offices', () => {
    const c = clean(); expect(activeCrisisWarnings(c)).toHaveLength(1);
    expect(activeCrisisWarnings({ ...c, office: null })).toEqual([]);
    expect(activeCrisisWarnings({ ...c, crises: c.crises.map(p => ({ ...p, tenure: 'foreign' })) })).toEqual([]);
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
