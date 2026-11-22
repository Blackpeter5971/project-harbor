import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCareer, defaultDraft, parseCareer, backgrounds } from '@/lib/game/career';
import { ensureLife } from '@/lib/game/life';
import { archetypes, normalizeSocial, startingSocial, contactFrom, archetypeById, interactWithContact, beginDating, proposeMarriage, holdWedding, familyCosts, familyStressRelief, meetNewPeople, type SocialState } from '@/lib/game/relationships';
import type { Career } from '@/lib/game/career';

const make = (background = defaultDraft.background) => createCareer({ ...defaultDraft, name: 'Social', background });

describe('social circle save safety', () => {
  it('older saves without social state load with empty defaults and keep money and political contacts', () => {
    const c = { ...make(), money: 1234, contacts: 7, relationships: 3 };
    const { social, ...oldLife } = c.life!;
    const loaded = parseCareer(JSON.stringify({ ...c, life: oldLife }))!;
    expect(loaded.life!.social).toEqual({ contacts: [], maritalStatus: 'single', partner: null, dependents: [] });
    expect(loaded.money).toBe(1234);
    expect(loaded.contacts).toBe(7);
    expect(loaded.relationships).toBe(3);
  });
  it('saves with no life get default social state', () => {
    expect(ensureLife({ ...make(), life: null }).life!.social!.maritalStatus).toBe('single');
  });
  it('drops malformed entries and fixes incoherent marital status', () => {
    const s = normalizeSocial({ contacts: [{ id: 'x', archetypeId: 'alien' }, { id: 'y', archetypeId: 'mentor', affinity: 500 }], maritalStatus: 'married', partner: null, dependents: [{ id: 'd', name: 'Ava', age: -2, supportCost: 300 }] });
    expect(s.contacts).toHaveLength(1);
    expect(s.contacts[0]!.affinity).toBe(100);
    expect(s.maritalStatus).toBe('single');
    expect(s.dependents[0]).toEqual({ id: 'd', name: 'Ava', age: 0, supportCost: 300 });
  });
});

describe('archetype catalog', () => {
  it('has 6–8 archetypes with portraits on disk, traits and valid affinity', () => {
    expect(archetypes.length).toBeGreaterThanOrEqual(6);
    expect(archetypes.length).toBeLessThanOrEqual(8);
    for (const a of archetypes) {
      expect(a.portrait.startsWith('/images/characters/')).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', a.portrait))).toBe(true);
      expect(a.traits.length).toBeGreaterThan(0);
      expect(a.baseAffinity).toBeGreaterThanOrEqual(0);
      expect(a.baseAffinity).toBeLessThanOrEqual(100);
    }
    for (const cat of ['friend', 'mentor', 'professional', 'family', 'romantic']) expect(archetypes.some(a => a.category === cat)).toBe(true);
  });
});

describe('starting circles', () => {
  it('dynasty and family backgrounds start with family; everyone has a confidant', () => {
    expect(startingSocial('Political Dynasty').contacts.map(c => c.archetypeId)).toEqual(expect.arrayContaining(['parents', 'sibling', 'mentor']));
    expect(startingSocial('Working-Class Family').contacts.map(c => c.archetypeId)).toEqual(expect.arrayContaining(['parents', 'sibling']));
    for (const b of backgrounds.map(x => x.id)) {
      const c = make(b);
      expect(c.life!.social!.contacts.some(x => x.archetypeId === 'confidant')).toBe(true);
      expect(parseCareer(JSON.stringify(c))!.life!.social).toEqual(c.life!.social);
    }
  });
});

const rich = (money = 50_000): Career => ({ ...make('Nobody'), money, warChest: 4321, treasury: null, campaign: { funds: 777 } as unknown as Career['campaign'] });
const social = (c: Career, s: Partial<SocialState>): Career => ({ ...c, life: { ...c.life!, social: { ...c.life!.social!, ...s } } });
const ok = (r: ReturnType<typeof interactWithContact>) => { if (!r.ok) throw new Error(r.message); return r.career; };
const julian = (affinity: number) => contactFrom(archetypeById('romantic')!, { affinity });
const settled = (c: Career): Career => ({ ...c, housing: { ...c.housing!, currentPropertyId: 'apartment', status: 'renting', monthlyRent: 450, arrears: 0, missedQuarters: 0 } });

describe('social interactions', () => {
  it('coffee costs $50 and 1 action, +5 affinity, -5 stress', () => {
    const c = rich(1000);
    const n = ok(interactWithContact(c, 'contact-confidant', 'coffee'));
    expect(n.money).toBe(950);
    expect(n.actions).toBe(c.actions - 15);
    expect(n.life!.social!.contacts.find(x => x.id === 'contact-confidant')!.affinity).toBe(65);
    expect(n.life!.stress).toBe(c.life!.stress - 5);
    expect(n.ledger[0]).toEqual({ month: c.date, label: 'Social · Coffee Chat with Daniel Reyes', amount: -50 });
  });
  it('dinner costs $250 and 1 action, +12 affinity, -15 stress; gift costs $500, no action, +20 affinity', () => {
    const c = social({ ...rich(1000), life: { ...rich().life!, stress: 40 } }, { contacts: [julian(30), contactFrom(archetypeById('mentor')!)] });
    const d = ok(interactWithContact(c, 'contact-romantic', 'dinner'));
    expect(d.money).toBe(750);
    expect(d.actions).toBe(c.actions - 15);
    expect(d.life!.stress).toBe(25);
    expect(d.life!.social!.contacts[0]!.affinity).toBe(42);
    expect(d.ledger[0]!.label).toBe('Social · Romantic Date with Julian Hart');
    const g = ok(interactWithContact(d, 'contact-mentor', 'gift'));
    expect(g.money).toBe(250);
    expect(g.actions).toBe(d.actions);
    expect(g.life!.social!.contacts[1]!.affinity).toBe(65);
  });
  it('affinity is clamped at 100 and each person can be seen once per turn', () => {
    const c = social(rich(), { contacts: [julian(95)] });
    const n = ok(interactWithContact(c, 'contact-romantic', 'gift'));
    expect(n.life!.social!.contacts[0]!.affinity).toBe(100);
    const again = interactWithContact(n, 'contact-romantic', 'coffee');
    expect(again.ok).toBe(false);
    expect(ok(interactWithContact({ ...n, date: '2026-04-01' }, 'contact-romantic', 'coffee')).money).toBe(n.money - 50);
  });
  it('unaffordable or out-of-actions requests change nothing', () => {
    const poor = rich(400);
    const r = interactWithContact(poor, 'contact-confidant', 'gift');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('You need $100 more in personal cash.');
    expect(interactWithContact({ ...rich(), actions: 0 }, 'contact-confidant', 'dinner').ok).toBe(false);
    expect(ok(interactWithContact({ ...rich(), actions: 0 }, 'contact-confidant', 'gift')).money).toBe(49_500);
  });
  it('meeting new people costs $100 and an action and adds the romantic interest first', () => {
    const n = ok(meetNewPeople(rich(1000)));
    expect(n.money).toBe(900);
    expect(n.life!.social!.contacts.some(x => x.archetypeId === 'romantic')).toBe(true);
  });
});

describe('romance and marriage', () => {
  it('dating needs 75% affinity', () => {
    expect(beginDating(social(rich(), { contacts: [julian(74)] }), 'contact-romantic').ok).toBe(false);
    const n = ok(beginDating(social(rich(), { contacts: [julian(75)] }), 'contact-romantic'));
    expect(n.life!.social!.maritalStatus).toBe('dating');
    expect(n.life!.social!.partner!.name).toBe('Julian Hart');
    expect(n.life!.social!.contacts.some(x => x.id === 'contact-romantic')).toBe(false);
    expect(n.money).toBe(50_000);
  });
  it('proposal needs 90% affinity, stable housing and a turn of dating', () => {
    const dating = ok(beginDating(social(rich(), { contacts: [julian(92)] }), 'contact-romantic'));
    expect(proposeMarriage(settled(dating)).ok).toBe(false); // same turn
    const later = { ...dating, date: '2026-04-01' };
    expect(proposeMarriage(later).ok).toBe(false); // shared room is not stable housing
    expect(proposeMarriage({ ...settled(later), housing: { ...settled(later).housing!, arrears: 100 } }).ok).toBe(false);
    const low = social(settled(later), { partner: { ...later.life!.social!.partner!, affinity: 89 } });
    expect(proposeMarriage(low).ok).toBe(false);
    expect(ok(proposeMarriage(settled(later))).life!.social!.maritalStatus).toBe('engaged');
  });
  it('wedding charges the chosen budget, sets married, binds the partner and lifts reputation slightly', () => {
    const dating = ok(beginDating(social(rich(30_000), { contacts: [julian(92)] }), 'contact-romantic'));
    const engaged = ok(proposeMarriage(settled({ ...dating, date: '2026-04-01' })));
    expect(holdWedding(engaged, 1999).ok).toBe(false);
    expect(holdWedding(engaged, 25_001).ok).toBe(false);
    expect(holdWedding({ ...engaged, money: 9_999 }, 10_000).ok).toBe(false);
    const wed = ok(holdWedding(engaged, 10_000));
    expect(wed.money).toBe(20_000);
    expect(wed.reputation).toBe(engaged.reputation + 2);
    expect(wed.life!.social!.maritalStatus).toBe('married');
    expect(wed.life!.social!.partner).toMatchObject({ name: 'Julian Hart', weddingDate: '2026-04-01' });
    expect(wed.ledger[0]).toEqual({ month: '2026-04-01', label: 'Wedding · Julian Hart', amount: -10_000 });
    expect(ok(holdWedding(engaged, 2_000)).reputation).toBe(engaged.reputation + 1);
    expect(ok(holdWedding(engaged, 25_000)).reputation).toBe(engaged.reputation + 3);
    expect(holdWedding(dating, 5_000).ok).toBe(false);
    expect(parseCareer(JSON.stringify({ ...wed, campaign: make().campaign }))!.life!.social).toEqual(wed.life!.social);
  });
});

describe('family costs', () => {
  const partner = { ...julian(80), weddingDate: '2026-01-01', sharedMonthlyExpenses: 0 };
  const kids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, name: `Kid ${i}`, age: 5, supportCost: 0 }));
  it('$500 per quarter when married plus $600 per child', () => {
    expect(familyCosts({ contacts: [], maritalStatus: 'single', partner: null, dependents: [] }).total).toBe(0);
    expect(familyCosts({ contacts: [], maritalStatus: 'dating', partner, dependents: [] }).total).toBe(0);
    expect(familyCosts({ contacts: [], maritalStatus: 'married', partner, dependents: [] })).toEqual({ household: 500, children: 0, total: 500 });
    expect(familyCosts({ contacts: [], maritalStatus: 'married', partner, dependents: kids(2) })).toEqual({ household: 500, children: 1200, total: 1700 });
    expect(familyCosts({ contacts: [], maritalStatus: 'single', partner: null, dependents: kids(3) }).total).toBe(1800);
  });
  it('a happy marriage eases 5 stress per turn', () => {
    expect(familyStressRelief({ contacts: [], maritalStatus: 'married', partner, dependents: [] })).toBe(5);
    expect(familyStressRelief({ contacts: [], maritalStatus: 'married', partner: { ...partner, affinity: 59 }, dependents: [] })).toBe(0);
    expect(familyStressRelief({ contacts: [], maritalStatus: 'dating', partner, dependents: [] })).toBe(0);
  });
});

describe('personal funds only', () => {
  it('social spending never touches campaign funds or the treasury', () => {
    let c = social(rich(), { contacts: [julian(92)] });
    const camp = c.campaign;
    c = ok(interactWithContact(c, 'contact-romantic', 'gift'));
    c = ok(beginDating(c, 'contact-romantic'));
    c = ok(proposeMarriage(settled({ ...c, date: '2026-04-01' })));
    c = ok(holdWedding(c, 25_000));
    c = ok(interactWithContact(c, c.life!.social!.partner!.id, 'dinner'));
    expect(c.money).toBe(50_000 - 500 - 25_000 - 250);
    expect(c.campaign).toBe(camp);
    expect(c.warChest).toBe(4321);
    expect(c.treasury).toBeNull();
  });
});

import { collectFamily } from '@/lib/game/family';
import { advanceTurn } from '@/lib/game/gameplay';
import { groupRel } from '@/lib/game/campaign';

describe('quarterly family processing (5D)', () => {
  const wedPartner = (affinity: number) => ({ ...julian(affinity), weddingDate: '2025-01-01', sharedMonthlyExpenses: 0 });
  const kid = { id: 'k1', name: 'Ava', age: 6, supportCost: 0 };
  const married = (money: number, affinity = 70, over: Partial<SocialState> = {}) => social({ ...rich(money), campaign: null }, { maritalStatus: 'married', partner: wedPartner(affinity), dependents: [kid], ...over });

  it('bills 3 months of family support once per turn key and logs it', () => {
    const c = married(5000);
    const r = collectFamily(c, '2026-01-01');
    expect(r.career.money).toBe(5000 - 1100);
    expect(r.career.ledger[0]).toEqual({ month: '2026-01-01', label: 'Family support (3 months)', amount: -1100 });
    expect(r.notices).toContain('Family: $1,100 paid for household and children\'s support.');
    expect(collectFamily(r.career, '2026-01-01').career).toBe(r.career);
    const reloaded = parseCareer(JSON.stringify({ ...r.career, campaign: null }))!;
    expect(collectFamily(reloaded, '2026-01-01').career).toBe(reloaded);
  });
  it('unpaid support adds 15 stress and drops partner affinity by 10, without spending', () => {
    const c = married(100);
    const r = collectFamily(c, '2026-01-01').career;
    expect(r.money).toBe(100);
    expect(r.life!.stress).toBe(Math.min(100, c.life!.stress + 15));
    expect(r.life!.social!.partner!.affinity).toBe(60);
  });
  it('neglect drifts affinity by 2 only after 2 quarters without contact', () => {
    const c = social({ ...rich(), campaign: null }, { contacts: [julian(50)] });
    const q1 = collectFamily(c, '2026-01-01').career;
    expect(q1.life!.social!.contacts[0]!.affinity).toBe(50);
    const q2 = collectFamily({ ...q1, date: '2026-04-01' }, '2026-04-01').career;
    expect(q2.life!.social!.contacts[0]!.affinity).toBe(48);
    const seen = ok(interactWithContact({ ...q2, date: '2026-07-01' }, 'contact-romantic', 'coffee'));
    const q3 = collectFamily(seen, '2026-07-01').career;
    expect(q3.life!.social!.contacts[0]!.affinity).toBe(53);
    expect(q3.life!.social!.contacts[0]!.neglect).toBeUndefined();
  });
  it('partner affinity above 80 eases stress by 8; a happy marriage by 5', () => {
    const hi = married(10_000, 85);
    expect(collectFamily(hi, '2026-01-01').career.life!.stress).toBe(Math.max(0, hi.life!.stress - 8));
    const ok60 = married(10_000, 65);
    expect(collectFamily(ok60, '2026-01-01').career.life!.stress).toBe(Math.max(0, ok60.life!.stress - 5));
  });
  it('a stable marriage gives +2 to suburban and religious voters once', () => {
    const c = married(10_000, 70);
    const r = collectFamily(c, '2026-01-01').career;
    expect(r.groups['suburban']).toBe(groupRel(c, 'suburban') + 2);
    expect(r.groups['religious']).toBe(groupRel(c, 'religious') + 2);
    expect(r.life!.social!.familyImage).toBe('stable');
    const again = collectFamily({ ...r, date: '2026-04-01' }, '2026-04-01').career;
    expect(again.groups['suburban']).toBe(r.groups['suburban']);
    expect(again.groups['religious']).toBe(r.groups['religious']);
  });
  it('family strain becomes campaign fodder once', () => {
    const camp = { support: 10, headlines: [] as string[] } as unknown as Career['campaign'];
    const c = { ...married(100), campaign: camp };
    const r = collectFamily(c, '2026-01-01');
    expect(r.career.campaign!.support).toBe(9);
    expect(r.career.campaign!.headlines[0]).toMatch(/troubled home life/);
    expect(r.career.warChest).toBe(4321);
    expect(r.career.treasury).toBeNull();
    const again = collectFamily({ ...r.career, date: '2026-04-01' }, '2026-04-01');
    expect(again.career.campaign!.support).toBe(9);
  });
  it('advanceTurn bills family support once and reports it; reload cannot replay', () => {
    const c = married(50_000);
    const r = advanceTurn(c).career;
    expect(r.ledger.filter(e => e.label === 'Family support (3 months)')).toHaveLength(1);
    expect(r.report!.lines).toContain('Family: $1,100 paid for household and children\'s support.');
    expect(collectFamily(r, c.date).career).toBe(r);
  });
});

import { normalizeSocial as normSocialForPortrait } from '@/lib/game/relationships';
import { draftSchema as draftSchemaForSex, defaultDraft as defaultDraftForSex } from '@/lib/game/career';

describe('partner portraits and player gender', () => {
  it('normalizeSocial keeps a custom partner portrait instead of the archetype default', () => {
    const raw = { contacts: [], maritalStatus: 'married', dependents: [], partner: { id: 'contact-p-maya-chen', archetypeId: 'romantic', name: 'Maya Chen', role: 'Architect', affinity: 90, status: 'close', portrait: '/custom/maya.jpg', weddingDate: '2030-01-01', sharedMonthlyExpenses: 0 } };
    const once = normSocialForPortrait(raw);
    expect(once.partner?.portrait).toBe('/custom/maya.jpg');
    expect(normSocialForPortrait(JSON.parse(JSON.stringify(once))).partner?.portrait).toBe('/custom/maya.jpg');
  });
  it('character sex accepts only Male or Female', () => {
    expect(draftSchemaForSex.safeParse({ ...defaultDraftForSex, name: 'A', sex: 'Custom' }).success).toBe(false);
    expect(draftSchemaForSex.safeParse({ ...defaultDraftForSex, name: 'A', sex: 'Male' }).success).toBe(true);
    expect(draftSchemaForSex.safeParse({ ...defaultDraftForSex, name: 'A', sex: 'Female' }).success).toBe(true);
  });
});

import { createCareer as createForLegacySex, parseCareer as parseForLegacySex } from '@/lib/game/career';
describe('legacy Custom saves', () => {
  it('load as Male instead of being rejected', () => {
    const c = createForLegacySex({ ...defaultDraftForSex, name: 'Old' }, () => 0);
    const json = JSON.stringify({ ...c, character: { ...c.character, sex: 'Custom' } });
    expect(parseForLegacySex(json)?.character.sex).toBe('Male');
  });
});
