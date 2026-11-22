import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { OLD_AGE, mortalityTurn, naturalMortalityRisk, securityRisk } from '@/lib/game/mortality';
import { carryArchive, legacyMetrics, legacyOf, mergeArchives, recordLife } from '@/lib/game/legacy';
import { archiveSchema, type Archive } from '@/lib/game/legacy-schema';
import { adultHeirs, passTorch, retireCareer } from '@/lib/game/dynasty';
import { availableElections, launchCampaign } from '@/lib/game/campaign';
import { interactWithContact, socialOf } from '@/lib/game/relationships';
import { startBusiness } from '@/lib/game/business';

const START = '2030-01-01', END = '2030-04-01';
const SAFE = { natural: 1, security: 1 };
const office = (id: string) => ({ id, title: id, jurisdiction: 'United States', since: '2029-01-01', party: 'Independent' as const, elected: '2028-11-01', termEnd: '2033-01-01', margin: 5 });
const base = (over: Partial<Career> = {}): Career => {
  const c = createCareer({ ...defaultDraft, name: 'Ada Stone' }, () => 0.5);
  return { ...c, date: START, age: 45, health: 70, money: 200_000, ...over };
};
const withLife = (c: Career, life: Partial<NonNullable<Career['life']>>): Career => ({ ...c, life: { ...c.life!, ...life } });
const medical = (m: { lastCheckup?: string; chronic?: 'cardiac' | null; emergencies?: { date: string; name: string; untreated: boolean }[] }) => ({ lastCheckup: '', chronic: null, emergencies: [], ...m });
const ok = (r: ReturnType<typeof retireCareer>) => { if (!r.ok) throw new Error(r.message); return r.career; };

describe('natural mortality', () => {
  it('has no natural risk before 70 and rises with age after', () => {
    expect(naturalMortalityRisk(base({ age: OLD_AGE - 1 }))).toBe(0);
    const r70 = naturalMortalityRisk(base({ age: 70 })), r80 = naturalMortalityRisk(base({ age: 80 })), r90 = naturalMortalityRisk(base({ age: 90 }));
    expect(r70).toBeGreaterThan(0);
    expect(r80).toBeGreaterThan(r70);
    expect(r90).toBeGreaterThan(r80);
    expect(naturalMortalityRisk(base({ age: 120, health: 0 }))).toBeLessThanOrEqual(0.65);
  });
  it('recent checkups reduce risk and chronic illness increases it', () => {
    const c = base({ age: 78 });
    const plain = naturalMortalityRisk(c);
    expect(naturalMortalityRisk(withLife(c, { medical: medical({ lastCheckup: START }) }))).toBeCloseTo(plain * 0.65, 10);
    expect(naturalMortalityRisk(withLife(c, { medical: medical({ chronic: 'cardiac' }) }))).toBeCloseTo(plain * 1.6, 10);
  });
});

describe('critical health failures', () => {
  it('dies at 0% health', () => {
    const r = mortalityTurn(base({ health: 0 }), START, END, SAFE);
    expect(legacyOf(r.career).death?.cause).toMatch(/Critical health failure/);
  });
  it('names an untreated medical emergency', () => {
    const c = withLife(base({ health: 0 }), { medical: medical({ emergencies: [{ date: START, name: 'Heart Attack', untreated: true }] }) });
    expect(legacyOf(mortalityTurn(c, START, END, SAFE).career).death?.cause).toBe('Critical health failure after untreated heart attack');
  });
  it('sustained executive burnout costs health and can be fatal', () => {
    const c = withLife(base({ health: 10, office: office('president'), publicOffice: true, legacy: { burnoutQuarters: 1 } as Career['legacy'] }), { stress: 100 });
    const r = mortalityTurn(c, START, END, SAFE);
    expect(legacyOf(r.career).death?.cause).toMatch(/sustained executive burnout/);
    const survivor = mortalityTurn({ ...c, health: 60 }, START, END, SAFE);
    expect(survivor.career.health).toBe(50);
    expect(legacyOf(survivor.career).death).toBeNull();
  });
});

describe('executive security', () => {
  const president = (over: Partial<Career> = {}) => base({ office: office('president'), publicOffice: true, ...over });
  const unrest = { treasury: { tenure: 't', finance: { mood: { score: -5 }, economy: { business: 50, employment: 50, household: 50, happiness: 50 }, events: [] } } } as unknown as Partial<Career>;
  it('ordinary citizens carry no assassination risk; extreme unrest and enemies raise it', () => {
    expect(securityRisk(base()).risk).toBe(0);
    const calm = securityRisk(president()).risk;
    expect(calm).toBeGreaterThan(0);
    expect(securityRisk(president(unrest)).risk).toBeGreaterThan(calm);
    const enemies = { network: { figures: [{ score: -80, influence: 80 }, { score: -90, influence: 90 }] } } as unknown as Partial<Career>;
    const threatened = securityRisk(president(enemies));
    expect(threatened.enemies).toBe(2);
    expect(threatened.risk).toBeGreaterThan(calm);
    expect(securityRisk(president(unrest)).risk).toBeLessThanOrEqual(0.05);
  });
  it('bodyguards, armored transport and briefings dampen risk', () => {
    const c = president(unrest), raw = securityRisk(c).risk;
    const l = legacyOf(c);
    expect(securityRisk({ ...c, legacy: { ...l, security: { ...l.security, bodyguardUntil: '2030-04-01' } } }).risk).toBeCloseTo(raw * 0.45, 10);
    expect(securityRisk({ ...c, legacy: { ...l, security: { ...l.security, reviewedPeriod: START } } }).risk).toBeCloseTo(raw * 0.6, 10);
    const armored = withLife(c, { vehicles: [{ id: 'v1', modelId: 'armored_sedan', purchaseDate: START, condition: 90, monthlyUpkeep: 0 }], activeVehicleId: 'v1' });
    expect(securityRisk(armored).risk).toBeCloseTo(raw * 0.6, 10);
    expect(securityRisk({ ...armored, life: { ...armored.life!, maintenanceOverdue: true } }).risk).toBeCloseTo(raw, 10);
  });
  it('a losing security roll records an assassination', () => {
    const r = mortalityTurn(president(unrest), START, END, { natural: 1, security: 0 });
    expect(legacyOf(r.career).death?.cause).toMatch(/^Assassination following extreme civil unrest/);
    expect(r.career.office).toBeNull();
  });
});

describe('deterministic quarterly checks', () => {
  it('the same quarter always produces the same outcome and cannot be re-rolled', () => {
    const c = base({ age: 95, health: 20 });
    const a = mortalityTurn(c, START, END), b = mortalityTurn(c, START, END);
    expect(legacyOf(a.career).death?.cause ?? null).toBe(legacyOf(b.career).death?.cause ?? null);
    const survived = mortalityTurn(c, START, END, SAFE).career;
    expect(legacyOf(survived).lastPeriod).toBe(START);
    const replay = mortalityTurn(survived, START, END, { natural: 0, security: 0 });
    expect(replay.career).toBe(survived);
    expect(legacyOf(replay.career).death).toBeNull();
  });
});

describe('voluntary retirement', () => {
  it('locks the political record and blocks campaigns but keeps personal life playable', () => {
    const before = base({ office: office('mayor'), publicOffice: true });
    const retired = ok(retireCareer(before));
    expect(retired.office).toBeNull();
    expect(retired.money).toBe(before.money);
    expect(availableElections(retired)).toEqual([]);
    expect(launchCampaign(retired, 'mayor', 'Again', 'grassroots' as never).ok).toBe(false);
    const l = legacyOf(retired);
    const record = l.archive.lives.find(r => r.owner === l.owner && r.kind === 'retirement');
    expect(record?.officeAtEnd).toBe('mayor');
    expect(retireCareer(retired).ok).toBe(false);
    const contact = socialOf(retired).contacts[0]!;
    expect(interactWithContact(retired, contact.id, 'coffee').ok).toBe(true);
    expect(startBusiness(retired, 'local-retail').ok).toBe(true);
    const dead = recordLife({ ...retired, reputation: 0 }, 'death', 'Natural causes');
    expect(legacyOf(dead).archive.lives.find(r => r.kind === 'death')?.metrics).toEqual(record?.metrics);
  });
});

describe('legacy scoring and classifications', () => {
  type Ev = { kind: Archive['evidence'][number]['kind']; outcome: string; title?: string };
  const scored = (evidence: Ev[], opts: { reputation: number; economy: number; happiness: number; approval: number; inOffice?: boolean }) => {
    const c = base({ reputation: opts.reputation, ...(opts.inOffice === false ? {} : { office: office('president'), publicOffice: true }) });
    const owner = legacyOf(c).owner;
    const archive = { ...archiveSchema.parse({}),
      evidence: evidence.map((e, i) => ({ id: `${owner}|e${i}`, owner, date: START, kind: e.kind, title: e.title ?? `Record ${i}`, detail: '', tenure: '', outcome: e.outcome })),
      samples: [{ id: `${owner}|s`, owner, date: START, tenure: '', approval: opts.approval, economy: opts.economy, happiness: opts.happiness }] };
    return legacyMetrics({ ...c, legacy: { ...legacyOf(c), archive } });
  };
  const many = (n: number, kind: Ev['kind'], outcome: string) => Array.from({ length: n }, () => ({ kind, outcome }));
  it('computes governance, integrity and score from recorded outcomes', () => {
    const m = scored([...many(5, 'law', 'enacted'), ...many(3, 'project', 'completed')], { reputation: 50, economy: 70, happiness: 50, approval: 40 });
    expect(m.governance).toBe(70);
    expect(m.economy).toBe(70);
    expect(m.integrity).toBe(50);
    expect(m.score).toBe(620);
    expect(m.classification).toBe('Transformational Leader');
  });
  it('proven scandals make a Corrupt Leader', () => {
    const m = scored([...many(10, 'law', 'enacted'), ...many(2, 'scandal', 'proven')], { reputation: 90, economy: 80, happiness: 80, approval: 80 });
    expect(m.proven).toBe(2);
    expect(m.integrity).toBe(50);
    expect(m.classification).toBe('Corrupt Leader');
  });
  it('a conviction makes a Corrupt Leader', () => {
    const c = base({ office: office('president'), publicOffice: true, legal: { served: [{ caseId: 'case-1' }], cases: [] } as unknown as Career['legal'] });
    expect(legacyMetrics(c).classification).toBe('Corrupt Leader');
  });
  it('rewards broad clean success as a Great Leader', () => {
    const m = scored([...many(10, 'law', 'enacted'), ...many(5, 'project', 'completed')], { reputation: 90, economy: 80, happiness: 80, approval: 80 });
    expect(m.score).toBe(890);
    expect(m.classification).toBe('Great Leader');
  });
  it('one proven scandal is Controversial; no office is Failed; neglected crises lower governance', () => {
    expect(scored([...many(5, 'law', 'enacted'), { kind: 'scandal', outcome: 'proven' }], { reputation: 80, economy: 60, happiness: 60, approval: 60 }).classification).toBe('Controversial Leader');
    expect(scored([...many(5, 'law', 'enacted')], { reputation: 80, economy: 60, happiness: 60, approval: 60, inOffice: false }).classification).toBe('Failed Leader');
    const good = scored(many(3, 'law', 'enacted'), { reputation: 60, economy: 50, happiness: 50, approval: 50 }).governance;
    expect(scored([...many(3, 'law', 'enacted'), ...many(2, 'crisis', 'neglected')], { reputation: 60, economy: 50, happiness: 50, approval: 50 }).governance).toBe(good - 24);
  });
});

describe('cross-generational persistence', () => {
  it('mergeArchives is additive and never erases newer records', () => {
    const life = (id: string) => ({ id, owner: id, name: id, generation: 1, age: 80, date: START, kind: 'death' as const, cause: 'x', officeAtEnd: null, metrics: legacyMetrics(base()), reaction: '', obituary: '' });
    const newer: Archive = { ...archiveSchema.parse({}), lives: [life('a'), life('b')] };
    const older: Archive = { ...archiveSchema.parse({}), lives: [life('a')] };
    expect(mergeArchives(newer, older).lives.map(l => l.id).sort()).toEqual(['a', 'b']);
    expect(mergeArchives(older, newer).lives).toHaveLength(2);
  });
  it('carryArchive keeps ancestral records in a fresh career', () => {
    const parent = ok(retireCareer(base()));
    const fresh = carryArchive(createCareer({ ...defaultDraft, name: 'New Person' }, () => 0.5), parent);
    const parentOwner = legacyOf(parent).owner;
    expect(legacyOf(fresh).archive.lives.some(r => r.owner === parentOwner && r.kind === 'retirement')).toBe(true);
    expect(legacyOf(fresh).owner).not.toBe(parentOwner);
  });
  it('passing the torch keeps the parent life and lists only adult heirs', () => {
    const c = base();
    const social = socialOf(c);
    const family = { ...c, life: { ...c.life!, social: { ...social, dependents: [{ id: 'kid-a', name: 'Eli Stone', age: 20, supportCost: 0 }, { id: 'kid-b', name: 'Mia Stone', age: 17, supportCost: 0 }] } } };
    expect(adultHeirs(family).map(h => h.id)).toEqual(['kid-a']);
    expect(passTorch(family, 'kid-b').ok).toBe(false);
    const r = passTorch(family, 'kid-a');
    if (!r.ok) throw new Error(r.message);
    const parentOwner = legacyOf(family).owner;
    expect(r.career.character.name).toBe('Eli Stone');
    expect(legacyOf(r.career).archive.lives.some(l => l.owner === parentOwner && l.kind === 'handoff')).toBe(true);
  });
});
