import { ACTION_COST } from './energy-costs';
import type { Career } from './career';
import type { Scandal } from './scandal-schema';
import { rand } from './campaign';
import { applyActionApproval, dutyApproval, holdsOffice, type GroupDelta } from './approval';
import { shiftLoyalty, type Deltas } from './support-groups';
import { socialMediaSchema, handleOf } from './social-media';
import type { Result } from './gameplay';
import { communicationsSeverity } from './campaign-staff-schema';

/**
 * Phase 4B — scandal responses and fallout. Pure, browser-safe.
 * One saved response per scandal; the outcome is computed once and stored, so reloads and
 * repeated clicks never reroll or re-apply it. Approval and loyalty changes go through the
 * existing shiftApproval / shiftLoyalty paths only.
 */
export type ResponseId = NonNullable<Scandal['response']>;
export type Outcome = NonNullable<Scandal['resolution']>;

export type ResponseOption = {
  id: ResponseId; name: string; alt: string; summary: string;
  /** Who tends to like / dislike it — shown in the UI and used for loyalty. */
  groups: Deltas; party: number;
};

export const responseOptions: ResponseOption[] = [
  { id: 'deny', name: 'Issue official denial', alt: 'Counter-attack on S', summary: 'Fires up your base and costs nothing. Strong if the claim is weak; disastrous if the evidence is real.', groups: { rural: 1.5, religious: 1, business: -1, youth: -1.5 }, party: 2 },
  { id: 'press', name: 'Hold a press conference', alt: 'Full transparency', summary: 'Your communication skill decides it. Costs $5,000 and a small upfront dip, but limits long-term damage.', groups: { youth: 1.5, labor: 1, rural: -0.5 }, party: -1 },
  { id: 'settle', name: 'Settle quietly', alt: 'Sacrificial resignation of an ally', summary: 'Ends the story fast for a price. Your party resents the sacrificed ally, and hush money can leak if evidence is strong.', groups: { business: 1, labor: -1.5, youth: -1 }, party: -3 },
  { id: 'audit', name: 'Cooperate with an audit', alt: 'Independent investigation', summary: 'Investigators settle the facts: you are cleared if the claim is weak, or found at fault (with credit for cooperating) if it is real.', groups: { veterans: 1.5, religious: 1, rural: 0.5 }, party: -1.5 },
];

const severityRank = { Minor: 0, Moderate: 1, Severe: 2 } as const;
export const settleCost = (s: Scandal) => [15000, 40000, 90000][severityRank[s.severity]] ?? 15000;
export const responseCost = (s: Scandal, id: ResponseId) => id === 'press' ? 5000 : id === 'settle' ? settleCost(s) : 0;
/** Truthfulness proxy from saved evidence and findings — never a hidden guilt roll. */
export const grounded = (s: Scandal) => s.status === 'proven' || (s.status !== 'cleared' && s.evidence >= 55);
export const canRespond = (s: Scandal) => !s.response && s.phase !== 'Managed' && s.status !== 'cleared';

/** Deterministic 0–100 handling score. Skills, truthfulness and severity all matter; a seeded swing keeps it uncertain. */
export function responseScore(c: Career, s: Scandal, id: ResponseId): number {
  const comm = c.skills.communication, lead = c.skills.leadership, know = c.skills.knowledge;
  const sev = severityRank[s.severity] * 8, ev = s.evidence, real = grounded(s);
  const swing = (rand(`${c.character.name}|${s.id}|${id}`) - 0.5) * 20;
  const base = id === 'deny' ? 70 - ev * 0.9 + comm * 0.25 + (real ? -15 : 0)
    : id === 'press' ? 30 + comm * 0.55 + lead * 0.1 - ev * 0.15
    : id === 'settle' ? 62 - ev * 0.35 + lead * 0.15
    : 48 + know * 0.2 + (real ? -6 : 14);
  return Math.round(Math.max(0, Math.min(100, base - sev + swing)));
}
export const outcomeOf = (score: number): Outcome => score >= 60 ? 'defused' : score >= 35 ? 'contained' : 'backfired';

/** Approval/loyalty/momentum magnitudes per outcome, before option-specific modifiers. */
const OUTCOME = { defused: { approval: 2, party: 1, momentum: 1.5 }, contained: { approval: -1, party: 0, momentum: -0.5 }, backfired: { approval: -4, party: -2, momentum: -3 } } as const;
/** Option-specific immediate trade-off on approval (press dip, audit dip, deny bump). */
const UPFRONT: Record<ResponseId, number> = { deny: 0.5, press: -0.5, settle: 0, audit: -1 };

export function previewResponse(c: Career, s: Scandal, id: ResponseId) {
  const score = responseScore(c, s, id);
  return { score, likely: outcomeOf(score), cost: responseCost(s, id) };
}

const label: Record<Outcome, string> = { defused: 'defused the story', contained: 'contained the damage', backfired: 'made it worse' };

export function respondToScandal(c: Career, scandalId: string, id: ResponseId): Result {
  const s = c.scandals.find(x => x.id === scandalId), opt = responseOptions.find(o => o.id === id);
  if (!s || !opt) return { ok: false, message: 'That scandal record no longer exists.' };
  if (!canRespond(s)) return { ok: false, message: 'You have already responded to this scandal.' };
  if (c.actions < ACTION_COST) return { ok: false, message: 'Responding takes 1 action. Wait for next turn.' };
  const cost = responseCost(s, id);
  if (c.money < cost) return { ok: false, message: `You need $${cost.toLocaleString('en-US')} in personal funds.` };

  const score = responseScore(c, s, id);
  let outcome = outcomeOf(score);
  // The investigation decides the facts; it can never be a clean "win" when evidence is real.
  const status: Scandal['status'] = id === 'audit' ? (grounded(s) ? 'proven' : 'cleared') : s.status;
  if (id === 'audit') outcome = status === 'cleared' ? 'defused' : outcome === 'backfired' ? 'backfired' : 'contained';
  const finding = id === 'audit' ? (status === 'cleared' ? 'An independent audit found no supporting evidence.' : 'An independent audit substantiated the conduct; cooperation was noted.') : s.finding;
  const phase: Scandal['phase'] = outcome === 'backfired' ? 'Exploded' : 'Managed';
  const next: Scandal = { ...s, response: id, responseDate: c.date, resolution: outcome, status, finding, evidence: status === 'cleared' ? 0 : status === 'proven' ? Math.max(85, s.evidence) : s.evidence, phase, reported: [...s.reported, `${phase}|${status}`] };

  const o = OUTCOME[outcome], mult = outcome === 'backfired' ? -1 : 1;
  let n: Career = { ...c, actions: c.actions - ACTION_COST, money: c.money - cost, scandals: c.scandals.map(x => x.id === s.id ? next : x),
    ledger: cost ? [{ month: c.date, label: `Scandal response · ${opt.name}`, amount: -cost }, ...c.ledger] : c.ledger };

  // Approval: single bounded shift through the existing system (officeholders only).
  const rawBase = o.approval + UPFRONT[id];
  const raw = rawBase < 0 ? rawBase * communicationsSeverity(c.campaign) : rawBase;
  if (holdsOffice(n)) {
    const groupDeltas: GroupDelta[] = Object.entries(opt.groups).map(([group, d]) => ({ group, delta: raw + (d ?? 0) }));
    n = applyActionApproval(n, `scandal:${s.id}`, raw, 'major', `Scandal response (${opt.name}) ${label[outcome]}: ${s.title}.`, outcome === 'backfired', groupDeltas);
  } else n = { ...n, reputation: Math.max(0, Math.round((n.reputation + raw * 0.5) * 10) / 10) };

  // Loyalty: option tastes always apply; a backfire flips favourable reactions into losses.
  const deltas: Deltas = Object.fromEntries(Object.entries(opt.groups).map(([g, d]) => [g, mult < 0 ? -Math.abs(d ?? 0) : d]));
  n = shiftLoyalty(n, deltas, `Scandal response: ${opt.name}`, opt.party + o.party);

  if (n.campaign) n = { ...n, campaign: { ...n.campaign, momentum: Math.round((n.campaign.momentum + o.momentum * (o.momentum < 0 ? communicationsSeverity(c.campaign) : 1)) * 10) / 10 } };

  const headline: Record<Outcome, string> = { defused: `${c.character.name} defuses "${s.title}"`, contained: `${c.character.name} responds to "${s.title}"; questions linger`, backfired: `${c.character.name}'s response to "${s.title}" backfires` };
  const social = n.socialMedia ?? socialMediaSchema.parse({});
  const post = id === 'deny' ? `These claims are false and the people pushing them know it. I won't be bullied. #${s.trigger}` : id === 'press' ? `Today I took every question on "${s.title}". The public deserves the full picture.` : id === 'settle' ? `A member of my team has stepped down. We're moving forward.` : `I've asked for an independent audit and will cooperate fully. Let the facts speak.`;
  const press = outcome === 'defused' ? 'The story appears to be fading.' : outcome === 'contained' ? 'Critics are not fully satisfied.' : 'The response is drawing fresh outrage.';
  n = { ...n,
    newsQueue: [...n.newsQueue, { h: headline[outcome], sub: `${opt.name} / ${opt.alt}`, body: `${post} ${press}${finding && id === 'audit' ? ` ${finding}` : ''}`, tag: 'scandal', subject: c.character.name, portrait: c.character.portrait, priority: 1 }],
    socialMedia: { ...social, reactionFeed: [
      { id: `response-${s.id}-press`, date: c.date, about: s.title, role: 'press' as const, author: 'Capitol News Desk', handle: '@capitolnews', verified: true, text: `${handleOf(c)} chose: ${opt.name}. ${press}`, likes: outcome === 'backfired' ? 90 : 30, reposts: outcome === 'backfired' ? 40 : 10, replies: 20, views: 2400 },
      { id: `response-${s.id}-self`, date: c.date, about: s.title, role: 'press' as const, author: c.character.name, handle: handleOf(c), verified: false, text: post, likes: 40, reposts: 12, replies: outcome === 'backfired' ? 60 : 15, views: 1800 },
      ...social.reactionFeed.filter(p => !p.id.startsWith(`response-${s.id}-`))].slice(0, 30) },
    log: [`Scandal response: ${opt.name} — you ${label[outcome]}.`, ...n.log].slice(0, 30) };
  return { ok: true, career: n, message: `${opt.name}: you ${label[outcome]}.` };
}

/** Quarterly fallout from unanswered or botched scandals: gradual approval and party-loyalty drops.
    Guarded per scandal by falloutTurn so a quarter never applies twice. Campaign claims are excluded
    because approvalDrift already penalizes proven campaign allegations. */
export const FALLOUT = { Active: { approval: -1, party: -1 }, Exploded: { approval: -2, party: -2 } } as const;
export function scandalFalloutTurn(c: Career, end: string): { career: Career; notices: string[] } {
  let n = c; const notices: string[] = [];
  for (const s of c.scandals) {
    if (s.falloutTurn >= end || s.id.startsWith('campaign|')) continue;
    n = { ...n, scandals: n.scandals.map(x => x.id === s.id ? { ...x, falloutTurn: end } : x) };
    if (s.phase !== 'Active' && s.phase !== 'Exploded') continue;
    if (s.severity === 'Minor' && s.evidence === 0) continue;
    const f = FALLOUT[s.phase];
    const severity = communicationsSeverity(n.campaign);
    const approvalLoss = Math.round(f.approval * severity * 10) / 10, partyLoss = Math.round(f.party * severity * 10) / 10;
    n = dutyApproval(n, approvalLoss, `Ongoing scandal: ${s.title}.`);
    n = shiftLoyalty(n, {}, `Ongoing scandal: ${s.title}`, partyLoss);
    notices.push(`Scandal fallout: ${s.title} cost ${Math.abs(partyLoss)} party loyalty${holdsOffice(n) ? ` and ${Math.abs(approvalLoss)} approval` : ''}. ${s.response ? 'Your response backfired.' : 'Respond from Politics → Scandals.'}`);
  }
  return { career: n, notices };
}
