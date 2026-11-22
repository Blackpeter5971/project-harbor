import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { buildEncounter, rollEncounter, ENCOUNTER_RULES } from '@/lib/game/encounters';
import { advanceTurn, continueAfterNewspaper, continueTurnReport, resolveEvent, getEvent } from '@/lib/game/gameplay';
import { socialOf, contactFrom, archetypes } from '@/lib/game/relationships';
import { supportGroupsOf } from '@/lib/game/support-groups';
import { launchCampaign } from '@/lib/game/campaign';
import { crisisCareer } from './crisis-fixture';

const base = () => createCareer({ ...defaultDraft, name: 'Encounter Player', party: 'Democrat' });
const campaign = () => {
  const r = launchCampaign({ ...base(), date: '2027-07-01', money: 100000, reputation: 40, experience: 100, skills: { communication: 30, leadership: 30, knowledge: 30 } }, 'council', 'Together', 'grassroots');
  if (!r.ok) throw new Error(r.message); return r.career;
};
const romance = () => {
  const c = campaign(), a = archetypes.find(p => p.id === 'romantic');
  if (!a || !c.life) throw new Error('Missing life fixture');
  const p = { ...contactFrom(a), affinity: 50, weddingDate: '2026-01-01', sharedMonthlyExpenses: 0, datingSince: '2026-01-01' };
  return { ...c, life: { ...c.life, stress: 40, social: { ...socialOf(c), maritalStatus: 'married' as const, partner: p } } };
};
function queue(c: Career, kind: Parameters<typeof buildEncounter>[1], context?: string) {
  const e = buildEncounter(c, kind, context); if (!e) throw new Error(`Missing ${kind}`);
  return { ...c, report: null, newspaperPending: false, pendingEvent: e.id, pendingEncounter: e, eventEncounter: { ...e, date: c.date, presented: true as const } };
}
function resolve(c: Career, id: string) { const r = resolveEvent(c, id); if (!r.ok) throw new Error(r.message); return r.career; }
function reload(c: Career) { const next = parseCareer(JSON.stringify(c)); if (!next) throw new Error('Save failed'); return next; }

describe('Post-turn moral encounters', () => {
  it('defines the personal cost and scandal risk rules', () => {
    expect(ENCOUNTER_RULES.consolation).toBe(500); expect(ENCOUNTER_RULES.dinner).toBe(250); expect(ENCOUNTER_RULES.nepotismRisk).toBe(0.35);
  });
  it.each(['console', 'refuse', 'appoint'])('resolves family nepotism: %s without mixing accounts', id => {
    const c = queue({ ...crisisCareer('president'), character: { ...base().character }, campaign: null }, 'nepotism');
    const before = socialOf(c).contacts.find(p => p.archetypeId === 'sibling');
    const n = resolve(reload(c), id), p = socialOf(n).contacts.find(p => p.id === before?.id);
    expect(p?.affinity).toBe((before?.affinity ?? 0) + (id === 'appoint' ? 12 : id === 'console' ? 6 : -8));
    expect(n.money).toBe(c.money - (id === 'console' ? 500 : 0));
    expect(n.treasury).toEqual(c.treasury);
    if (id === 'appoint') { expect(n.federalGovernment?.nominations[0]?.name).toBe(before?.name); expect(n.federalGovernment?.nominations[0]?.status).toBe('nominated'); expect(n.actions).toBe(60); }
    if (id === 'refuse') expect(n.reputation).toBe(c.reputation + 1);
    expect(resolveEvent(reload(n), id).ok).toBe(false);
  });
  it.each(['dirty', 'expose', 'lawful'])('resolves party corruption: %s through the illicit campaign ledger', id => {
    const c = queue(campaign(), 'corruption'), n = resolve(c, id);
    expect(n.money).toBe(c.money);
    expect(n.campaign?.funds).toBe((c.campaign?.funds ?? 0) + (id === 'dirty' ? c.pendingEncounter?.cost ?? 0 : 0));
    expect(n.reputation).toBe(c.reputation + (id === 'dirty' ? -3 : id === 'expose' ? 2 : 0.5));
    if (id === 'dirty') { expect(n.corruption?.txns[0]?.kind).toBe('dark_money'); expect(n.corruption?.exposure).toBeGreaterThan(0); expect(n.campaign?.txns[0]?.amount).toBe(c.pendingEncounter?.cost); }
    else expect(supportGroupsOf(n).partyStanding).toBe(supportGroupsOf(c).partyStanding + (id === 'expose' ? -6 : 1));
  });
  it.each(['dinner', 'talk', 'neglect'])('resolves romance: %s with real stress and affinity', id => {
    const c = queue(romance(), 'romance'), n = resolve(c, id);
    expect(n.money).toBe(c.money - (id === 'dinner' ? 250 : 0));
    expect(n.life?.stress).toBe(id === 'dinner' ? 25 : id === 'talk' ? 35 : 45);
    expect(socialOf(n).partner?.affinity).toBe(id === 'dinner' ? 62 : id === 'talk' ? 55 : 40);
    expect(n.campaign?.funds).toBe(c.campaign?.funds);
    if (id === 'dinner') expect(socialOf(n).familyImage).toBe('stable');
  });
  it.each(['challenge', 'truce', 'retreat'])('resolves rival face-off: %s and updates the current poll', id => {
    const c = queue(campaign(), 'rival'), n = resolve(c, id);
    expect(n.campaign?.momentum).toBe((c.campaign?.momentum ?? 0) + (id === 'challenge' ? 2 : id === 'retreat' ? -1 : 0));
    expect(n.campaign?.txns).toEqual(c.campaign?.txns);
    expect(n.campaign?.polls.at(-1)?.date).toBe(c.date);
    expect(Object.values(n.campaign?.polls.at(-1)?.shares ?? {}).reduce((s, v) => s + v, 0)).toBe(100);
  });
  it('prioritizes fresh crises over dynamic encounters and does not fund or resolve them', () => {
    const c = crisisCareer(), e = rollEncounter(c, { ...c, crises: [] }, 0);
    expect(e?.scene?.archetype).toBe('crisis');
    const n = resolve(queue(c, 'crisis', c.crises[0]?.id), 'listen');
    expect(n.crises).toEqual(c.crises); expect(n.treasury).toEqual(c.treasury);
    expect(rollEncounter(c, c, 1)).toBeNull();
  });
  it.each(['reflect', 'learn', 'push'])('handles a fresh election milestone once: %s', id => {
    const c = campaign();
    const election: Career['elections'][number] = { office: 'council', title: 'City Council', jurisdiction: 'California', date: c.date, stage: 'general', won: true, rows: [], ec: null, statesWon: [], raised: 0, spent: 0, effects: [] };
    const input = { ...c, elections: [election] };
    expect(rollEncounter(input, c, 1)?.scene?.archetype).toBe('milestone');
    const n = resolve(queue(input, 'milestone', `council|${c.date}|general`), id);
    expect(n.elections).toEqual(input.elections);
    expect(n.life?.stress).toBe(Math.max(0, (c.life?.stress ?? 0) + (id === 'reflect' ? -5 : id === 'learn' ? -2 : 5)));
    expect(n.eventHistory).toHaveLength(1);
  });
  it('rejects insufficient cash, stale campaigns, invalid responses and pre-newspaper resolution', () => {
    const c = queue(romance(), 'romance');
    expect(resolveEvent({ ...c, money: 0 }, 'dinner').ok).toBe(false);
    expect(resolveEvent(c, 'invalid').ok).toBe(false);
    expect(resolveEvent({ ...c, newspaperPending: true }, 'talk').ok).toBe(false);
    const rival = queue(campaign(), 'rival'); expect(resolveEvent({ ...rival, campaign: null }, 'challenge').ok).toBe(false);
  });
  it('keeps saved candidates stable through report, newspaper, and reload', () => {
    const c = queue(romance(), 'romance');
    const report = { ...c, eventEncounter: null, newspaperPending: true, report: { period: 'Jan – Mar', lines: [] } };
    expect(advanceTurn(report).career).toEqual(report);
    const paper = continueTurnReport(reload(report)); expect(paper.eventEncounter).toBeNull();
    const encounter = continueAfterNewspaper(reload(paper)); expect(getEvent(encounter)).toEqual(encounter.eventEncounter);
    const next = resolve(reload(encounter), 'dinner'); expect(next.eventHistory).toHaveLength(1);
    expect(continueAfterNewspaper(reload(next)).money).toBe(next.money);
    expect(next.ledger.filter(e => e.label.startsWith('Encounter'))).toHaveLength(1);
  });
  it('parses old saves and keeps Story Mode free of sandbox encounters', () => {
    const old = JSON.parse(JSON.stringify(base())); delete old.pendingEncounter;
    expect(parseCareer(JSON.stringify(old))?.pendingEncounter).toBeUndefined();
    expect(rollEncounter({ ...campaign(), mode: 'story' }, base(), 0)).toBeNull();
  });
});