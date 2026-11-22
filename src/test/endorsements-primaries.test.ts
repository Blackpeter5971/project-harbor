import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { endorsementFactor, endorsementTurnoutPenalty, endorseWithCapital, genOpponents, independentBallotAccess, independentFundingBar, officeById, seekEndorsement, scores, type Campaign } from '@/lib/game/campaign';

const base = (party: 'Democrat' | 'Independent' = 'Democrat') => createCareer({ ...defaultDraft, name: 'Alex Morgan', party });
const camp = (over: Partial<Campaign> = {}): Campaign => ({ office: 'house', title: 'U.S. House Representative', jurisdiction: 'X', party: 'Democrat', electionDate: '2026-11-01', primaryDate: null, startDate: '2026-01-01', phase: 'general', slogan: 's', strategy: 'grassroots', manager: null, funds: 1_000_000, raised: 0, spent: 0, donors: 0, staff: 0, volunteers: 10, support: 0, momentum: 0, opponents: [], polls: [], txns: [], endorsements: [], headlines: [], attack: null, allegation: null, turnActs: [], lastProcessedEnd: '2026-01-01', ...over } as Campaign);
const withCamp = (c: Career, k: Campaign) => ({ ...c, campaign: k, actions: 75 });

describe('Compulsory endorsements', () => {
  it('cuts rally/ad/town-hall gains to 25% without any endorsement', () => {
    expect(endorsementFactor(camp(), 'Alex Morgan')).toBe(0.25);
    expect(endorsementFactor(camp({ endorsements: [{ group: 'working', candidate: 'Alex Morgan' }] }), 'Alex Morgan')).toBe(1);
  });
  it('applies a 10% general-election deficit with 0 or 1 endorsements, none with 2', () => {
    expect(endorsementTurnoutPenalty(camp(), 'Alex Morgan')).toBe(0.1);
    expect(endorsementTurnoutPenalty(camp({ endorsements: [{ group: 'working', candidate: 'Alex Morgan' }] }), 'Alex Morgan')).toBe(0.1);
    expect(endorsementTurnoutPenalty(camp({ endorsements: [{ group: 'working', candidate: 'Alex Morgan' }, { group: 'youth', candidate: 'Alex Morgan' }] }), 'Alex Morgan')).toBe(0);
    expect(endorsementTurnoutPenalty(camp({ phase: 'primary' }), 'Alex Morgan')).toBe(0);
  });
  it('guarantees an endorsement at 60+ favorability', () => {
    const c = withCamp({ ...base(), groups: { ...base().groups, working: 60 } }, camp());
    const r = seekEndorsement(c, 'working');
    expect(r.ok && r.career.campaign?.endorsements).toContainEqual({ group: 'working', candidate: 'Alex Morgan' });
  });
  it('lets political capital (5 reputation) buy an endorsement at 40+ favorability', () => {
    const c = withCamp({ ...base(), reputation: 20, groups: { ...base().groups, working: 40 } }, camp());
    const r = endorseWithCapital(c, 'working');
    if (!r.ok) throw new Error(r.message);
    expect(r.career.reputation).toBe(15);
    expect(endorseWithCapital(withCamp({ ...base(), reputation: 20, groups: { ...base().groups, working: 39 } }, camp()), 'working').ok).toBe(false);
  });
});

describe('Crowded primaries', () => {
  it('fields 8–10 same-party primary candidates including the player', () => {
    for (const d of ['2026-11-01', '2028-11-01', '2030-11-01']) {
      const primary = genOpponents(base(), officeById('house'), d).filter(x => x.primary);
      expect(primary.length + 1).toBeGreaterThanOrEqual(8);
      expect(primary.length + 1).toBeLessThanOrEqual(10);
      expect(primary.every(x => x.party === 'Democrat')).toBe(true);
    }
  });
  it('adds an insurgent challenger when an incumbent is below 35% approval', () => {
    const c = { ...base(), office: { id: 'house', title: 'Rep', jurisdiction: 'X', since: '2024-01-01', party: 'Democrat', elected: '2024-11-01', termEnd: '2027-01-01', margin: 5 }, approval: { overall: 30 } } as unknown as Career;
    expect(genOpponents(c, officeById('house'), '2026-11-01').some(x => x.bio.startsWith('Insurgent challenger'))).toBe(true);
  });
  it('independents skip primaries entirely', () => {
    expect(genOpponents(base('Independent'), officeById('house'), '2026-11-01').some(x => x.primary)).toBe(false);
  });
});

describe('Independent ballot access', () => {
  it('requires 40 reputation or heavy personal funding', () => {
    const o = officeById('house');
    expect(independentBallotAccess({ ...base('Independent'), reputation: 39, money: 0 }, o)).toMatch(/ballot access/);
    expect(independentBallotAccess({ ...base('Independent'), reputation: 40, money: 0 }, o)).toBeNull();
    expect(independentBallotAccess({ ...base('Independent'), reputation: 0, money: independentFundingBar(o) }, o)).toBeNull();
    expect(independentBallotAccess({ ...base('Democrat'), reputation: 0 }, o)).toBeNull();
  });
});
