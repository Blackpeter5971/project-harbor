import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { registerScandal, scandalsTurn, coverageTone } from '@/lib/game/scandals';
import { applyPolicyLoyalty, recordPledge } from '@/lib/game/support-groups';
import { advanceTurn } from '@/lib/game/gameplay';
import { campaignTurn, launchCampaign, favorability, scores } from '@/lib/game/campaign';
import { socialOf } from '@/lib/game/social-media';
import { ownedCoverage } from '@/lib/game/media';
import { publicProjectSchema } from '@/lib/game/public-project-schema';
import { tenureKey } from '@/lib/game/support';
import { officeEventPool } from '@/lib/game/office-events';

const make = () => createCareer({ ...defaultDraft, name: 'Ada', background: 'Self-Made', party: 'Democrat' }, () => 0);
const mayor = (): Career => ({ ...make(), office: { id: 'mayor', title: 'Mayor', jurisdiction: 'Testville', party: 'Democrat', since: '2026-01-01', elected: '2025-11-01', termEnd: '2030-01-01', margin: 5 }, publicOffice: true });
const smear = (c: Career) => registerScandal(c, { id: 'smear-1', title: 'Opposition expense claim', summary: 'A rival claims expenses were misreported, without supporting records.', source: 'Opposition Leak', severity: 'Minor', evidence: 0, trigger: 'smear' });

describe('Phase 4A scandal foundation', () => {
  it('tracks ID, title, summary, source, severity, evidence and separate lifecycle/finding', () => {
    expect(smear(make()).scandals[0]).toMatchObject({ id: 'smear-1', title: 'Opposition expense claim', source: 'Opposition Leak', severity: 'Minor', evidence: 0, phase: 'Emerging', status: 'alleged', finding: null });
  });
  it('minor unsupported smears impose no reputation, approval, cash or action penalty', () => {
    const c = mayor(), n = scandalsTurn(smear(c), c.date, '2026-04-01').career;
    expect(n.reputation).toBe(c.reputation); expect(n.approval).toEqual(c.approval);
    expect(n.money).toBe(c.money); expect(n.actions).toBe(c.actions);
    expect(n.scandals[0]?.status).toBe('alleged'); expect(n.scandals[0]?.evidence).toBe(0);
  });
  it('quiet turns without gameplay conflicts produce no scandals', () => {
    expect(scandalsTurn(make(), '2026-01-01', '2026-04-01').career.scandals).toEqual([]);
    expect(officeEventPool(mayor())).not.toContain('office:ethics');
  });
  it('a broken recorded major pledge triggers grounded commentary without proving intent', () => {
    const n = applyPolicyLoyalty(recordPledge(make(), 'labor'), 'business', 'Corporate tax cut');
    expect(n.scandals[0]).toMatchObject({ trigger: 'promise', severity: 'Moderate', evidence: 65, status: 'alleged' });
    expect(applyPolicyLoyalty(make(), 'business', 'Corporate tax cut').scandals).toEqual([]);
  });
  it('late public construction triggers scrutiny and does not stack on repeated turns', () => {
    const c = mayor();
    const p = publicProjectSchema.parse({ id: 'hospital', name: 'Public hospital', category: 'healthcare', jurisdiction: 'city', tenure: tenureKey(c), catalogId: 'hospital', totalCost: 800000, fundingCommitted: 800000, durationTurns: 4, progress: 20, status: 'paused', startDate: '2025-01-01', expectedCompletionDate: '2025-10-01' });
    const input = { ...c, city: { publicProjects: [p] } as Career['city'] };
    const n = scandalsTurn(input, c.date, '2026-04-01').career;
    expect(n.scandals[0]).toMatchObject({ trigger: 'project', evidence: 60, status: 'alleged' });
    expect(scandalsTurn(n, c.date, '2026-04-01').career).toBe(n);
    expect(scandalsTurn(n, '2026-04-01', '2026-07-01').career.scandals).toHaveLength(1);
  });
  it('neglected disasters are grounded whistleblower triggers', () => {
    const c = mayor();
    const input: Career = { ...c, crises: [{ id: 'flood', type: 'natural_disaster', title: 'River flood', description: 'Flooding', jurisdiction: 'city', severity: 3, status: 'escalated', turnCreated: c.date, durationRemaining: 1, selectedResponseId: null, lastProcessed: '', tenure: tenureKey(c), projectId: null, trajectory: 'unaddressed', responseDate: null, indicatorEffects: { services: 0, infrastructure: 0, employment: 0 }, resolutionDate: null, outcome: null, neglectedTurns: 1, projectEffectsApplied: false, reportedEvents: [] }] };
    expect(scandalsTurn(input, c.date, '2026-04-01').career.scandals[0]).toMatchObject({ trigger: 'disaster', source: 'Whistleblower', severity: 'Severe' });
  });
  it('save/load preserves records, feed coverage and replay markers', () => {
    const n = scandalsTurn(smear(make()), '2026-01-01', '2026-04-01').career;
    expect(parseCareer(JSON.stringify(n))).toEqual(n);
    const count = socialOf(n).reactionFeed.length;
    expect(scandalsTurn(n, '2026-01-01', '2026-04-01').career.socialMedia?.reactionFeed).toHaveLength(count);
  });
  it('legacy records backfill safely without inventing evidence', () => {
    const n = parseCareer(JSON.stringify({ ...make(), scandals: [{ id: 'old', tenure: '', date: '2026-01-01', subject: 'Ada', allegation: 'Claim', status: 'alleged', finding: null }] }));
    expect(n?.scandals[0]).toMatchObject({ phase: 'Emerging', evidence: 0, status: 'alleged' });
  });
  it('cleared claims have correction tone and remain cleared after progression', () => {
    const c = smear(make());
    const n = scandalsTurn({ ...c, scandals: c.scandals.map(s => ({ ...s, status: 'cleared', finding: 'Records contradict the claim.' })) }, c.date, '2026-04-01').career;
    expect(n.scandals[0]?.phase).toBe('Managed');
    const s = n.scandals[0]; if (!s) throw new Error('Missing record');
    expect(coverageTone(s)).toBe('Correction / allegation unsupported');
  });
  it('an intense controversy never turns evidence into automatic guilt', () => {
    const c = registerScandal(make(), { id: 'severe', title: 'Oversight leak', summary: 'Disputed records', source: 'Whistleblower', severity: 'Severe', evidence: 80, trigger: 'project' });
    const n = scandalsTurn(c, c.date, '2026-04-01').career;
    expect(n.scandals[0]?.phase).toBe('Exploded'); expect(n.scandals[0]?.status).toBe('alleged');
  });
  it('turn flow saves scandal report lines, newspaper coverage and social posts', () => {
    const c = applyPolicyLoyalty(recordPledge(make(), 'labor'), 'business', 'Corporate tax cut');
    const n = advanceTurn(c).career;
    expect(n.report?.lines.some(l => l.includes('Scandal watch: Broken pledge'))).toBe(true);
    expect(n.news[0]?.stories.some(s => s.tag === 'scandal' && s.h.includes('Broken pledge'))).toBe(true);
    expect(n.news[0]?.stories.filter(s => s.tag === 'scandal' && s.h.includes('Broken pledge'))).toHaveLength(1);
    expect(socialOf(n).reactionFeed.some(p => p.about.includes('Broken pledge'))).toBe(true);
    expect(socialOf(n).reactionFeed.filter(p => p.about.includes('Broken pledge'))).toHaveLength(1);
  });
  it('campaign smears have only a small unproven penalty and cannot randomly establish player guilt', () => {
    const result = launchCampaign({ ...make(), experience: 80, reputation: 30, skills: { communication: 20, leadership: 30, knowledge: 20 } }, 'council', 'Listen', 'grassroots');
    if (!result.ok || !result.career.campaign) throw new Error('Campaign missing');
    const c = result.career, camp = result.career.campaign;
    const allegation = { target: 'Ada', text: 'misreported expenses', status: 'alleged' as const, date: c.date };
    const alleged = { ...c, campaign: { ...camp, allegation } };
    expect(favorability(c) - favorability(alleged)).toBe(1);
    expect((scores(c, camp)['Ada'] ?? 0) - (scores(alleged, alleged.campaign)['Ada'] ?? 0)).toBeCloseTo(0.5);
    expect(campaignTurn(alleged, c.date, '2026-04-01').career.campaign?.allegation?.status).toBe('cleared');
  });
  it('exposed owned-media dealings register one controversy without duplicating their penalty', () => {
    let exposed: Career | null = null;
    for (let i = 0; i < 40; i++) {
      const c: Career = { ...make(), character: { ...make().character, name: `Owner ${i}` }, reputation: 30, businesses: [{ id: 'm', catalogId: 'radio', name: 'Local Radio Station', kind: 'Local Radio Station', category: 'media', founded: '2026-01-01', account: 10000, reputation: 30, lastProcessed: null, lastRevenue: 0, lastExpenses: 0, ledger: [] }] };
      const r = ownedCoverage(c, 'editorial'); if (r.ok && r.career.scandals.length) { exposed = r.career; break; }
    }
    expect(exposed?.scandals).toHaveLength(1); expect(exposed?.scandals[0]?.trigger).toBe('business'); expect(exposed?.reputation).toBe(26);
  });
});