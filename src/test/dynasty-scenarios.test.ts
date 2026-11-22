import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, canAccessGovernment } from '@/lib/game/career';
import { DYNASTY_SCENARIOS, validScenarios } from '@/lib/game/character';
import { advanceTurn } from '@/lib/game/gameplay';

const dynasty = (rng: number, party: typeof defaultDraft.party = 'Democrat') => createCareer({ ...defaultDraft, name: 'Kay', party, background: 'Political Dynasty' }, () => rng);

describe('Dynasty starting scenarios', () => {
  it('assigns exactly one valid scenario', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const c = dynasty(r);
      expect(c.startingScenario).not.toBeNull();
      expect(validScenarios(c)).toContain(c.startingScenario!.id);
    }
  });
  it('unsupported appointed offices fall back to Connected Heir', () => {
    const pool = validScenarios(dynasty(0));
    expect(pool).not.toContain('appointed-minister');
    expect(pool).not.toContain('state-commissioner');
    expect(pool).toEqual(['connected-heir', 'party-leadership']);
  });
  it('is preserved after reload and turn advance (no reroll)', () => {
    const c = dynasty(0.99);
    const loaded = parseCareer(JSON.stringify(c))!;
    expect(loaded.startingScenario).toEqual(c.startingScenario);
    expect(advanceTurn(loaded).career.startingScenario).toEqual(c.startingScenario);
  });
  it('non-dynasty backgrounds get no scenario', () => {
    for (const background of ['Nobody', 'Working-Class Family', 'Self-Made', 'Wealthy Family'] as const)
      expect(createCareer({ ...defaultDraft, name: 'N', background }).startingScenario).toBeNull();
  });
  it('party leadership grants a party seat, not an elected office', () => {
    const c = dynasty(0.99);
    expect(c.startingScenario!.id).toBe('party-leadership');
    expect(c.position).toBe('committee');
    expect(c.relationships).toBe(13);
    expect(c.office).toBeNull();
    expect(c.publicOffice).toBe(false);
    expect(c.elections).toEqual([]);
    expect(canAccessGovernment(c)).toBe(false);
  });
  it('connected heir adds +15 mentor affinity without an office', () => {
    const c = dynasty(0);
    expect(c.startingScenario).toEqual(DYNASTY_SCENARIOS['connected-heir']);
    expect(c.life!.social!.contacts.find(p => p.archetypeId === 'mentor')!.affinity).toBe(75);
    expect(c.position).toBe('captain');
    expect(c.office).toBeNull();
  });
  it('independent dynasties cannot hold a party role', () => {
    const c = dynasty(0.99, 'Independent');
    expect(c.startingScenario!.id).toBe('connected-heir');
    expect(c.position).toBe('none');
  });
});
