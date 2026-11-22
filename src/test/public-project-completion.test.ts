import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureTreasury, indicators } from '@/lib/game/budget';
import { ensureApproval } from '@/lib/game/approval';
import { approveProject, manageProject, projectReportLines, publicProjects, publicProjectsTurn } from '@/lib/game/public-projects';
import { projectBenefit, projectCategories } from '@/lib/game/public-project-schema';
import { cityState } from '@/lib/game/city';
import { advanceTurn as advanceGameTurn, nextMonth } from '@/lib/game/gameplay';
import { publishEdition } from '@/lib/game/campaign';

const office = (id = 'mayor'): Career => ensureApproval(ensureTreasury({ ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2028-04-01', money: 7000, warChest: 9000, publicOffice: true, office: { id, title: id, jurisdiction: 'Test jurisdiction', since: '2028-01-01', party: 'Independent', elected: '2027-11-01', termEnd: '2032-01-01', margin: 10 } }));
function approve(c: Career, category: string) { const r = approveProject(c, category); if (!r.ok) throw new Error(r.message); return r.career; }
function quarter(c: Career) { let end = c.date; for (let i = 0; i < 3; i++) end = nextMonth(end); return { ...publicProjectsTurn(c, c.date, end), date: end }; }
function reload(c: Career) { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Invalid career'); return n; }
function ready(id = 'mayor', category = 'transportation') {
  let c = approve(office(id), category); const duration = publicProjects(c)[0]?.durationTurns ?? 0;
  for (let i = 1; i < duration; i++) c = quarter(c);
  return c;
}

describe('Public project completion benefits', () => {
  it.each(projectCategories.map(p => p.id))('boosts only the relevant public indicator and employment for %s', category => {
    const c = ready('mayor', category), before = indicators(c), n = quarter(c), p = publicProjects(n)[0];
    if (!p) throw new Error('Missing project');
    const b = projectBenefit(p), after = indicators(n);
    expect(p).toMatchObject({ status: 'completed', progress: 100, benefitsApplied: true, completionDate: n.date, constructionSpent: p.totalCost });
    expect(after.services - before.services).toBe(b.services);
    expect(after.infrastructure - before.infrastructure).toBe(b.infrastructure);
    expect(after.employment - before.employment).toBe(1);
    expect((n.approval?.overall ?? 0) - (c.approval?.overall ?? 0)).toBeCloseTo(category === 'healthcare' || category === 'housing' ? 1.2 : 1, 5);
    expect(n.money).toBe(c.money); expect(n.warChest).toBe(c.warChest); expect(n.campaign).toEqual(c.campaign);
    expect(n.elections).toEqual(c.elections); expect(n.reputation).toBe(c.reputation); expect(n.age).toBe(c.age);
    const saved = reload(n);
    expect(publicProjectsTurn({ ...saved, date: c.date }, c.date, n.date)).toEqual({ ...saved, date: c.date });
    expect(quarter(saved).approval).toEqual(saved.approval); expect(indicators(saved)).toEqual(after);
    expect(saved.newsQueue).toHaveLength(1);
  });
  it.each([['mayor', 3, 1, 1], ['governor', 3.75, 1.25, 1.2], ['president', 4.5, 1.5, 1.4]] as const)('scales public benefits and gradual approval for %s', (id, infrastructure, employment, approval) => {
    const c = ready(id), n = quarter(c), before = indicators(c), after = indicators(n);
    expect(after.infrastructure - before.infrastructure).toBe(infrastructure);
    expect(after.employment - before.employment).toBe(employment);
    expect((n.approval?.overall ?? 0) - (c.approval?.overall ?? 0)).toBeCloseTo(approval, 5);
  });
  it('dampens concurrent completions and caps combined completion approval at three points', () => {
    let c = { ...office(), actions: 90 };
    for (const p of projectCategories) {
      if (!c.treasury) throw new Error('No treasury');
      c = approve({ ...c, treasury: { ...c.treasury, balance: 20000000 }, city: { ...cityState(c), spent: 0 } }, p.id);
    }
    if (!c.city) throw new Error('No city');
    c = { ...c, city: { ...c.city, publicProjects: c.city.publicProjects.map(p => ({ ...p, progress: 99, constructionSpent: p.totalCost - 1 })) } };
    const n = quarter(c), gains = n.approval?.history.filter(h => h.reason.startsWith('Public project completed:')).map(h => h.change) ?? [];
    expect(gains).toHaveLength(6); expect(gains.reduce((sum, d) => sum + d, 0)).toBeLessThanOrEqual(3);
    expect(gains.at(-1)).toBe(1); expect(gains.at(0)).toBeLessThan(1);
    expect(n.newsQueue).toHaveLength(6);
  });
  it('keeps indicators and approval within their existing upper bounds', () => {
    let c = ready(); if (!c.approval) throw new Error('No approval');
    c = { ...c, approval: { ...c.approval, overall: 95 }, budget: { year: 2028, revenue: 8000000, taxes: 'hold', proposals: [], spending: { infrastructure: 99999999, services: 99999999, administration: 99999999, education: 99999999, safety: 99999999 } } };
    const n = quarter(c);
    expect(n.approval?.overall).toBe(95);
    expect(indicators(n)).toEqual({ services: 98, infrastructure: 98, employment: 98 });
  });
  it('completes a seven-quarter project on its final paid quarter despite fractional rounding', () => {
    const c = ready('president', 'water'), n = quarter(c);
    expect(publicProjects(n)[0]).toMatchObject({ durationTurns: 7, progress: 100, status: 'completed', completionDate: n.date, benefitsApplied: true, constructionSpent: 80000000 });
  });
  it('retains all simultaneous completion stories beyond the ordinary newspaper story cap', () => {
    let c = { ...office(), actions: 90 };
    for (const p of projectCategories) {
      if (!c.treasury) throw new Error('No treasury');
      c = approve({ ...c, treasury: { ...c.treasury, balance: 20000000 }, city: { ...cityState(c), spent: 0 } }, p.id);
    }
    if (!c.city) throw new Error('No city');
    c = { ...c, city: { ...c.city, publicProjects: c.city.publicProjects.map(p => ({ ...p, progress: 99, constructionSpent: p.totalCost - 1 })) } };
    const n = quarter(c), loaded = reload(n), published = publishEdition(loaded, c, c.date, n.date, []);
    expect(published.news[0]?.stories.filter(s => s.h.includes(' completed ·'))).toHaveLength(6);
    expect(published.newsQueue).toEqual([]);
    expect(publishEdition(reload(published), c, c.date, n.date, [])).toEqual(published);
  });
  it('publishes completion in the quarterly report and newspaper without replay on reload', () => {
    const c = ready(), n = advanceTurn(c).career;
    const p = publicProjects(n)[0]; if (!p) throw new Error('No project');
    expect(p.completionDate).toBe('2028-10-01'); expect(n.newspaperPending).toBe(true);
    expect(n.report?.lines.some(l => l.includes(p.name) && l.startsWith('Public project completed:'))).toBe(true);
    const stories = n.news[0]?.stories.filter(s => s.h.startsWith(`${p.name} completed`));
    expect(stories).toHaveLength(1); expect(n.newsQueue).toEqual([]);
    expect(n.printedHeadlines).toContain(stories?.[0]?.h);
    const loaded = reload(n); expect(advanceTurn(loaded).career).toEqual(loaded);
    expect(loaded.approval).toEqual(n.approval); expect(loaded.news).toEqual(n.news);
  });
  it('reports cancellations and funding stalls without any completion benefit or story', () => {
    const c = approve(office(), 'transportation'), p = publicProjects(c)[0]; if (!p || !c.treasury) throw new Error('Missing project');
    const cancelled = manageProject(c, p.id, 'cancel'); if (!cancelled.ok) throw new Error(cancelled.message);
    const afterCancel = advanceTurn(cancelled.career).career;
    expect(afterCancel.report?.lines.some(l => l.startsWith('Public project cancelled:'))).toBe(true);
    expect(indicators(cancelled.career)).toEqual(indicators(c)); expect(cancelled.career.approval).toEqual(c.approval);
    expect(cancelled.career.newsQueue).toEqual(c.newsQueue);
    const unfunded = { ...c, treasury: { ...c.treasury, balance: 0 }, budget: { year: 2028, revenue: 8000000, taxes: 'hold' as const, proposals: [], spending: { services: 10000000 } } };
    const stalled = advanceTurn(unfunded).career;
    expect(stalled.report?.lines.some(l => l.includes('Halted due to treasury deficit'))).toBe(true);
    expect(publicProjects(stalled)[0]?.benefitsApplied).toBe(false);
    expect(stalled.news.flatMap(e => e.stories).some(s => s.h.startsWith(`${p.name} completed`))).toBe(false);
    expect(projectReportLines({ ...cancelled.career, date: '2028-07-01' }, '2028-07-01', '2028-10-01')).toEqual([]);
  });
  it('migrates completed legacy saves without retroactive approval awards or news', () => {
    const c = quarter(ready()), old = JSON.parse(JSON.stringify(c));
    for (const key of ['completionDate', 'benefitsApplied', 'cancelledDate']) delete old.city.publicProjects[0][key];
    const n = parseCareer(JSON.stringify(old)); if (!n) throw new Error('Save invalid');
    expect(publicProjects(n)[0]).toMatchObject({ completionDate: null, benefitsApplied: false, cancelledDate: null });
    expect(n.money).toBe(c.money); expect(n.approval).toEqual(c.approval);
    expect(quarter(n).approval).toEqual(n.approval); expect(quarter(n).newsQueue).toEqual(n.newsQueue);
    expect(indicators(n).infrastructure).toBe(indicators(c).infrastructure - 3);
  });
  it('does not award unheld-office bonuses or benefits to incomplete projects', () => {
    const c = ready(), citizen = { ...c, office: null, publicOffice: false };
    expect(quarter(citizen).approval).toEqual(citizen.approval);
    expect(quarter(citizen).newsQueue).toEqual(citizen.newsQueue);
    expect(indicators(c)).toEqual(indicators(office()));
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
