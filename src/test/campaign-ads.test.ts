import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { adRequest, adPreview, adTrust, adBudgets, purchaseCampaignAd, launchCampaign, takePoll, scores, campaignTurn, offices } from '@/lib/game/campaign';
function fixture(): Career {
  const r = launchCampaign({ ...createCareer({ ...defaultDraft, name: 'Ad Candidate' }), date: '2027-01-01', reputation: 60, experience: 120, skills: { communication: 40, leadership: 40, knowledge: 40 } }, 'mayor', 'Our future', 'grassroots');
  if (!r.ok || !r.career.campaign) throw new Error('No campaign');
  return { ...r.career, campaign: { ...r.career.campaign, funds: 1000000, endorsements: [{ group: 'working', candidate: 'Ad Candidate' }] } };
}
const success = (r: ReturnType<typeof purchaseCampaignAd>) => { if (!r.ok) throw new Error(r.message); return r.career; };
describe('Strategic ads', () => {
  it('scales low/medium/high costs across offices and budgets', () => {
    const c = fixture();
    for (const o of offices) for (const b of adBudgets) {
      const n = { ...c, campaign: c.campaign ? { ...c.campaign, office: o.id } : null };
      const positive = adPreview(n, 'positive', b.id, 'all')?.cost ?? 0;
      expect(positive).toBeGreaterThan(0);
      expect(adPreview(n, 'contrast', b.id, 'business')?.cost).toBe(positive * 2);
      expect(adPreview(n, 'attack', b.id, 'independent')?.cost).toBe(positive * 4);
    }
  });
  it('positive ads cost $12,500 for Mayor, gain steady support and recognition with zero backlash', () => {
    const c = fixture(), snapshot = structuredClone(c), req = adRequest(c, 'positive', 'standard', 'all');
    const n = success(purchaseCampaignAd(c, req));
    expect(n.campaign?.funds).toBe(987500); expect(n.campaign?.spent).toBe(12500);
    expect(n.campaign?.support).toBe(4); expect(n.campaign?.nameRecognition).toBe(4);
    expect(n.campaign?.lastAd?.backlash).toBe(false); expect(n.campaign?.lastAd?.response).toBe(false);
    expect(n.money).toBe(c.money); expect(n.ledger).toEqual(c.ledger); expect(n.actions).toBe(c.actions - 15);
    expect(c).toEqual(snapshot); expect(purchaseCampaignAd(c, req)).toEqual(purchaseCampaignAd(c, req));
  });
  it('contrast converts only the chosen bloc with higher support and a small response risk', () => {
    const c = fixture();
    const n = success(purchaseCampaignAd(c, adRequest(c, 'contrast', 'standard', 'seniors', c.campaign?.opponents[0]?.name)));
    expect(n.campaign?.support).toBe(6); expect(n.groups['seniors']).toBe(26.7); expect(n.groups['business']).toBe(c.groups['business']);
    expect(adPreview(c, 'contrast', 'standard', 'seniors')?.responseRisk).toBe(0.12);
  });
  it.each(adBudgets)('attack drops genuine rival polling by $drop points at $label tier', b => {
    const c = fixture(); if (!c.campaign) throw new Error('No campaign');
    const rival = c.campaign.opponents[0]?.name ?? '';
    const before = takePoll(c, c.campaign, c.date).shares[rival] ?? 0;
    const n = success(purchaseCampaignAd(c, adRequest(c, 'attack', b.id, 'independent', rival)));
    if (!n.campaign) throw new Error('No campaign');
    const poll = takePoll(n, n.campaign, n.date);
    expect(before - (poll.shares[rival] ?? 0)).toBe(b.drop);
    expect(poll.shares).toEqual(n.campaign.polls.at(-1)?.shares);
    expect(Object.values(poll.shares).reduce((s, v) => s + v, 0)).toBe(100);
    expect(scores(n, n.campaign)[rival]).toBeLessThan(scores(c, c.campaign)[rival] ?? 0);
    const loaded = parseCareer(JSON.stringify(n)); expect(loaded).toEqual(n);
    expect(campaignTurn(n, n.date, '2027-04-01').career.campaign?.adScoreOffsets).toEqual(n.campaign.adScoreOffsets);
  });
  it('higher Approval/Integrity reduces backlash and a backlash loses Independent voters', () => {
    const c = fixture();
    expect(adTrust({ ...c, reputation: 100 }).backlashRisk).toBeLessThan(adTrust({ ...c, reputation: 0 }).backlashRisk);
    let checked = false;
    for (let i = 0; i < 50; i++) {
      const low = { ...c, character: { ...c.character, name: `Dirty ${i}` }, reputation: 0, approval: { overall: 10, party: 20, independent: 50, groups: {}, history: [], actionTurn: '', actionUses: {}, driftTurn: '' } };
      const n = success(purchaseCampaignAd(low, adRequest(low, 'attack', 'standard', 'independent', c.campaign?.opponents[0]?.name)));
      if (!n.campaign?.lastAd?.backlash) continue;
      expect(n.approval?.independent).toBe(47); expect(n.approval?.overall).toBe(10); expect(n.campaign.independentAdPenalty).toBe(3); checked = true; break;
    } expect(checked).toBe(true);
  });
  it('rejects duplicates after reload, stale turns and new same-turn creative', () => {
    const c = fixture(), req = adRequest(c, 'positive', 'local', 'all');
    const loaded = parseCareer(JSON.stringify(success(purchaseCampaignAd(c, req)))); if (!loaded) throw new Error('Bad save');
    expect(purchaseCampaignAd(loaded, req).ok).toBe(false);
    expect(purchaseCampaignAd(loaded, adRequest(loaded, 'positive', 'saturation', 'all')).ok).toBe(false);
    const next = { ...loaded, date: '2027-04-01', actions: 75 };
    expect(purchaseCampaignAd(next, req).ok).toBe(false);
    expect(purchaseCampaignAd(next, adRequest(next, 'positive', 'local', 'all')).ok).toBe(true);
  });
  it('rejects unaffordable and invalid audience/rival choices without mutation', () => {
    const c = fixture(); if (!c.campaign) throw new Error('No campaign');
    const poor = { ...c, campaign: { ...c.campaign, funds: 12499 } }, before = structuredClone(poor);
    expect(purchaseCampaignAd(poor, adRequest(poor, 'positive', 'standard', 'all')).ok).toBe(false); expect(poor).toEqual(before);
    expect(purchaseCampaignAd(c, adRequest(c, 'contrast', 'standard', 'fake', c.campaign.opponents[0]?.name)).ok).toBe(false);
    expect(purchaseCampaignAd(c, adRequest(c, 'attack', 'standard', 'independent', 'fake')).ok).toBe(false);
  });
  it('funds rival counter-ads only when affordable and debits exactly one counter-ad', () => {
    const base = fixture(); if (!base.campaign) throw new Error('No campaign'); let checked = false;
    for (let i = 0; i < 100; i++) {
      const c = { ...base, character: { ...base.character, name: `Contrast ${i}` }, campaign: { ...base.campaign, opponents: base.campaign.opponents.map(x => ({ ...x, funds: 12500, spent: 0 })) } };
      const rival = c.campaign.opponents[0]?.name ?? '';
      const n = success(purchaseCampaignAd(c, adRequest(c, 'contrast', 'local', 'business', rival)));
      if (!n.campaign?.lastAd?.response) continue;
      expect(n.campaign.opponents[0]?.funds).toBe(0); expect(n.campaign.opponents[0]?.spent).toBe(12500);
      const poor = { ...c, campaign: { ...c.campaign, opponents: c.campaign.opponents.map(x => ({ ...x, funds: 12499 })) } };
      expect(success(purchaseCampaignAd(poor, adRequest(poor, 'contrast', 'local', 'business', rival))).campaign?.lastAd?.response).toBe(false);
      checked = true; break;
    } expect(checked).toBe(true);
  });
});
describe('Ads without endorsement', () => {
  it('a positive ad yields only 25% support with no group endorsement', () => {
    const c = fixture(), bare = { ...c, campaign: c.campaign ? { ...c.campaign, endorsements: [] } : null };
    expect(adPreview(bare, 'positive', 'standard', 'all')?.support).toBe(1);
  });
});
