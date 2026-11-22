import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureNetwork } from '@/lib/game/network';
import { acceptAppointment, appointmentTurn, backCandidate, campaignForCandidate, resolveAppointmentSlot, resignAppointment, roleViews, whistleblow, withdrawPledge, DISMISS_AT, roleOf } from '@/lib/game/appointments';
import { launchCampaign } from '@/lib/game/campaign';

const base = (): Career => ensureNetwork({ ...createCareer({ ...defaultDraft, name: 'Ava Lane', party: 'Democrat' }, () => 0.9), reputation: 40, actions: 60, date: '2028-01-01' });
const trusted = (c: Career, office: string): Career => {
  const net = c.network!; const id = net.figures.find(f => f.office === office)!.id;
  return { ...c, network: { ...net, figures: net.figures.map(f => f.id === id ? { ...f, score: 70 } : f) } };
};
const ok = (r: ReturnType<typeof acceptAppointment>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const appointed = () => ok(acceptAppointment(trusted(base(), 'Mayor'), 'political-adviser'));

describe('Pathways to appointment', () => {
  it('network trust of 60+ with a sitting mayor opens a municipal role', () => {
    expect(roleViews(base()).find(v => v.role.id === 'political-adviser')!.pathway).not.toBe('network');
    expect(roleViews(trusted(base(), 'Mayor')).find(v => v.role.id === 'political-adviser')!.pathway).toBe('network');
  });
  it('blocks appointment for elected officials', () => {
    const c = { ...trusted(base(), 'Mayor'), office: { id: 'council', title: 'City Council Member', jurisdiction: 'x', since: '2027-01-01', party: 'Democrat' as const, elected: '', termEnd: '2031-01-01', margin: 0 } };
    expect(acceptAppointment(c, 'political-adviser').ok).toBe(false);
  });
  it('campaign backing blocks own candidacy and a won race makes the winner owe an appointment', () => {
    const c0 = trusted(base(), 'City Council Member');
    const id = c0.network!.figures.find(f => f.office === 'City Council Member')!.id;
    let c = ok(backCandidate(c0, id));
    expect(launchCampaign(c, 'council', 's', 'grassroots').ok).toBe(false);
    for (let i = 0; i < 6; i++) { const r = campaignForCandidate({ ...c, date: `2028-0${i + 2}-01`, actions: 60 }); if (r.ok) c = r.career; }
    c = { ...c, network: { ...c.network!, figures: c.network!.figures.map(f => f.id === id ? { ...f, score: 100 } : f) } };
    const t = appointmentTurn(c, '2028-11-01').career;
    expect(t.appointments!.pledge).toBeNull();
    if (t.appointments!.owed) expect(t.network!.figures.find(f => f.id === id)!.office).toBe('Mayor');
  });
  it('withdrawing a pledge damages the relationship by 20', () => {
    const c0 = trusted(base(), 'City Council Member');
    const id = c0.network!.figures.find(f => f.office === 'City Council Member')!.id;
    const c = ok(backCandidate(c0, id)); const before = c.network!.figures.find(f => f.id === id)!.score;
    const r = withdrawPledge(c); if (!r.ok) throw new Error();
    expect(r.career.network!.figures.find(f => f.id === id)!.score).toBe(before - 20);
  });
});

describe('Appointment dashboard and dockets', () => {
  it('accepting sets office details, superior, 4-year term and three dockets', () => {
    const a = appointed().appointments!.current!;
    expect(a.title).toBe("Mayor's Political Adviser");
    expect(a.termEnd).toBe('2032-01-01');
    expect(a.docket.map(d => d.slot)).toEqual(['advisory', 'administration', 'media']);
  });
  it('project supervision spends treasury allocation, never personal money', () => {
    let c = appointed(); const money = c.money; const a = c.appointments!.current!;
    const d = a.docket.find(x => x.slot === 'administration')!;
    c = ok(resolveAppointmentSlot(c, 'administration', 'supervise', a.revision));
    expect(c.money).toBe(money);
    expect(c.appointments!.current!.spent).toBe(Math.round(roleOf('political-adviser').budget * 0.15));
    expect(d.resolved).toBe(false);
  });
  it('rejects stale revisions and repeat decisions', () => {
    const c = appointed(), rev = c.appointments!.current!.revision;
    const once = ok(resolveAppointmentSlot(c, 'media', 'defend', rev));
    expect(resolveAppointmentSlot(once, 'media', 'defend', rev).ok).toBe(false);
    expect(resolveAppointmentSlot(once, 'media', 'neutral').ok).toBe(false);
  });
  it('defending the superior raises trust by 7', () => {
    const c = appointed(), t = c.appointments!.current!.trust;
    expect(ok(resolveAppointmentSlot(c, 'media', 'defend')).appointments!.current!.trust).toBe(Math.min(100, t + 7));
  });
});

describe('Career transitions', () => {
  it('pays quarterly salary once per turn end', () => {
    const c = appointed(), m = c.money;
    const t1 = appointmentTurn(c, '2028-04-01').career;
    expect(t1.money).toBe(m + roleOf('political-adviser').salary * 3);
    expect(appointmentTurn(t1, '2028-04-01').career.money).toBe(t1.money);
  });
  it('dismisses when trust falls below the threshold', () => {
    const c = appointed(); const a = c.appointments!.current!;
    const low = { ...c, appointments: { ...c.appointments!, current: { ...a, trust: DISMISS_AT - 1 } } };
    const t = appointmentTurn(low, '2028-04-01').career;
    expect(t.appointments!.current).toBeNull();
    expect(t.appointments!.history[0]!.reason).toBe('dismissed');
  });
  it('ends at term expiration without reappointment', () => {
    const c = appointed(); const a = c.appointments!.current!;
    const t = appointmentTurn({ ...c, appointments: { ...c.appointments!, current: { ...a, trust: 50, competency: 50 } } }, a.termEnd).career;
    expect(t.appointments!.history[0]!.reason).toBe('term');
  });
  it('resignation ends the appointment', () => {
    const r = resignAppointment(appointed()); if (!r.ok) throw new Error();
    expect(r.career.appointments!.history[0]!.reason).toBe('resigned');
  });
  it('whistleblowing needs evidence, adds 8 reputation and makes the superior an enemy', () => {
    const c = appointed(); expect(whistleblow(c).ok).toBe(false);
    const a = c.appointments!.current!;
    const r = whistleblow({ ...c, appointments: { ...c.appointments!, current: { ...a, misconduct: 'hiding an audit' } } }); if (!r.ok) throw new Error();
    expect(r.career.reputation).toBe(c.reputation + 8);
    expect(r.career.network!.figures.find(f => f.id === a.superiorId)!.score).toBe(-95);
    expect(r.career.appointments!.current).toBeNull();
  });
  it('survives a save round-trip and legacy saves load without appointments', () => {
    const c = appointed();
    expect(parseCareer(JSON.stringify(c))!.appointments!.current!.title).toBe(c.appointments!.current!.title);
    const legacy = { ...base() } as Record<string, unknown>; delete legacy['appointments'];
    expect(parseCareer(JSON.stringify(legacy))).not.toBeNull();
  });
});
