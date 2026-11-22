import { describe, expect, it , vi } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { jobs, jobSectors, missingJobRequirements, educationMeets } from '@/lib/game/job-market';
import { applyForJob, acceptOffer, advanceTurn } from '@/lib/game/gameplay';
import { employmentPay } from '@/lib/game/employment';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));

const nobody = (): Career => createCareer({ ...defaultDraft, name: 'Starter', background: 'Nobody', education: 'None' });
const role = (id: string) => { const j = jobs.find(j => j.id === id); if (!j) throw new Error(id); return j; };
const hired = (c: Career, id: string): Career => { const applied = applyForJob(c, id); if (!applied.ok) throw new Error(applied.message); const accepted = acceptOffer(applied.career, id); if (!accepted.ok) throw new Error(accepted.message); return accepted.career; };
describe('multi-sector civilian job market', () => {
  it('provides all ten requested sectors and their career tracks', () => {
    expect(jobSectors).toHaveLength(10);
    for (const sector of jobSectors) expect(jobs.filter(j => j.sector === sector).map(j => j.tier)).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(jobs.map(j => j.id)).toEqual(expect.arrayContaining(['clerk', 'policy-analyst', 'department-director', 'teacher', 'principal', 'professor', 'nurse', 'medical-officer', 'chief-medicine', 'teller', 'financial-analyst', 'investment-manager', 'junior-developer', 'systems-architect', 'tech-lead', 'site-laborer', 'logistics-coordinator', 'site-manager', 'sales-associate', 'store-manager', 'hotel-director', 'copywriter', 'reporter', 'editor-chief', 'factory-worker', 'farm-supervisor', 'operations-head', 'security-guard', 'police-officer', 'detective']));
  });
  it.each(['site-laborer', 'sales-associate', 'factory-worker', 'security-guard'])('hires zero-resource, zero-degree starters into %s immediately without fees', id => {
    const c = nobody();
    expect(c.money).toBe(0); expect(c.workMonths).toBe(0); expect(c.skills).toEqual({ communication: 0, knowledge: 0, leadership: 0 });
    expect(missingJobRequirements(c, role(id))).toEqual([]);
    const applied = applyForJob(c, id); if (!applied.ok) throw new Error(applied.message);
    expect(applied.career.applications[0]?.status).toBe('offered'); expect(applied.career.actions).toBe(85);
    const n = hired(c, id); expect(n.job?.id).toBe(id); expect(n.money).toBe(0); expect(n.ledger).toEqual([]);
  });
  it('rejects executive applicants immediately with education, work experience and skill deficiencies', () => {
    const result = applyForJob(nobody(), 'chief-medicine'); if (!result.ok) throw new Error(result.message);
    expect(result.career.applications[0]?.status).toBe('rejected');
    expect(result.career.applications[0]?.reason).toContain('Education: Advanced');
    expect(result.career.applications[0]?.reason).toContain('72 months work experience');
    expect(result.career.applications[0]?.reason).toContain('Knowledge 55+');
    expect(acceptOffer(result.career, 'chief-medicine').ok).toBe(false);
  });
  it('checks education ranks without invalidating existing educational choices', () => {
    for (const [education, level] of [['None', 0], ['High School Graduate', 1], ['Military', 1], ['Business', 2], ['Political Science', 2], ["Bachelor's Degree", 2], ['Law', 3], ['Advanced Degree', 3]] as const) {
      const c = createCareer({ ...defaultDraft, name: 'Graduate', education });
      expect(parseCareer(JSON.stringify(c))?.character.education).toBe(education);
      expect(educationMeets(c, "Bachelor's")).toBe(level >= 2);
      expect(educationMeets(c, 'Advanced')).toBe(level >= 3);
    }
  });
  it('uses paid work experience rather than political experience for civilian senior roles', () => {
    const c = { ...nobody(), character: { ...nobody().character, education: 'Advanced Degree' as const }, experience: 1000, skills: { knowledge: 100, leadership: 100, communication: 100 } };
    expect(missingJobRequirements(c, role('department-director'))).toEqual(['72 months work experience']);
    expect(missingJobRequirements({ ...c, workMonths: 72 }, role('department-director'))).toEqual([]);
  });
  it('pays the exact accepted quarterly salary in personal ledger once', () => {
    const c = hired(nobody(), 'factory-worker'); expect(employmentPay(c).quarterly).toBe(3900);
    const n = advanceTurn(c).career;
    expect(n.ledger.filter(e => e.label.startsWith('Salary')).map(e => e.amount)).toEqual([1300, 1300, 1300]);
    expect(n.skills.knowledge).toBe(1.5); expect(n.workMonths).toBe(3);
    expect(advanceTurn(n).career.ledger).toEqual(n.ledger);
    expect(n.campaign).toEqual(c.campaign); expect(n.treasury).toEqual(c.treasury); expect(n.businesses).toEqual(c.businesses); expect(n.warChest).toBe(c.warChest);
  });
  it('grants modest full-quarter reputation and role-specific skills only when performance standards are met', () => {
    const base = { ...nobody(), character: { ...nobody().character, education: 'High School Graduate' as const }, workMonths: 12, skills: { leadership: 20, communication: 15, knowledge: 0 } };
    const c = hired(base, 'store-manager'); const n = advanceTurn(c).career;
    expect(n.reputation).toBe(0.3); expect(n.skills.leadership).toBe(22.1);
    const low = advanceTurn({ ...c, skills: { ...c.skills, leadership: 0 } }).career;
    expect(low.reputation).toBe(0); expect(low.skills.leadership).toBe(2.1);
    const replay = advanceTurn({ ...n, report: null, pendingEvent: null, eventEncounter: null, newspaperPending: false, date: c.date }).career;
    expect(replay.reputation).toBe(n.reputation); expect(replay.skills).toEqual(n.skills);
  });
  it('preserves old jobs and wealth without imposing new requirements on existing workers', () => {
    const legacy = { ...nobody(), money: 5432, workMonths: 0, job: { id: 'teller', since: '2025-07-01' }, applications: [{ jobId: 'food', month: '2026-01-01', status: 'pending' as const }] };
    const c = parseCareer(JSON.stringify(legacy)); if (!c) throw new Error('Save failed');
    expect(c.money).toBe(5432); expect(c.job).toEqual(legacy.job); expect(employmentPay(c).salary).toBe(2400);
    const n = advanceTurn(c).career; expect(n.ledger.filter(e => e.label.startsWith('Salary')).map(e => e.amount)).toEqual([2400, 2400, 2400]);
    expect(n.applications[0]?.status).toBe('offered');
  });
  it('does not replay applications or accept an offer twice and rechecks live credentials', () => {
    const c = nobody(); const r = applyForJob(c, 'security-guard'); if (!r.ok) throw new Error(r.message);
    expect(applyForJob(r.career, 'security-guard').ok).toBe(false);
    const n = hired(c, 'security-guard'); expect(acceptOffer(n, 'security-guard').ok).toBe(false);
    const forged = { ...c, applications: [{ jobId: 'professor', month: c.date, status: 'offered' as const }] };
    expect(acceptOffer(forged, 'professor').ok).toBe(false);
  });
});