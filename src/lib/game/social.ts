import type { Career } from './career';
import { ensureLife } from './life';
import { CHILD_QUARTERLY_COST, archetypeById, defaultSocial, familyCosts, type Dependent, type MaritalStatus, type Partner, type SocialContact } from './relationships';

/** Read-only display helpers for the Circle & Family view. Mechanics live in relationships.ts; money shown is career.money only. */
export type RelationshipTier = 'Acquaintance' | 'Close Friend' | 'Partner' | 'Confidant';

export const CLOSE_FRIEND_AFFINITY = 55;
export const CONFIDANT_AFFINITY = 80;
export const MIXER_ASSET = '/images/characters/social-mixer.jpg';

export const maritalLabel: Record<MaritalStatus, string> = { single: 'Single · Open to Romance', dating: 'Dating', engaged: 'Engaged', married: 'Married', divorced: 'Divorced' };

export function relationshipTier(c: Pick<SocialContact, 'affinity'>, isPartner = false): RelationshipTier {
  if (isPartner) return 'Partner';
  if (c.affinity >= CONFIDANT_AFFINITY) return 'Confidant';
  if (c.affinity >= CLOSE_FRIEND_AFFINITY) return 'Close Friend';
  return 'Acquaintance';
}

const standing: Record<string, string> = {
  confidant: 'Private counsel. No public effect.',
  organizer: 'Opens doors with grassroots volunteers.',
  executive: 'Signals access to donor networks.',
  mentor: 'Lends credibility with the legal establishment.',
  reporter: 'Shapes how the press covers you.',
  parents: 'A steady family image on the trail.',
  sibling: 'Humanizes you with ordinary voters.',
  romantic: 'Draws public attention if seen together.',
};
export const standingImpact = (c: Pick<SocialContact, 'archetypeId'>) => standing[c.archetypeId] ?? 'No public effect.';

export const dependentPortrait = (d: Pick<Dependent, 'age'>) => (d.age < 12 ? '/images/characters/child-young.jpg' : '/images/characters/child-teen.jpg');

export interface SocialView {
  maritalStatus: MaritalStatus;
  label: string;
  partner: Partner | null;
  familyAllowance: number;
  dependents: (Dependent & { portrait: string; quarterly: number })[];
  dependentsTotal: number;
  circle: SocialContact[];
  family: SocialContact[];
}

/** Partners only show while dating, engaged or married. */
export function socialView(career: Career): SocialView {
  const s = ensureLife(career).life?.social ?? defaultSocial();
  const together = s.maritalStatus === 'dating' || s.maritalStatus === 'engaged' || s.maritalStatus === 'married';
  const partner = together ? s.partner : null;
  const dependents = s.dependents.map(d => ({ ...d, portrait: dependentPortrait(d), quarterly: CHILD_QUARTERLY_COST }));
  return {
    maritalStatus: s.maritalStatus,
    label: maritalLabel[s.maritalStatus],
    partner,
    familyAllowance: familyCosts(s).household,
    dependents,
    dependentsTotal: dependents.reduce((n, d) => n + d.quarterly, 0),
    circle: s.contacts.filter(c => archetypeById(c.archetypeId)?.category !== 'family'),
    family: s.contacts.filter(c => archetypeById(c.archetypeId)?.category === 'family'),
  };
}
