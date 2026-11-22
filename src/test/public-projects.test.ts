import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureTreasury } from '@/lib/game/budget';
import { approveProject, projectCatalog, publicProjects } from '@/lib/game/public-projects';
import { publicProjectSchema } from '@/lib/game/public-project-schema';
import { cityState } from '@/lib/game/city';
import { stateGovernment } from '@/lib/game/state-government';
import { federalState } from '@/lib/game/federal';
import { advanceTurn as advanceGameTurn } from '@/lib/game/gameplay';

const office = (id = 'mayor'): Career => ensureTreasury({ ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2028-04-01', money: 7000, warChest: 9000, publicOffice: true, office: { id, title: id, jurisdiction: 'Test jurisdiction', since: '2028-01-01', party: 'Independent', elected: '2027-11-01', termEnd: '2032-01-01', margin: 10 } });
const approved = (c: Career, category = 'transportation') => { const r = approveProject(c, category); if (!r.ok) throw new Error(r.message); return r.career; };

describe('Public project architecture and approvals', () => {
  it.each([['mayor', 'city', 1, 2], ['governor', 'state', 10, 4], ['president', 'federal', 100, 6]] as const)('loads all six categories at %s scale', (id, jurisdiction, scale, duration) => {
    const catalog = projectCatalog(office(id));
    expect(catalog.map(p => p.category)).toEqual(['transportation', 'healthcare', 'education', 'water', 'electricity', 'housing']);
    expect(catalog.map(p => p.totalCost)).toEqual([400000, 800000, 600000, 500000, 700000, 900000].map(cost => Math.round(cost * scale * 1.6)));
    expect(catalog.every(p => p.jurisdiction === jurisdiction && p.durationTurns >= 2 && p.durationTurns <= 8)).toBe(true);
    expect(catalog[0]?.durationTurns).toBe(duration);
    expect(catalog.every(p => p.status === 'proposed' && p.progress === 0 && p.fundingCommitted === 0 && p.startDate === null)).toBe(true);
  });
  it.each(['mayor', 'governor', 'president'])('commits full funding exactly once for %s without personal transfers or rewards', id => {
    const c = office(id), project = projectCatalog(c)[0];
    if (!project || !c.treasury) throw new Error('Missing treasury/catalog');
    const n = approved(c), p = publicProjects(n)[0];
    expect(n.treasury?.balance).toBe(c.treasury.balance);
    expect(p).toMatchObject({ status: 'approved', progress: 0, fundingCommitted: project.totalCost, startDate: '2028-04-01' });
    expect(p?.expectedCompletionDate).toBe(id === 'mayor' ? '2028-10-01' : id === 'governor' ? '2029-04-01' : '2029-10-01');
    expect(n.actions).toBe(c.actions - 15);
    expect(n.money).toBe(7000); expect(n.warChest).toBe(9000); expect(n.campaign).toEqual(c.campaign);
    expect(n.approval).toEqual(c.approval); expect(n.reputation).toBe(c.reputation);
    const state = id === 'mayor' ? n.city : id === 'governor' ? n.stateGovernment : n.federalGovernment;
    expect(state?.spent).toBe(project.totalCost);
    const reloaded = parseCareer(JSON.stringify(n));
    if (!reloaded) throw new Error('Save rejected');
    expect(approveProject(reloaded, 'transportation').ok).toBe(false);
    expect(reloaded.treasury).toEqual(n.treasury);
  });
  it('rejects insufficient treasury without consuming actions or changing the input', () => {
    const c = office(); if (!c.treasury) throw new Error('Missing treasury');
    c.treasury.balance = 399999;
    const before = JSON.stringify(c), r = approveProject(c, 'transportation');
    expect(r.ok).toBe(false); expect(r.message).toContain('Insufficient government treasury');
    expect(JSON.stringify(c)).toBe(before); expect(c.actions).toBe(100);
  });
  it('cannot erase allocations or approve without actions', () => {
    const c = office(), state = cityState(c);
    expect(approveProject({ ...c, city: { ...state, spent: 3_000_000 } }, 'transportation').ok).toBe(false);
    expect(approveProject({ ...c, actions: 0 }, 'transportation').ok).toBe(false);
    expect(approveProject(c, 'unknown').ok).toBe(false);
  });
  it('gates commitment authority but lets all elected jurisdictions inspect proposals', () => {
    for (const id of ['council', 'stateLeg', 'house', 'senate']) { expect(projectCatalog(office(id))).toHaveLength(6); expect(approveProject(office(id), 'water').ok).toBe(false); }
    expect(projectCatalog(createCareer({ ...defaultDraft, name: 'Citizen' }))).toEqual([]);
    expect(approveProject({ ...office(), date: '2032-01-01' }, 'water').ok).toBe(false);
  });
  it('defaults absent fields and preserves legacy projects, balances and records', () => {
    const c = office();
    const old = JSON.parse(JSON.stringify({ ...c, city: cityState(c), stateGovernment: stateGovernment(c), federalGovernment: federalState(c) }));
    delete old.city.publicProjects; delete old.stateGovernment.publicProjects; delete old.federalGovernment.publicProjects;
    old.city.projects = [{ id: 'legacy', title: 'Neighborhood renewal', cost: 640000, progress: 50, status: 'active', lastProcessed: '2028-04-01' }];
    const n = parseCareer(JSON.stringify(old));
    expect(n?.city?.publicProjects).toEqual([]); expect(n?.stateGovernment?.publicProjects).toEqual([]); expect(n?.federalGovernment?.publicProjects).toEqual([]);
    expect(n?.city?.projects).toEqual(old.city.projects); expect(n?.treasury).toEqual(c.treasury); expect(n?.money).toBe(c.money);
    old.city.projects = []; expect(parseCareer(JSON.stringify(old))?.city?.projects).toEqual([]);
  });
  it.each(['proposed', 'approved', 'in_progress', 'completed', 'paused', 'cancelled'] as const)('serializes lifecycle status %s', status => {
    const p = projectCatalog(office())[0]; if (!p) throw new Error('Missing project');
    expect(publicProjectSchema.parse({ ...p, status }).status).toBe(status);
  });
  it('progresses approved projects on quarterly advance without completion rewards', () => {
    const c = approved(office()), n = advanceTurn(c).career;
    expect(publicProjects(n)[0]?.progress).toBe(50); expect(publicProjects(n)[0]?.status).toBe('in_progress');
    expect(publicProjects(n)[0]?.constructionSpent).toBe(320000);
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
