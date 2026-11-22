import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { answerAssist, ensureNetwork, networkOf, networkTurn } from '@/lib/game/network';

const fresh = (): Career => ensureNetwork({ ...createCareer({ ...defaultDraft, name: 'Assist Player', party: 'Democrat' }, () => 0.5), money: 50000 });
function quarters(c0: Career, n: number) {
  let c = c0; const seen: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = 2025 + Math.floor(i / 4), m = String(((i % 4) * 3) + 3).padStart(2, '0');
    const known = new Set(networkOf(c).figures.filter(f => f.discovered).map(f => f.id));
    c = networkTurn({ ...c, date: `${y}-${m}-01` }, `${y}-${m}-28`).career;
    for (const o of networkOf(c).offers) if (o.kind === 'assist') { seen.push(o.id); expect(known.has(o.figureId)).toBe(true); }
  }
  return { c, seen };
}
const withRequest = (stakes: number) => {
  const c = fresh(), f = networkOf(c).figures.find(x => x.discovered)!;
  const net = networkOf(c);
  return { f, c: { ...c, actions: 45, network: { ...net, offers: [{ id: 'r1', figureId: f.id, kind: 'assist' as const, date: c.date.slice(0, 7), text: 'help', stakes }] } } };
};

describe('assistance requests', () => {
  it('only come from politicians the player has met', () => {
    expect(quarters(fresh(), 24).seen.length).toBeGreaterThan(0);
  });
  it('full support costs 2 actions on a stakes-2 ask and raises the relationship by 20', () => {
    const { c, f } = withRequest(2); const r = answerAssist(c, 'r1', 'full');
    expect(r.ok && r.career.actions).toBe(15);
    expect(r.ok && networkOf(r.career).figures.find(x => x.id === f.id)!.score).toBe(Math.min(100, f.score + 20));
  });
  it('limited help is free; polite refusal of a stakes-3 ask costs 6', () => {
    const a = withRequest(3); const lim = answerAssist(a.c, 'r1', 'limited');
    expect(lim.ok && lim.career.actions).toBe(45);
    const ref = answerAssist(a.c, 'r1', 'refuse');
    expect(ref.ok && networkOf(ref.career).figures.find(x => x.id === a.f.id)!.score).toBe(Math.max(-100, a.f.score - 6));
  });
  it('asking for a return favor adds loyalty and the request cannot be answered twice', () => {
    const { c, f } = withRequest(1); const r = answerAssist(c, 'r1', 'bargain');
    expect(r.ok && networkOf(r.career).figures.find(x => x.id === f.id)!.loyalty).toBe(Math.min(100, f.loyalty + 4));
    expect(r.ok && answerAssist(r.career, 'r1', 'full').ok).toBe(false);
  });
});
