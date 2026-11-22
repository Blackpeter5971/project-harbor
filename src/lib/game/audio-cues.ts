import type { Career } from './career';
import type { SoundId } from './audio';

/**
 * Pure: which sounds a single in-turn career change should make. Read-only diff of two
 * careers; never changes game state. Turn advances (date change) are ignored here so the
 * quarterly settlement doesn't fire a burst of cues.
 */
export function careerCues(prev: Career | null, next: Career): SoundId[] {
  if (!prev || prev.date !== next.date) return [];
  const cues = new Set<SoundId>();

  const prevLeg = new Map((prev.legislature?.bills ?? []).map(b => [b.id, b.status]));
  for (const b of next.legislature?.bills ?? []) {
    const was = prevLeg.get(b.id);
    if (was === b.status) continue;
    if (b.status === 'enacted' || b.status === 'passed_house' || b.status === 'passed_senate') { cues.add('gavel'); cues.add('pass'); }
    else if (b.status === 'failed') { cues.add('gavel'); cues.add('fail'); }
    else if (b.status === 'vetoed') cues.add('veto');
  }

  const prevBills = new Map(prev.bills.map(b => [b.id, b.stage]));
  for (const b of next.bills) {
    const was = prevBills.get(b.id);
    if (was === b.stage) continue;
    if (b.stage === 'passed') { cues.add('gavel'); cues.add('pass'); }
    else if (b.stage === 'rejected') { cues.add('gavel'); cues.add('fail'); }
  }

  const prevItems = prev.executiveDocket?.items ?? [];
  (next.executiveDocket?.items ?? []).forEach((item, i) => {
    if (!item.resolved || prevItems[i]?.resolved || prev.executiveDocket?.id !== next.executiveDocket?.id) return;
    if (item.choice === 'veto') cues.add('veto');
    else if (item.choice === 'sign') cues.add('stamp');
    else cues.add('stamp');
  });

  const prevPost = prev.socialMedia?.posts?.[0]?.id;
  const nextPost = next.socialMedia?.posts?.[0]?.id;
  if (nextPost && nextPost !== prevPost) cues.add('camera');

  const moneyUp = next.money > prev.money;
  const fundsUp = (next.campaign?.funds ?? 0) > (prev.campaign?.funds ?? 0);
  const bought = next.money < prev.money && (
    JSON.stringify(next.housing) !== JSON.stringify(prev.housing) ||
    (next.life?.vehicles?.length ?? 0) > (prev.life?.vehicles?.length ?? 0) ||
    (next.life?.possessions?.length ?? 0) > (prev.life?.possessions?.length ?? 0));
  if (moneyUp || fundsUp || bought) cues.add('cash');

  return [...cues];
}

/**
 * Pure: high-stakes stingers (scandals, crises, courts, impeachment, elections). Unlike
 * careerCues this also fires across a turn advance, but only for records that are new or
 * changed between the two careers, so reloads and reopened modals never replay them.
 */
export function dramaCues(prev: Career | null, next: Career): SoundId[] {
  if (!prev) return [];
  const cues = new Set<SoundId>();

  const scandals = new Map(prev.scandals.map(s => [s.id, s]));
  for (const s of next.scandals) {
    const was = scandals.get(s.id);
    if (!was || (s.phase !== was.phase && (s.phase === 'Active' || s.phase === 'Exploded'))) cues.add('alert');
  }

  const crises = new Map(prev.crises.map(c => [c.id, c.status]));
  for (const c of next.crises) {
    const was = crises.get(c.id);
    if (c.status !== 'resolved' && (was === undefined || (c.status === 'escalated' && was !== 'escalated'))) cues.add('klaxon');
  }

  const cases = new Map((prev.legal?.cases ?? []).map(c => [c.id, c]));
  for (const c of next.legal?.cases ?? []) {
    const was = cases.get(c.id);
    const verdict = c.trial?.verdict;
    if (verdict && !was?.trial?.verdict) {
      cues.add('courtGavel');
      cues.add(verdict.type === 'acquitted' || verdict.type === 'dropped' ? 'relief' : 'doom');
    } else if (c.stage !== was?.stage) {
      if (c.stage === 'indicted' || c.stage === 'convicted') cues.add('doom');
      else if (c.stage === 'dismissed' || c.stage === 'acquitted') cues.add('relief');
    }
  }
  const pardoned = (L: Career['legal']) => (L?.served ?? []).filter(s => s.pardoned).length;
  if (pardoned(next.legal) > pardoned(prev.legal)) cues.add('relief');

  const votes = (c: Career) => c.impeachment?.proceeding?.votes.length ?? 0;
  if (next.impeachment?.proceeding && next.impeachment.proceeding.id === prev.impeachment?.proceeding?.id && votes(next) > votes(prev)) {
    cues.add('courtGavel');
    const last = next.impeachment.proceeding.votes[votes(next) - 1];
    if (last?.passed) cues.add('doom');
  }
  if ((next.impeachment?.acquittals ?? 0) > (prev.impeachment?.acquittals ?? 0)) { cues.add('courtGavel'); cues.add('relief'); }

  if (next.elections.length > prev.elections.length) {
    const latest = next.elections.slice(prev.elections.length);
    cues.add('tally');
    cues.add(latest.some(e => e.won) ? 'victory' : 'defeat');
  }
  return [...cues];
}

/** Sound for a direct political activity (speeches and interviews get press/crowd cues). */
export function activityCue(id: string): SoundId | null {
  if (id === 'speech' || id === 'organize' || id === 'drive') return 'applause';
  if (id === 'interview') return 'camera';
  return null;
}
