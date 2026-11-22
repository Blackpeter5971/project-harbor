import { describe, expect, it, vi } from 'vitest';
import { createCareer as createFreshCareer, defaultDraft, parseCareer } from '@/lib/game/career';
// Legacy fixtures assume a zero-resource start; background bonuses are covered in character-backgrounds.test.ts.
const createCareer = (d: Parameters<typeof createFreshCareer>[0]) => ({ ...createFreshCareer(d), money: 0, reputation: 0, experience: 0, relationships: 0 });
import { advanceMonth, applyForJob, acceptOffer, doActivity, changeParty, leaveJob, jobs, declineOffer, pendingOffer, takePosition, partySwitchConsequences } from '@/lib/game/gameplay';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));

// Salary/campaign accounting checks run rent-free; turn rent is covered in housing.test.ts.
vi.mock('@/lib/game/housing', async orig => ({ ...(await orig<typeof import('@/lib/game/housing')>()), collectRent: (career: unknown) => ({ career, notice: null, evicted: false }) }));
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));

const base = () => createCareer({ ...defaultDraft, name: 'Sam' });
describe('Politics and jobs rules', () => {
  it('upgrades old saves without losing the character', () => {
    const old = { version: 1, character: { ...defaultDraft, name: 'Old' }, age: 22, date: '2026-01-01', money: 0, reputation: 0, relationships: 0, publicOffice: false, eligibleAppointment: false };
    const c = parseCareer(JSON.stringify(old));
    expect(c?.character.name).toBe('Old');
    expect(c?.actions).toBe(100);
  });
  it('blocks small activities after 100% energy is spent and restores energy next turn', () => {
    let c = { ...base(), money: 10000 };
    for (let i = 0; i < 10; i++) { const r = doActivity(c, 'study'); if (r.ok) c = r.career; }
    expect(c.actions).toBe(0);
    expect(doActivity(c, 'study').ok).toBe(false);
    expect(advanceMonth(c).career.actions).toBe(100);
  });
  it('joining a party is free', () => {
    const r = changeParty(base(), 'Democrat');
    expect(r.ok && r.career.money).toBe(0);
  });
  it('pays salary for all three months of a turn exactly once and stops after leaving', () => {
    let c = base();
    let r = applyForJob(c, 'retail'); if (r.ok) c = r.career;
    c = { ...advanceMonth(c).career, report: null, pendingEvent: null };
    r = acceptOffer(c, 'retail'); if (r.ok) c = r.career;
    c = advanceMonth(c).career;
    expect(c.money).toBe(2550);
    expect(c.date).toBe('2026-07-01');
    r = leaveJob(c); if (r.ok) c = r.career;
    expect(advanceMonth(c).career.money).toBe(2550);
  });
  it('entry-level jobs pay under $1,000 a month', () => {
    for (const j of jobs.filter(j => !j.requirements.length)) expect(j.salary).toBeLessThan(1000);
  });
  it('declined offers are recorded and stop appearing', () => {
    let c = base();
    let r = applyForJob(c, 'retail'); if (r.ok) c = r.career;
    c = advanceMonth(c).career;
    r = declineOffer(c, 'retail'); if (r.ok) c = r.career;
    expect(c.applications[0]?.status).toBe('declined');
    expect(pendingOffer(c)).toBeUndefined();
  });
  it('fractional gains accumulate and survive saving', () => {
    let c = { ...base(), money: 1500 };
    for (let i = 0; i < 3; i++) { const r = doActivity(c, 'study', undefined, 0.5); if (r.ok) c = r.career; }
    expect(parseCareer(JSON.stringify(c))?.skills.leadership).toBe(0.7);
  });
  it('locks leadership activities until the player holds a position', () => {
    expect(doActivity(base(), 'organize').ok).toBe(false);
    expect(takePosition({ ...changeParty(base(), 'Democrat').ok ? (changeParty(base(), 'Democrat') as any).career : base(), experience: 20, contacts: 3 }, 'captain').ok).toBe(true);
  });
  it('party switching costs more for committee members than ordinary members', () => {
    const dem = { ...base(), character: { ...base().character, party: 'Democrat' as const }, reputation: 20, contacts: 10, relationships: 10 };
    expect(partySwitchConsequences({ ...dem, position: 'committee' }, 'Republican')!.rep).toBeGreaterThan(partySwitchConsequences(dem, 'Republican')!.rep);
    const r = changeParty({ ...dem, position: 'committee' }, 'Republican');
    expect(r.ok && r.career.position).toBe('none');
  });
  it('declines unqualified applications', () => {
    let c = base();
    const r = applyForJob(c, 'intern'); if (r.ok) c = r.career;
    expect(advanceMonth(c).career.applications[0]?.status).toBe('rejected');
  });
});
