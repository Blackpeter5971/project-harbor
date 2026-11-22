import { describe, it, expect } from 'vitest';
import { createCareer, parseCareer, defaultDraft } from '@/lib/game/career';
import { supportGroupsView, baselineSupportGroups } from '@/lib/game/support-groups';

const draft = (background: string, party = 'Democrat') => ({ ...defaultDraft, name: 'Alex Morgan', party, background } as any);

describe('support groups & loyalty', () => {
  it('tracks six groups with distinct scores', () => {
    const v = supportGroupsView(createCareer(draft('Working-Class Family'), () => 0));
    expect(v.groups.map(g => g.name)).toEqual(['Labor & Workers', 'Business Owners', 'Veterans', 'Youth', 'Religious Communities', 'Rural Communities']);
    expect(new Set(v.groups.map(g => g.loyalty)).size).toBeGreaterThan(3);
    expect(v.groups.find(g => g.id === 'labor')!.loyalty).toBe(60);
  });
  it('does not change approval or reputation', () => {
    const c = createCareer(draft('Self-Made'), () => 0);
    expect(c.reputation).toBe(10);
    expect(c.approval).toBeNull();
  });
  it('older saves load with baseline defaults', () => {
    const c = createCareer(draft('Wealthy Family'), () => 0);
    const { supportGroups, ...legacy } = c;
    const loaded = parseCareer(JSON.stringify(legacy))!;
    expect(loaded.supportGroups).toBeNull();
    expect(loaded.reputation).toBe(c.reputation);
    expect(supportGroupsView(loaded).groups.find(g => g.id === 'business')!.loyalty).toBe(baselineSupportGroups(loaded).loyalty['business']);
  });
  it('independents have no party standing', () => {
    expect(supportGroupsView(createCareer(draft('Nobody', 'Independent'), () => 0)).partyStanding).toBeNull();
  });
});
