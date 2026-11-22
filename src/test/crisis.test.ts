import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { crisisSchema, crisisTypes } from '@/lib/game/crisis-schema';
import { crisesTurn, crisisPool, crisisProbability, ensureCrises } from '@/lib/game/crises';
import { ensureApproval } from '@/lib/game/approval';
import { ensureTreasury } from '@/lib/game/budget';
import { advanceTurn as advanceGameTurn, nextMonth } from '@/lib/game/gameplay';
import { approveProject, publicProjectsTurn } from '@/lib/game/public-projects';

const office = (id = 'mayor', name = 'Alex Morgan'): Career => ensureApproval(ensureTreasury({
  ...createCareer({ ...defaultDraft, name }), date: '2028-04-01', money: 4321, warChest: 9876,
  reputation: 37, publicOffice: true, office: { id, title: id, jurisdiction: 'California', since: '2028-01-01', elected: '2027-11-01', termEnd: '2040-01-01', party: 'Independent', margin: 10 },
}));
function endDate(start: string) { return nextMonth(nextMonth(nextMonth(start))); }
function quarter(c: Career) { const end = endDate(c.date); return { ...crisesTurn(c, c.date, end), date: end }; }
function reload(c: Career) { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Save failed'); return n; }
function triggered(id = 'mayor'): { before: Career; after: Career } {
  for (let i = 0; i < 200; i++) { const before = office(id, `Leader ${i}`), after = quarter(before); if (after.crises.length) return { before, after }; }
  throw new Error('No crisis generated across deterministic seeds');
}

describe('Phase 5A contextual crisis engine', () => {
  it('defaults new careers to empty persisted crisis state', () => {
    const c = createCareer({ ...defaultDraft, name: 'Citizen' });
    expect(c.crises).toEqual([]); expect(c.crisisGeneration).toEqual({ lastProcessed: '', nextEligibleTurn: '' });
  });
  it('never generates for citizens, candidates or appointment eligibility alone', () => {
    for (let i = 0; i < 200; i++) {
      const c = { ...office('mayor', `Citizen ${i}`), office: null, publicOffice: i % 2 === 0, eligibleAppointment: true };
      expect(quarter(c).crises).toEqual([]); expect(crisisPool(c)).toEqual([]); expect(crisisProbability(c)).toBe(0);
    }
  });
  it('excludes expired, future and unrecognized offices', () => {
    const c = office(); if (!c.office) throw new Error('Missing office');
    for (const o of [{ ...c.office, termEnd: c.date }, { ...c.office, since: '2029-01-01' }, { ...c.office, id: 'unknown' }]) expect(quarter({ ...c, office: o }).crises).toEqual([]);
  });
  it.each([['mayor', 'city'], ['council', 'city'], ['governor', 'state'], ['stateLeg', 'state'], ['president', 'federal'], ['house', 'federal'], ['senate', 'federal']])('matches %s crises to %s responsibilities', (id, jurisdiction) => {
    const { after } = triggered(id);
    expect(after.crises).toHaveLength(1); expect(after.crises[0]?.jurisdiction).toBe(jurisdiction);
    expect(crisisSchema.safeParse(after.crises[0]).success).toBe(true);
    expect(after.crises[0]).toMatchObject({ status: 'active', selectedResponseId: null, turnCreated: '2028-07-01', lastProcessed: '2028-07-01' });
    expect(after.crises[0]?.severity).toBeGreaterThanOrEqual(1); expect(after.crises[0]?.severity).toBeLessThanOrEqual(3);
  });
  it('never offers or generates project failures without an in-progress project', () => {
    for (let i = 0; i < 100; i++) {
      const c = office('mayor', `Project ${i}`);
      expect(crisisPool(c).some(p => p.type === 'project_failure')).toBe(false);
      expect(quarter(c).crises.some(p => p.type === 'project_failure')).toBe(false);
    }
  });
  it('requires construction underway, excluding approved, paused, cancelled and completed projects', () => {
    const r = approveProject(office(), 'transportation'); if (!r.ok || !r.career.city) throw new Error('Approval failed');
    expect(crisisPool(r.career).some(p => p.type === 'project_failure')).toBe(false);
    const progressing = publicProjectsTurn(r.career, r.career.date, endDate(r.career.date));
    const candidate = crisisPool(progressing).find(p => p.type === 'project_failure');
    expect(candidate?.projectId).toBe(progressing.city?.publicProjects[0]?.id);
    expect(candidate).toBeDefined();
    const lowInfrastructure = { ...progressing, budget: { year: 2028, revenue: 8000000, taxes: 'hold' as const, proposals: [], spending: { infrastructure: 0 } } };
    expect(crisisPool(lowInfrastructure).find(p => p.type === 'project_failure')?.weight).toBeGreaterThan(candidate?.weight ?? 0);
    if (!progressing.city) throw new Error('Missing city');
    for (const status of ['paused', 'cancelled', 'completed'] as const) expect(crisisPool({ ...progressing, city: { ...progressing.city, publicProjects: progressing.city.publicProjects.map(p => ({ ...p, status })) } }).some(p => p.type === 'project_failure')).toBe(false);
    expect(crisisPool({ ...progressing, city: { ...progressing.city, tenure: 'old tenure', publicProjects: progressing.city.publicProjects.map(p => ({ ...p, tenure: 'old tenure' })) } }).some(p => p.type === 'project_failure')).toBe(false);
  });
  it('recognizes active legacy city construction without changing its records', () => {
    const r = approveProject(office(), 'transportation'); if (!r.ok || !r.career.city) throw new Error('Approval failed');
    const c = { ...r.career, city: { ...r.career.city, publicProjects: [], projects: [{ id: 'legacy', title: 'Bridge repairs', cost: 100000, progress: 20, status: 'active' as const, lastProcessed: '' }] } };
    expect(crisisPool(c).find(p => p.type === 'project_failure')?.projectId).toBe('legacy');
    expect(quarter(c).city).toEqual(c.city);
  });
  it('increases utility/project weights with low infrastructure and economic/strike weights with low employment', () => {
    const c = office(), low = { ...c, budget: { year: 2028, revenue: 8000000, taxes: 'hold' as const, proposals: [], spending: { infrastructure: 0, services: 0, administration: 0, education: 0 } } };
    for (const type of ['utility_failure', 'economic', 'worker_strike']) expect(crisisPool(low).find(p => p.type === type)?.weight).toBeGreaterThan(crisisPool(c).find(p => p.type === type)?.weight ?? 0);
    expect(crisisProbability(c)).toBe(0.22); expect(crisisProbability(low)).toBeGreaterThan(0.22); expect(crisisProbability(low)).toBeLessThanOrEqual(0.4);
    expect(crisisPool(low).find(p => p.type === 'health')?.weight).toBe(1);
  });
  it('excludes both active and escalated duplicates but permits resolved types', () => {
    const { after } = triggered(); const p = after.crises[0]; if (!p) throw new Error('Missing crisis');
    for (const status of ['active', 'escalated'] as const) expect(crisisPool({ ...after, crises: [{ ...p, status }] }).some(item => item.type === p.type)).toBe(false);
    expect(crisisPool({ ...after, crises: [{ ...p, status: 'resolved' }] }).some(item => item.type === p.type)).toBe(true);
    const all = { ...after, crises: crisisTypes.map(type => ({ ...p, type, status: 'active' as const })) };
    expect(crisisPool(all)).toEqual([]); expect(quarter(all).crises).toEqual(all.crises);
  });
  it('persists a 2–4-quarter cooldown and blocks consecutive-quarter generation across reload', () => {
    const { after } = triggered();
    const months = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
    const gap = months(after.crisisGeneration.nextEligibleTurn) - months(after.date) + 3;
    expect([6, 9, 12]).toContain(gap);
    expect(quarter(reload(after)).crises).toEqual(after.crises);
    let c = after;
    for (let i = 0; i < 30; i++) c = quarter(reload(c));
    for (let i = 1; i < c.crises.length; i++) expect(months(c.crises[i]?.turnCreated ?? '') - months(c.crises[i - 1]?.turnCreated ?? '')).toBeGreaterThanOrEqual(6);
  });
  it('locks generated and quiet evaluations against repeat and overlapping periods after reload', () => {
    const { before, after } = triggered();
    const saved = { ...reload(after), date: before.date };
    expect(crisesTurn(saved, before.date, after.date)).toBe(saved);
    const overlapping = { ...saved, date: '2028-05-01' };
    expect(crisesTurn(overlapping, overlapping.date, '2028-08-01')).toBe(overlapping);
    const quiet = { ...before, crisisGeneration: { lastProcessed: '', nextEligibleTurn: '2030-01-01' } };
    const processed = crisesTurn(quiet, quiet.date, endDate(quiet.date));
    expect(processed.crises).toEqual([]); expect(processed.crisisGeneration.lastProcessed).toBe('2028-07-01');
    const loaded = reload(processed); expect(crisesTurn(loaded, loaded.date, '2028-07-01')).toBe(loaded);
  });
  it('rejects invalid, non-quarterly, wrong-start and office-expiry intervals', () => {
    const c = office();
    for (const [start, end] of [['2028-04-01', '2028-05-01'], ['2028-13-01', '2029-04-01'], ['2028-01-01', '2028-04-01']] as const) expect(crisesTurn(c, start, end)).toBe(c);
    if (!c.office) throw new Error('Missing office');
    const ending = { ...c, office: { ...c.office, termEnd: '2028-07-01' } };
    expect(crisesTurn(ending, ending.date, '2028-07-01')).toBe(ending);
  });
  it('migrates legacy v2 saves without resetting treasury, approval or unrelated player state', () => {
    const c = office(), old = JSON.parse(JSON.stringify(c)); delete old.crises; delete old.crisisGeneration;
    const n = parseCareer(JSON.stringify(old)); if (!n) throw new Error('Legacy save rejected');
    expect(n.crises).toEqual([]); expect(n.crisisGeneration).toEqual({ lastProcessed: '', nextEligibleTurn: '' });
    expect(n).toEqual(initializeDocket(c));
    expect(ensureCrises(old)).toEqual(c);
  });
  it('migrates version-one saves with empty crises and original personal stats', () => {
    const c = office(); const n = parseCareer(JSON.stringify({ version: 1, character: c.character, age: 48, date: c.date, money: 12345, reputation: 37, relationships: 21, publicOffice: false, eligibleAppointment: false }));
    expect(n).toMatchObject({ age: 48, money: 12345, reputation: 37, relationships: 21, crises: [], crisisGeneration: { lastProcessed: '', nextEligibleTurn: '' } });
  });
  it('preserves existing crisis records while supplying missing optional marker/response defaults', () => {
    const { after } = triggered(); const old = JSON.parse(JSON.stringify(after));
    delete old.crisisGeneration; delete old.crises[0].selectedResponseId; delete old.crises[0].lastProcessed;
    const n = parseCareer(JSON.stringify(old)); if (!n) throw new Error('Save rejected');
    expect(n.crises[0]).toMatchObject({ id: after.crises[0]?.id, selectedResponseId: null, lastProcessed: '' });
    expect(n.treasury).toEqual(after.treasury); expect(n.approval).toEqual(after.approval);
    expect(quarter(n).crises).toEqual(n.crises);
  });
  it('generation only adds crisis state and major-outbreak news, not money or immediate gameplay effects', () => {
    const { before, after } = triggered();
    expect({ ...after, date: before.date, crises: before.crises, crisisGeneration: before.crisisGeneration, newsQueue: before.newsQueue }).toEqual(before);
    expect(after.newsQueue).toHaveLength((after.crises[0]?.severity ?? 0) >= 2 ? 1 : 0);
    expect(ensureCrises(after)).toBe(after);
  });
  it('integrates with the real quarterly pipeline and survives report/reload without replay', () => {
    const { before } = triggered(); const n = advanceTurn(before).career;
    expect(n.date).toBe('2028-07-01'); expect(n.crises).toHaveLength(1);
    expect(n.crisisGeneration.lastProcessed).toBe(n.date);
    const saved = reload(n); expect(advanceTurn(saved).career).toEqual(saved);
    expect(saved.crises).toEqual(n.crises); expect(saved.treasury).toEqual(n.treasury);
    expect(saved.crises[0]?.selectedResponseId).toBeNull();
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
