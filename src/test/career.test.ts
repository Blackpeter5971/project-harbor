import { describe, expect, it } from 'vitest';
import { canAccessGovernment, createCareer, defaultDraft, parseCareer, states } from '@/lib/game/career';

describe('Career foundation rules', () => {
  it('does not allow Continue without an actual valid save', () => {
    expect(parseCareer(null)).toBeNull();
    expect(parseCareer('{}')).toBeNull();
    expect(parseCareer('broken')).toBeNull();
    const career = createCareer({ ...defaultDraft, name: 'Alex Morgan' });
    expect(parseCareer(JSON.stringify(career))?.character.name).toBe('Alex Morgan');
  });
  it('retains every chosen character field in the saved career', () => {
    const character = { name: 'Taylor Jones', state: 'Texas', sex: 'Female', portrait: 5, background: 'Political Dynasty', party: 'Republican', education: 'Law' } as const;
    expect(parseCareer(JSON.stringify(createCareer(character)))?.character).toEqual(character);
  });
  it('locks Government until public office or an eligible appointment', () => {
    expect(canAccessGovernment({ publicOffice: false, eligibleAppointment: false })).toBe(false);
    expect(canAccessGovernment({ publicOffice: true, eligibleAppointment: false })).toBe(true);
    expect(canAccessGovernment({ publicOffice: false, eligibleAppointment: true })).toBe(true);
  });
  it('rejects empty character names', () => {
    expect(() => createCareer({ ...defaultDraft, name: '  ' })).toThrow();
  });
  it('offers all 50 US states', () => {
    expect(states).toHaveLength(50);
    expect(states).toContain('Alaska');
    expect(states).toContain('Hawaii');
  });
});