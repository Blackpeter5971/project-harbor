import type { Career } from './career';
import { groupRel } from './campaign';
import { ensureApproval } from './approval';
import { householdTurn } from './household';
import { clampAffinity, familyCosts, familyStressRelief, socialOf, type FamilyImage, type SocialContact, type SocialState } from './relationships';

/** Quarterly family processing (Life 5D): support billing, neglect drift, stress and public family image. Personal cash only; keyed by social.lastFamilyPeriod. */
export const NEGLECT_QUARTERS = 2;
export const NEGLECT_DRIFT = 2;
export const DEVOTED_AFFINITY = 80;
export const DEVOTED_STRESS_RELIEF = 8;
export const UNPAID_FAMILY_STRESS = 15;
export const UNPAID_PARTNER_AFFINITY = 10;
export const STRAINED_AFFINITY = 30;
export const FAMILY_IMAGE_GROUPS = ['suburban', 'religious'] as const;
export const FAMILY_IMAGE_BOOST = 2;
export const STRAIN_SUPPORT_PENALTY = 1;

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;
const clampVital = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/** Seen this turn resets neglect; otherwise each quarter adds one, and 2+ quarters cost 2 affinity. Family relatives drift too. */
function drift<T extends SocialContact>(x: T, periodStart: string): T {
  if (x.lastInteraction && x.lastInteraction >= periodStart) { const { neglect: _n, ...rest } = x; return rest as T; }
  const neglect = (x.neglect ?? 0) + 1;
  return { ...x, neglect, affinity: neglect >= NEGLECT_QUARTERS ? clampAffinity(x.affinity - NEGLECT_DRIFT) : x.affinity };
}

/** Stable: married, partner at 60%+ affinity and support paid. Strained: unpaid support or a married/engaged partner below 30%. */
export function familyImage(s: SocialState, unpaid: boolean): FamilyImage {
  const committed = (s.maritalStatus === 'married' || s.maritalStatus === 'engaged') && !!s.partner;
  if (unpaid || (committed && s.partner!.affinity < STRAINED_AFFINITY)) return 'strained';
  return familyStressRelief(s) > 0 ? 'stable' : 'neutral';
}

export interface FamilyCollection { career: Career; notices: string[] }
export function collectFamily(c: Career, periodStart: string): FamilyCollection {
  if (!c.life) return { career: c, notices: [] };
  const s0 = socialOf(c);
  if (s0.lastFamilyPeriod && periodStart <= s0.lastFamilyPeriod) return { career: c, notices: [] };
  const notices: string[] = [];
  let s: SocialState = { ...s0, contacts: s0.contacts.map(x => drift(x, periodStart)), partner: s0.partner ? drift(s0.partner, periodStart) : null };
  const drifted = s.contacts.filter((x, i) => x.affinity < s0.contacts[i]!.affinity).length + (s.partner && s0.partner && s.partner.affinity < s0.partner.affinity ? 1 : 0);
  if (drifted) notices.push(`Relationships: ${drifted} ${drifted === 1 ? 'person feels' : 'people feel'} neglected (-${NEGLECT_DRIFT} affinity). Make time for them.`);
  let n: Career = c;
  let stress = c.life.stress;
  const cost = familyCosts(s).total;
  let unpaid = false;
  if (cost > 0) {
    if (c.money >= cost) {
      n = { ...c, money: c.money - cost, ledger: [{ month: periodStart, label: 'Family support (3 months)', amount: -cost }, ...c.ledger] };
      notices.push(`Family: ${usd(cost)} paid for household and children's support.`);
    } else {
      unpaid = true;
      stress += UNPAID_FAMILY_STRESS;
      if (s.partner) s = { ...s, partner: { ...s.partner, affinity: clampAffinity(s.partner.affinity - UNPAID_PARTNER_AFFINITY) } };
      notices.push(`Family Strain: Could not cover ${usd(cost)} in family support (+${UNPAID_FAMILY_STRESS} stress${s.partner ? `, -${UNPAID_PARTNER_AFFINITY} partner affinity` : ''}).`);
    }
  }
  const together = !!s.partner && ['dating', 'engaged', 'married'].includes(s.maritalStatus);
  const relief = together && s.partner!.affinity > DEVOTED_AFFINITY ? DEVOTED_STRESS_RELIEF : familyStressRelief(s);
  if (relief && !unpaid) { stress -= relief; notices.push(`Home life: time with ${s.partner!.name} eased stress by ${relief}.`); }
  const image = familyImage(s, unpaid);
  const prev = s0.familyImage ?? 'neutral';
  // Image effects fire once on transition, so they never stack turn after turn.
  if (image === 'stable' && prev !== 'stable') {
    n = { ...n, groups: { ...n.groups, ...Object.fromEntries(FAMILY_IMAGE_GROUPS.map(g => [g, Math.min(100, groupRel(n, g) + FAMILY_IMAGE_BOOST)])) } };
    const a = ensureApproval(n).approval;
    if (a) n = { ...n, approval: { ...a, groups: { ...a.groups, ...Object.fromEntries(FAMILY_IMAGE_GROUPS.map(g => [g, Math.min(100, (a.groups[g] ?? a.overall) + FAMILY_IMAGE_BOOST)])) } } };
    notices.push(`Family image: a steady marriage plays well with suburban and religious voters (+${FAMILY_IMAGE_BOOST}).`);
  }
  if (image === 'strained' && prev !== 'strained') {
    if (n.campaign) n = { ...n, campaign: { ...n.campaign, support: Math.max(0, n.campaign.support - STRAIN_SUPPORT_PENALTY), headlines: [`Rivals whisper about ${c.character.name}'s troubled home life`, ...n.campaign.headlines].slice(0, 10) } };
    notices.push(n.campaign ? `Campaign fodder: rivals seize on your family strain (-${STRAIN_SUPPORT_PENALTY} support).` : 'Family strain: tension at home could become campaign fodder.');
  }
  s = { ...s, lastFamilyPeriod: periodStart, familyImage: image };
  const out: Career = { ...n, life: { ...n.life!, stress: clampVital(stress), social: s } };
  const hh = householdTurn(out, periodStart);
  return { career: hh.career, notices: [...notices, ...hh.notices] };
}
