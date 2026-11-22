import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { launchCampaign, campaignStaffAction, staffRequest, staffRoster, recruitmentCandidates, campaignPayroll, settleDirectorPayroll, campaignAction, adPreview, scores, highDollarDinner, rivalVulnerabilities } from '@/lib/game/campaign';
import { communicationsGain, communicationsSeverity, directorStrength } from '@/lib/game/campaign-staff-schema';
import { doBroadcast } from '@/lib/game/media';
import { socialOf } from '@/lib/game/social-media';
function fixture(): Career {
  const r = launchCampaign({ ...createCareer({ ...defaultDraft, name: 'Director Tester' }), date: '2027-01-01', reputation: 60, experience: 120, contacts: 10, skills: { communication: 80, leadership: 40, knowledge: 40 } }, 'mayor', 'Our future', 'grassroots');
  if (!r.ok || !r.career.campaign) throw new Error('Missing campaign');
  return { ...r.career, campaign: { ...r.career.campaign, funds: 200000 } };
}
function hire(c: Career, role: 'field' | 'communications' | 'finance' | 'research') {
  const r = campaignStaffAction(c, staffRequest(c, role));
  if (!r.ok) throw new Error(r.message); return r.career;
}
describe('Specialist campaign directors', () => {
  it('recruits four rated directors, with campaign-only recruitment charges', () => {
    let c = fixture(); const money = c.money, ledger = c.ledger;
    for (const role of ['field', 'communications', 'finance', 'research'] as const) c = hire(c, role);
    expect(c.campaign?.staff).toBe(4); expect(c.campaign?.funds).toBe(140000);
    expect(c.actions).toBe(25); expect(c.money).toBe(money); expect(c.ledger).toEqual(ledger);
    if (!c.campaign) throw new Error('Missing campaign');
    expect(staffRoster(c.campaign)).toHaveLength(4);
    expect(staffRoster(c.campaign).every(d => d.competence >= 55 && d.competence <= 95 && d.loyalty >= 55 && d.loyalty <= 90)).toBe(true);
  });
  it('rejects duplicate/stale hire requests and unaffordable recruitment plus payroll', () => {
    const c = fixture(), req = staffRequest(c, 'field'); const n = hire(c, 'field');
    expect(campaignStaffAction(n, req).ok).toBe(false);
    expect(campaignStaffAction(n, staffRequest(n, 'field')).ok).toBe(false);
    if (!c.campaign) throw new Error('Missing campaign');
    const salary = recruitmentCandidates(c).find(d => d.role === 'field')?.salary ?? 0;
    const poor = { ...c, campaign: { ...c.campaign, funds: 15000 + salary - 1 } }, before = structuredClone(poor);
    expect(campaignStaffAction(poor, staffRequest(poor, 'field')).ok).toBe(false); expect(poor).toEqual(before);
    expect(campaignStaffAction({ ...c, date: '2027-04-01' }, req).ok).toBe(false);
  });
  it('gates research and finance by office tier', () => {
    const c = fixture(); if (!c.campaign) throw new Error('Missing campaign');
    const local = { ...c, campaign: { ...c.campaign, office: 'council' } };
    expect(campaignStaffAction(local, staffRequest(local, 'research')).ok).toBe(false);
    expect(campaignStaffAction(local, staffRequest(local, 'finance')).ok).toBe(false);
    expect(campaignStaffAction(local, staffRequest(local, 'field')).ok).toBe(true);
  });
  it('preserves legacy staff count, manager, salaries and money after backfill', () => {
    const c = fixture(); if (!c.campaign) throw new Error('Missing campaign');
    const old = { ...c, campaign: { ...c.campaign, staff: 7, manager: 'Original Manager' } };
    const loaded = parseCareer(JSON.stringify(old)); if (!loaded?.campaign) throw new Error('Save failure');
    expect(loaded.campaign.directors).toHaveLength(4); expect(loaded.campaign.directors?.[0]?.name).toBe('Original Manager');
    expect(loaded.campaign.legacyAides).toBe(3); expect(loaded.campaign.staff).toBe(7);
    expect(campaignPayroll(loaded.campaign)).toBe(5600); expect(loaded.campaign.funds).toBe(200000);
    expect(parseCareer(JSON.stringify(loaded))).toEqual(loaded);
  });
  it('settles exact specialist payroll once and rejects overlapping periods', () => {
    const c = hire(hire(fixture(), 'field'), 'communications'); if (!c.campaign) throw new Error('Missing campaign');
    const before = structuredClone(c.campaign), expected = campaignPayroll(c.campaign);
    const paid = settleDirectorPayroll(c.campaign, c.date, '2027-04-01');
    expect(paid.campaign.funds).toBe(c.campaign.funds - expected); expect(paid.campaign.spent).toBe(c.campaign.spent + expected);
    expect(paid.campaign.txns.filter(t => t.label.startsWith('Director payroll'))).toHaveLength(2);
    expect(settleDirectorPayroll(paid.campaign, c.date, '2027-04-01').campaign).toEqual(paid.campaign);
    expect(settleDirectorPayroll(paid.campaign, '2027-02-01', '2027-05-01').campaign).toEqual(paid.campaign); expect(c.campaign).toEqual(before);
  });
  it.each([0, 1, 1599, 1600, 2000, 3520])('never overdrafts $%s during specialist payroll', funds => {
    const c = hire(hire(fixture(), 'field'), 'communications'); if (!c.campaign) throw new Error('Missing campaign');
    const paid = settleDirectorPayroll({ ...c.campaign, funds }, c.date, '2027-04-01');
    expect(paid.campaign.funds).toBeGreaterThanOrEqual(0);
    expect(paid.campaign.spent - c.campaign.spent).toBeLessThanOrEqual(funds);
    if (funds < 1600) expect(paid.campaign.directors).toHaveLength(0);
  });
  it('Finance Chair increases actual capped call yields by 25%', () => {
    const c = fixture(), hired = hire(c, 'finance');
    const base = { ...c, actions: hired.actions, campaign: hired.campaign ? { ...hired.campaign, directors: [], staff: 1 } : null };
    const a = campaignAction(base, 'fundraise'), b = campaignAction(hired, 'fundraise');
    if (!a.ok || !b.ok) throw new Error('Call failed');
    expect(b.career.campaign?.raised).toBeCloseTo((a.career.campaign?.raised ?? 0) * 1.25, -1);
  });
  it('Finance Chair unlocks high-dollar dinners and prevents same-quarter replay', () => {
    const c = fixture(); expect(highDollarDinner(c).ok).toBe(false);
    const n = hire(c, 'finance'), result = highDollarDinner(n); if (!result.ok) throw new Error(result.message);
    expect(result.career.campaign?.raised).toBeGreaterThan(0); expect(result.career.campaign?.spent).toBe((n.campaign?.spent ?? 0) + 20000);
    expect(highDollarDinner(result.career).ok).toBe(false); expect(result.career.money).toBe(c.money);
  });
  it('research unlocks grounded vulnerabilities and exactly 35% stronger attack preview', () => {
    const c = fixture(), n = hire(c, 'research');
    expect(rivalVulnerabilities(c)).toEqual([]); expect(rivalVulnerabilities(n).length).toBeGreaterThan(0);
    expect(adPreview(n, 'attack', 'standard', 'independent')?.rivalDrop).toBe(3 * 1.35);
  });
  it('Field Director boosts real volunteer recruitment and election scoring', () => {
    const n = hire(fixture(), 'field'); if (!n.campaign) throw new Error('Missing campaign');
    const base = { ...n, campaign: { ...n.campaign, directors: [] } };
    const a = campaignAction(base, 'volunteers'), b = campaignAction(n, 'volunteers');
    if (!a.ok || !b.ok || !a.career.campaign || !b.career.campaign) throw new Error('Volunteers failed');
    expect(b.career.campaign.volunteers).toBeGreaterThan(a.career.campaign.volunteers);
    expect(scores(n, n.campaign)[n.character.name]).toBeGreaterThan(scores(base, base.campaign)[n.character.name] ?? 0);
  });
  it('communications ratings reduce severity and improve real TV interview gains', () => {
    const n = hire(fixture(), 'communications');
    expect(communicationsSeverity(n.campaign)).toBeLessThan(1); expect(communicationsGain(n.campaign)).toBeGreaterThan(1);
    expect(directorStrength(n.campaign, 'communications')).toBeGreaterThan(0);
    const social = { ...socialOf(n), broadcast: { id: 'director-tv', date: n.date, kind: 'tv' as const, outlet: 'Capitol TV', show: 'Interview', topic: 'Campaign', topicKind: 'campaign' as const } };
    const staffed = { ...n, socialMedia: social };
    const base = { ...staffed, campaign: n.campaign ? { ...n.campaign, directors: [] } : null };
    const a = doBroadcast(base, 'record', 'action'), b = doBroadcast(staffed, 'record', 'action');
    if (!a.ok || !b.ok) throw new Error('Interview failed');
    expect(b.career.campaign?.support).toBeGreaterThan(a.career.campaign?.support ?? 0);
  });
});