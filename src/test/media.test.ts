import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { socialOf, socialMediaSchema } from '@/lib/game/social-media';
import { supportGroupsOf } from '@/lib/game/support-groups';
import { publishStance, mediaTurn, rollBroadcast, doBroadcast, declineBroadcast, ownedCoverage, COVERAGE, BROADCAST_COST } from '@/lib/game/media';

const make = (): Career => { const c = createCareer({ ...defaultDraft, name: 'Ada' }, () => 0); return { ...c, life: { ...c.life!, energy: 80 } }; };
const ok = (r: { ok: boolean; message: string; career?: Career }) => { if (!r.ok) throw new Error(r.message); return (r as { career: Career }).career; };
const mayor = (c: Career): Career => ({ ...c, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'City of Testville', since: c.date, party: 'Independent', elected: c.date, termEnd: '2030-01-01', margin: 5 }, publicOffice: true });
const withRequest = (c: Career, kind: 'radio' | 'tv' = 'radio'): Career => ({ ...c, socialMedia: { ...socialMediaSchema.parse({}), quarter: c.date, broadcast: { id: 'b1', date: c.date, kind, outlet: 'City Public Radio', show: 'Local Radio Interview', topic: 'transit', topicKind: 'office' } } });

describe('feed reactions', () => {
  it('a stance gets citizen, opposition and party colleague replies', () => {
    const c = ok(publishStance(make(), 'policy', 'We will build more housing.'));
    expect(socialOf(c).posts[0]!.reactions.map(r => r.role)).toEqual(['citizen', 'opposition', 'party']);
  });
  it('controversial statements push support groups down slightly', () => {
    const before = make();
    const c = ok(publishStance(before, 'policy', 'I will raise the tax on big companies.'));
    expect(socialOf(c).posts[0]!.controversial).toBe(true);
    expect(supportGroupsOf(c).loyalty['business']).toBe(supportGroupsOf(before).loyalty['business']! - 1);
  });
  it('a newly passed bill draws reactions once per turn', () => {
    const before = mayor(make());
    const bill = { id: 'b', tenure: 't', title: 'Clean Streets Act', kind: 'ordinance', policy: 'services', stage: 'passed', date: before.date, cost: 0 } as unknown as Career['bills'][number];
    const after = { ...before, bills: [bill] };
    const once = mediaTurn(before, after, before.date, '2026-04-01').career;
    const feed = socialOf(once).reactionFeed;
    expect(feed.length).toBe(3);
    expect(feed.every(f => f.about.includes('Clean Streets Act'))).toBe(true);
    expect(mediaTurn(before, once, before.date, '2026-04-01').career).toBe(once);
  });
  it('save and reload keeps reactions and the feed', () => {
    const c = ok(publishStance(make(), 'rebuttal', 'Wrong again.'));
    const loaded = parseCareer(JSON.stringify(c))!;
    expect(socialOf(loaded).posts[0]!.reactions).toHaveLength(3);
  });
});

describe('broadcasts', () => {
  it('requests only come to officeholders, candidates or popular accounts', () => {
    expect(rollBroadcast(make(), '2026-04-01', 0)).toBeNull();
    const dates = Array.from({ length: 20 }, (_, i) => `${2026 + i}-01-01`);
    // With nothing newsworthy, an officeholder gets no booking; a live campaign is a supported event.
    expect(dates.every(d => rollBroadcast(mayor({ ...make(), date: d }), d, 0) === null)).toBe(true);
    const racing = (d: string) => ({ ...mayor({ ...make(), date: d }), campaign: { title: 'Mayor', jurisdiction: 'Testville', phase: 'General', opponents: [] } as unknown as Career['campaign'] });
    const req = dates.map(d => rollBroadcast(racing(d), d, 0)).find(Boolean);
    expect(req?.topicKind).toBe('campaign');
  });
  it('costs one action, or energy instead', () => {
    const c = withRequest(mayor(make()));
    expect(ok(doBroadcast(c, 'vision', 'action')).actions).toBe(c.actions - 15);
    expect(ok(doBroadcast(c, 'vision', 'energy')).actions).toBe(c.actions - BROADCAST_COST.radio.energy);
  });
  it('changes reputation, approval and campaign polling, then clears the request', () => {
    const base = withRequest(mayor({ ...make(), reputation: 30 }));
    const withCamp = { ...base, campaign: { support: 10, momentum: 3, opponents: [], title: 'Mayor', jurisdiction: 'Testville' } as unknown as Career['campaign'] };
    const c = ok(doBroadcast(withCamp, 'record', 'action'));
    expect(c.reputation).not.toBe(base.reputation);
    expect(c.approval!.overall).not.toBe(mayor(make()).approval?.overall ?? -1);
    expect(c.campaign!.support).not.toBe(10);
    expect(socialOf(c).broadcast).toBeNull();
    expect(socialOf(c).broadcastHistory).toHaveLength(1);
    expect(doBroadcast(c, 'record', 'action').ok).toBe(false);
  });
  it('can be declined', () => {
    expect(socialOf(ok(declineBroadcast(withRequest(make())))).broadcast).toBeNull();
  });
});

describe('owned media', () => {
  const owner = (): Career => ({ ...make(), businesses: [{ id: 'm', catalogId: 'radio', name: 'Local Radio Station', kind: 'Local Radio Station', category: 'media', founded: '2026-01-01', account: 10_000, reputation: 30, lastProcessed: null, lastRevenue: 0, lastExpenses: 0, ledger: [] }] as Career['businesses'] });
  it('needs a media company', () => {
    expect(ownedCoverage(make(), 'favorable').ok).toBe(false);
  });
  it('is paid from the outlet account, once per quarter', () => {
    const c = ok(ownedCoverage(owner(), 'favorable'));
    expect(c.businesses[0]!.account).toBe(10_000 - COVERAGE.favorable.cost);
    expect(c.businesses[0]?.operatingCash).toBe(10_000 - COVERAGE.favorable.cost);
    expect(c.businesses[0]?.retainedEarnings).toBe(-COVERAGE.favorable.cost);
    expect(c.money).toBe(owner().money);
    expect(ownedCoverage(c, 'editorial').ok).toBe(false);
  });
});

import { replyToThread, draftSuggestions } from '@/lib/game/media';
import { socialTurn, threadsOf } from '@/lib/game/social-media';
describe('inbox replies', () => {
  const withMail = () => socialTurn(mayor(make()), '2026-01-01', '2026-04-01').career;
  it('warm reply to a friend or family member raises bond by 3, once per turn', () => {
    const c0 = { ...withMail(), date: '2026-04-01' };
    const t = threadsOf(socialOf(c0)).find(x => x.latest.kind !== 'elite');
    if (!t) return;
    const before = c0.life!.social!.contacts.find(p => p.id === t.id)?.affinity ?? c0.life!.social!.partner!.affinity;
    const c = ok(replyToThread(c0, t.id, 'warm'));
    const after = c.life!.social!.contacts.find(p => p.id === t.id)?.affinity ?? c.life!.social!.partner!.affinity;
    expect(after).toBe(Math.min(100, before + 3));
    expect(socialOf(c).inbox.some(m => m.fromMe)).toBe(true);
    expect(replyToThread(c, t.id, 'brief').ok).toBe(false);
  });
  it('agreeing to meet a political figure raises relationships by 1', () => {
    const c0 = { ...withMail(), date: '2026-04-01' };
    const t = threadsOf(socialOf(c0)).find(x => x.latest.kind === 'elite')!;
    expect(ok(replyToThread(c0, t.id, 'deal')).relationships).toBe(c0.relationships + 1);
  });
  it('offers ready-made drafts', () => {
    expect(draftSuggestions(mayor(make())).length).toBeGreaterThan(0);
  });
});
