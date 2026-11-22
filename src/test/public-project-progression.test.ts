import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it , vi } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureTreasury, spendTreasury, treasuryTurn } from '@/lib/game/budget';
import { approveProject, manageProject, projectCatalog, publicProjects, publicProjectsTurn } from '@/lib/game/public-projects';
import { advanceTurn as advanceGameTurn } from '@/lib/game/gameplay';
import { cityState } from '@/lib/game/city';
import { stateGovernment } from '@/lib/game/state-government';
import { federalState } from '@/lib/game/federal';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));


const office = (id = 'mayor'): Career => ensureTreasury({ ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2028-04-01', money: 7000, warChest: 9000, publicOffice: true, office: { id, title: id, jurisdiction: 'Test', since: '2028-01-01', party: 'Independent', elected: '2027-11-01', termEnd: '2032-01-01', margin: 10 } });
const approve = (c = office(), category = 'transportation') => {
  const r = approveProject(c, category); if (!r.ok) throw new Error(r.message); return r.career;
};
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw new Error('Invalid save'); return n; };
const manage = (c: Career, action: 'resume' | 'cancel') => {
  const p = publicProjects(c)[0]; if (!p) throw new Error('No project');
  const r = manageProject(c, p.id, action); if (!r.ok) throw new Error(r.message); return r.career;
};
const cash = (c: Career, balance: number) => { if (!c.treasury) throw new Error('No treasury'); return { ...c, treasury: { ...c.treasury, balance } }; };

describe('Quarterly public construction', () => {
  it.each([['mayor', 50, 320000], ['governor', 25, 1600000], ['president', 100 / 6, 10666667]] as const)('stages one installment for %s and locks it through reload', (id, progress, payment) => {
    const c = approve(office(id)), n = publicProjectsTurn(c, c.date, '2028-07-01');
    expect(publicProjects(n)[0]?.progress).toBeCloseTo(progress, 5);
    expect(publicProjects(n)[0]?.constructionSpent).toBe(payment);
    expect(n.treasury?.balance).toBe((c.treasury?.balance ?? 0) - payment);
    const saved = reload(n);
    expect(publicProjectsTurn(saved, c.date, '2028-07-01')).toEqual(saved);
    expect(n.money).toBe(7000); expect(n.warChest).toBe(9000); expect(n.campaign).toEqual(c.campaign);
    expect(n.approval).toEqual(c.approval); expect(n.reputation).toBe(c.reputation); expect(n.newsQueue).toEqual(c.newsQueue);
  });
  it('integrates construction into the existing three-month turn and blocks report replay', () => {
    const c = approve(), n = advanceTurn(c).career;
    expect(n.date).toBe('2028-07-01'); expect(publicProjects(n)[0]?.progress).toBe(50);
    expect(n.treasury?.balance).toBe((treasuryTurn(c, c.date, n.date).treasury?.balance ?? 0) - 320000);
    expect(advanceTurn(reload(n)).career).toEqual(n);
  });
  it('rejects preceding, overlapping, invalid and non-quarterly periods', () => {
    const c = approve();
    for (const [start, end] of [['2028-01-01', '2028-04-01'], [c.date, '2028-05-01'], [c.date, '2028-13-01'], ['bad', 'bad']]) {
      expect(publicProjectsTurn(c, start ?? '', end ?? '')).toEqual(c);
    }
    const backdated = { ...c, date: '2028-01-01' };
    expect(publicProjectsTurn(backdated, backdated.date, '2028-04-01')).toEqual(backdated);
  });
  it('cannot charge a period twice even if a saved progress watermark is lost', () => {
    const c = publicProjectsTurn(approve(), '2028-04-01', '2028-07-01');
    if (!c.city) throw new Error('No city');
    const old = { ...c, city: { ...c.city, publicProjects: c.city.publicProjects.map(p => ({ ...p, lastProcessedEnd: '' })) } };
    expect(publicProjectsTurn(old, old.date, '2028-07-01')).toEqual(old);
  });
  it('pauses without partial charges or overdraft when an installment cannot be paid', () => {
    const c = cash(approve(), 199999), n = publicProjectsTurn(c, c.date, '2028-07-01');
    expect(publicProjects(n)[0]).toMatchObject({ status: 'paused', pauseReason: 'Halted due to treasury deficit', progress: 0, constructionSpent: 0, lastProcessedEnd: '2028-07-01' });
    expect(n.treasury).toEqual(c.treasury);
    expect(publicProjectsTurn(reload(n), c.date, '2028-07-01')).toEqual(initializeDocket(n));
  });
  it('pauses in the full turn when operating expenses leave a treasury deficit', () => {
    const c = cash(approve(), 0);
    const n = advanceTurn({ ...c, budget: { year: 2028, revenue: 8000000, taxes: 'hold', proposals: [], spending: { services: 10000000 } } }).career;
    expect(publicProjects(n)[0]?.status).toBe('paused'); expect(n.treasury?.balance).toBe(0);
  });
  it('requires funding to resume and restarts only future quarters', () => {
    let n = { ...publicProjectsTurn(cash(approve(), 0), '2028-04-01', '2028-07-01'), date: '2028-07-01' };
    const id = publicProjects(n)[0]?.id ?? '';
    expect(manageProject(n, id, 'resume').ok).toBe(false);
    n = manage(cash(n, 320000), 'resume');
    expect(n.treasury?.balance).toBe(320000); expect(publicProjects(n)[0]?.progress).toBe(0);
    expect(publicProjects(n)[0]?.expectedCompletionDate).toBe('2029-01-01');
    expect(manageProject(n, id, 'resume').ok).toBe(false);
    expect(publicProjects(publicProjectsTurn(n, n.date, '2028-10-01'))[0]).toMatchObject({ progress: 50, constructionSpent: 320000 });
  });
  it('cancels permanently, releases only unspent allocation, and never refunds spent cash', () => {
    const c = { ...publicProjectsTurn(approve(), '2028-04-01', '2028-07-01'), date: '2028-07-01' }, n = manage(c, 'cancel');
    expect(publicProjects(n)[0]).toMatchObject({ status: 'cancelled', constructionSpent: 320000, fundingCommitted: 320000 });
    expect(n.city?.spent).toBe(320000); expect(n.treasury).toEqual(c.treasury);
    const saved = reload(n); expect(publicProjectsTurn(saved, n.date, '2028-10-01')).toEqual(saved);
    expect(manageProject(saved, publicProjects(saved)[0]?.id ?? '', 'cancel').ok).toBe(false);
  });
  it.each(['mayor', 'governor', 'president'])('retains unfinished allocations through annual rollover for %s', id => {
    const c = approve({ ...office(id), date: '2028-10-01' }), next = { ...publicProjectsTurn(c, c.date, '2029-01-01'), date: '2029-01-01' };
    const p = publicProjects(next)[0]; if (!p) throw new Error('No project');
    const s = id === 'mayor' ? cityState(next) : id === 'governor' ? stateGovernment(next) : federalState(next);
    expect(s.spent).toBe(p.totalCost - p.constructionSpent);
    const cancelled = manage(next, 'cancel');
    expect((id === 'mayor' ? cancelled.city : id === 'governor' ? cancelled.stateGovernment : cancelled.federalGovernment)?.spent).toBe(0);
  });
  it('completes at exactly 100% and total cost without personal rewards or further charges', () => {
    let n = approve(office(), 'water');
    for (const [start, end] of [['2028-04-01', '2028-07-01'], ['2028-07-01', '2028-10-01'], ['2028-10-01', '2029-01-01']] as const) n = { ...publicProjectsTurn({ ...n, date: start }, start, end), date: end };
    expect(publicProjects(n)[0]).toMatchObject({ progress: 100, status: 'completed', constructionSpent: 800000 });
    expect(n.treasury?.balance).toBe(1200000); expect(n.reputation).toBe(office().reputation); expect(n.newsQueue).toHaveLength(1);
    expect(publicProjectsTurn(n, n.date, '2029-04-01')).toEqual(n);
  });
  it('migrates legacy full-cost escrow without double payments, releasing only unused escrow', () => {
    const c = office(), p = projectCatalog(c)[0]; if (!p) throw new Error('No project');
    const payment = spendTreasury(c, p.totalCost, p.id, 'Legacy project escrow'); if (!payment.ok) throw new Error(payment.message);
    const legacy = JSON.parse(JSON.stringify({ ...payment.career, city: { ...cityState(c), spent: p.totalCost, publicProjects: [{ ...p, status: 'approved', startDate: c.date, fundingCommitted: p.totalCost }] } }));
    for (const key of ['paymentMode', 'constructionSpent', 'lastProcessedEnd', 'pauseReason']) delete legacy.city.publicProjects[0][key];
    const loaded = parseCareer(JSON.stringify(legacy)); if (!loaded) throw new Error('Legacy save invalid');
    expect(publicProjects(loaded)[0]?.paymentMode).toBe('escrow');
    const n = { ...publicProjectsTurn(loaded, c.date, '2028-07-01'), date: '2028-07-01' };
    expect(n.treasury).toEqual(loaded.treasury); expect(publicProjects(n)[0]?.constructionSpent).toBe(320000);
    const cancelled = manage(n, 'cancel'); expect(cancelled.treasury?.balance).toBe(1680000);
    expect(cancelled.money).toBe(loaded.money); expect(cancelled.warChest).toBe(loaded.warChest);
  });
  it('gates management to the current executive and settles only full held-office quarters', () => {
    const c = approve(), id = publicProjects(c)[0]?.id ?? '';
    expect(manageProject({ ...c, actions: 0 }, id, 'cancel').ok).toBe(false);
    expect(manageProject({ ...c, office: null, publicOffice: false }, id, 'cancel').ok).toBe(false);
    expect(manageProject(c, 'unknown', 'cancel').ok).toBe(false);
    const final = { ...c, office: c.office ? { ...c.office, termEnd: '2028-07-01' } : null };
    expect(publicProjectsTurn(final, c.date, '2028-07-01').city?.publicProjects[0]?.progress).toBe(50);
    const partial = { ...c, office: c.office ? { ...c.office, termEnd: '2028-06-01' } : null };
    expect(publicProjectsTurn(partial, c.date, '2028-07-01')).toEqual(partial);
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
