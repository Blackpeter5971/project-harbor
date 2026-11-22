import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { registerScandal, scandalsTurn } from '@/lib/game/scandals';
import { respondToScandal, responseOptions, scandalFalloutTurn, responseScore, type ResponseId } from '@/lib/game/scandal-responses';
import { supportGroupsOf } from '@/lib/game/support-groups';
import { ensureApproval } from '@/lib/game/approval';
import { advanceTurn as advanceGameTurn } from '@/lib/game/gameplay';
import { socialOf } from '@/lib/game/social-media';

const make = (comm = 20) => {
  const c = createCareer({ ...defaultDraft, name: 'Ada', background: 'Self-Made', party: 'Democrat' }, () => 0);
  return ensureApproval({ ...c, money: 200000, actions: 75, skills: { ...c.skills, communication: comm }, office: { id: 'mayor', title: 'Mayor', jurisdiction: 'Testville', party: 'Democrat', since: '2026-01-01', elected: '2025-11-01', termEnd: '2030-01-01', margin: 5 }, publicOffice: true } as Career);
};
const withScandal = (c: Career, evidence: number, severity: 'Minor' | 'Moderate' | 'Severe' = 'Moderate') =>
  registerScandal(c, { id: 's1', title: 'Contract leak', summary: 'Records question a contract.', source: 'Whistleblower', severity, evidence, trigger: 'office' });
const respond = (c: Career, id: ResponseId) => { const r = respondToScandal(c, 's1', id); if (!r.ok) throw new Error(r.message); return r.career; };
const party = (c: Career) => supportGroupsOf(c).partyStanding;

describe('Phase 4B scandal responses', () => {
  it('offers exactly four response choices', () => {
    expect(responseOptions.map(o => o.id)).toEqual(['deny', 'press', 'settle', 'audit']);
  });

  it.each(['deny', 'press', 'settle', 'audit'] as const)('%s changes approval and loyalty and records one saved outcome', id => {
    const c = withScandal(make(), 40), n = respond(c, id);
    const s = n.scandals[0]!;
    expect(s.response).toBe(id); expect(s.resolution).not.toBeNull();
    expect(n.approval!.overall).not.toBe(c.approval!.overall);
    expect(supportGroupsOf(n).history[0]?.reason).toContain('Scandal response');
    expect(n.actions).toBe(c.actions - 15);
  });

  it('denial works on a weak claim but backfires on strong evidence (no win button)', () => {
    expect(respond(withScandal(make(40), 0, 'Minor'), 'deny').scandals[0]?.resolution).toBe('defused');
    const bad = respond(withScandal(make(40), 85, 'Severe'), 'deny');
    expect(bad.scandals[0]?.resolution).toBe('backfired');
    expect(bad.scandals[0]?.phase).toBe('Exploded');
  });

  it('communication skill improves a press conference', () => {
    const lo = withScandal(make(5), 50), hi = withScandal(make(80), 50);
    expect(responseScore(hi, hi.scandals[0]!, 'press')).toBeGreaterThan(responseScore(lo, lo.scandals[0]!, 'press') + 30);
  });

  it('an audit clears weak claims and substantiates grounded ones', () => {
    expect(respond(withScandal(make(), 20), 'audit').scandals[0]).toMatchObject({ status: 'cleared', resolution: 'defused', phase: 'Managed' });
    expect(respond(withScandal(make(), 80), 'audit').scandals[0]).toMatchObject({ status: 'proven' });
  });

  it('settling costs cash scaled by severity and the sacrificed ally costs party loyalty', () => {
    const c = withScandal(make(), 30, 'Severe'), n = respond(c, 'settle');
    expect(c.money - n.money).toBe(90000);
    expect(party(n)).toBeLessThan(party(c));
  });

  it('cannot respond twice or replay the same response', () => {
    const n = respond(withScandal(make(), 30), 'press');
    expect(respondToScandal(n, 's1', 'deny').ok).toBe(false);
  });

  it('unanswered active scandals drip approval and party loyalty once per quarter', () => {
    const c = scandalsTurn(withScandal(make(), 50), '2026-01-01', '2026-04-01').career;
    const active = { ...c, scandals: c.scandals.map(s => ({ ...s, phase: 'Active' as const })) };
    const once = scandalFalloutTurn(active, '2026-04-01').career;
    expect(once.approval!.overall).toBe(active.approval!.overall - 1);
    expect(party(once)).toBe(party(active) - 1);
    expect(scandalFalloutTurn(once, '2026-04-01').career).toEqual(once);
  });

  it('a resolved scandal is archived and stops inflicting quarterly penalties', () => {
    const n = respond(withScandal(make(40), 0, 'Moderate'), 'deny');
    expect(n.scandals[0]?.phase).toBe('Managed');
    const later = scandalsTurn(n, '2026-01-01', '2026-04-01').career;
    expect(later.scandals[0]?.phase).toBe('Managed');
    const after = scandalFalloutTurn(later, '2026-04-01').career;
    expect(after.approval!.overall).toBe(later.approval!.overall);
    expect(party(after)).toBe(party(later));
  });

  it('a backfired response keeps burning across turns', () => {
    const n = respond(withScandal(make(40), 85, 'Severe'), 'deny');
    const t = scandalsTurn(n, '2026-01-01', '2026-04-01').career;
    expect(t.scandals[0]?.phase).toBe('Exploded');
    expect(scandalFalloutTurn(t, '2026-04-01').career.approval!.overall).toBe(t.approval!.overall - 2);
  });

  it('response reaches the newspaper and social feed once, and survives save/load', () => {
    const n = respond(withScandal(make(), 30), 'press');
    expect(n.newsQueue.filter(s => s.tag === 'scandal' && s.h.includes('Contract leak') && s.sub.includes('press conference'))).toHaveLength(1);
    expect(socialOf(n).reactionFeed.filter(p => p.id.startsWith('response-s1-'))).toHaveLength(2);
    expect(parseCareer(JSON.stringify(n))).toEqual(initializeDocket(n));
    const t = advanceTurn(n).career;
    expect(t.news[0]?.stories.filter(s => s.sub.includes('press conference'))).toHaveLength(1);
  });
});

// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
