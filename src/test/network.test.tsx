import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import {
  answerOffer, band, knownFigures, reachLevel, ensureNetwork, figureOf, filterFigures, FIGURES, hostEvent, HOST_COST, networkAction, networkOf, networkTurn, seedNetwork,
} from '@/lib/game/network';
import type { Result } from '@/lib/game/support';
import { NetworkPanel } from '@/components/game/network-panel';

afterEach(cleanup);
const fresh = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Net Player', party: 'Democrat' }, () => 0.5), money: 50000 });
/** Mechanics tests assume every figure has been met. */
const base = (): Career => { const n = ensureNetwork(fresh()); return { ...n, network: { ...n.network!, figures: n.network!.figures.map(f => ({ ...f, discovered: true })) } }; };
const take = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const setScore = (c: Career, id: string, score: number, extra = {}): Career => { const n = ensureNetwork(c); return { ...n, network: { ...n.network!, figures: n.network!.figures.map(f => f.id === id ? { ...f, score, ...extra } : f) } }; };

describe('relationship bands', () => {
  it.each([[100, 'Trusted Ally'], [80, 'Trusted Ally'], [79, 'Close Friend'], [50, 'Close Friend'], [49, 'Friendly'], [20, 'Friendly'], [19, 'Neutral'], [-19, 'Neutral'], [-20, 'Dislike'], [-49, 'Dislike'], [-50, 'Political Rival'], [-79, 'Political Rival'], [-80, 'Bitter Enemy'], [-100, 'Bitter Enemy']])('%i is %s', (s, label) => {
    expect(band(s).label).toBe(label);
  });
});

describe('seeding and saves', () => {
  it('seeds at least 30 unique figures deterministically', () => {
    const c = base();
    expect(FIGURES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(FIGURES.map(f => f.name)).size).toBe(FIGURES.length);
    expect(seedNetwork(c)).toEqual(seedNetwork(c));
    expect(seedNetwork(c).figures.every(f => f.score >= -100 && f.score <= 100)).toBe(true);
  });
  it('legacy saves without a network load and gain one lazily', () => {
    const legacy = JSON.parse(JSON.stringify(base())); delete legacy.network;
    const c = parseCareer(JSON.stringify(legacy))!;
    expect(c.network ?? null).toBeNull();
    expect(networkOf(c).figures).toHaveLength(FIGURES.length);
  });
  it('network state survives a save round-trip', () => {
    const c = take(networkAction(base(), 'hale', 'meet'));
    expect(parseCareer(JSON.stringify(c))?.network).toEqual(c.network);
  });
  it('filters allies, rivals and tiers', () => {
    const c = setScore(setScore(base(), 'hale', 90), 'crane', -90);
    expect(filterFigures(c, 'allies').some(r => r.st.id === 'hale')).toBe(true);
    expect(filterFigures(c, 'rivals').some(r => r.st.id === 'crane')).toBe(true);
    expect(filterFigures(c, 'leadership').every(r => r.p.tier === 'leadership')).toBe(true);
    expect(filterFigures(c, 'all')).toHaveLength(FIGURES.length);
  });
});

describe('actions', () => {
  it('a private meeting raises the score, costs an action and energy, once per turn', () => {
    const c = setScore(base(), 'hale', 0);
    const n = take(networkAction(c, 'hale', 'meet'));
    expect(figureOf(n, 'hale')!.score).toBeGreaterThan(0);
    expect(n.actions).toBe(c.actions - 15);
    expect(networkAction(n, 'hale', 'meet').ok).toBe(false);
  });
  it('rejects stale revisions so double clicks cannot replay', () => {
    const c = ensureNetwork(base());
    const n = take(networkAction(c, 'hale', 'meet', 0));
    expect(networkAction(n, 'osei', 'meet', 0).ok).toBe(false);
  });
  it('campaign endorsement needs Close Friend (+50)', () => {
    const camp = { ...base(), campaign: { startDate: '2026-01-01', endorsements: [], support: 10, headlines: [], funds: 0, raised: 0, donors: 0, txns: [], party: 'Democrat', title: 'Mayor' } } as unknown as Career;
    expect(networkAction(setScore(camp, 'hale', 40), 'hale', 'request-endorse').ok).toBe(false);
    const n = take(networkAction(setScore(camp, 'hale', 60), 'hale', 'request-endorse'));
    expect(n.campaign!.endorsements).toContainEqual({ group: 'net:hale', candidate: 'Net Player' });
    expect(n.campaign!.support).toBeGreaterThan(10);
  });
  it('funding needs +60 and pays the campaign, not personal cash', () => {
    const camp = { ...base(), campaign: { startDate: '2026-01-01', endorsements: [], support: 10, headlines: [], funds: 0, raised: 0, donors: 0, txns: [], party: 'Democrat', title: 'Mayor' } } as unknown as Career;
    expect(networkAction(setScore(camp, 'hale', 55), 'hale', 'request-funds').ok).toBe(false);
    const n = take(networkAction(setScore(camp, 'hale', 70), 'hale', 'request-funds'));
    expect(n.campaign!.funds).toBeGreaterThan(0); expect(n.money).toBe(camp.money);
  });
  it('recruitment is blocked for own-party figures and limited to once a year', () => {
    const c = setScore(base(), 'crane', 90, { loyalty: 0, satisfaction: 0 });
    expect(networkAction(c, 'hale', 'recruit').ok).toBe(false);
    const n = take(networkAction(c, 'crane', 'recruit'));
    expect(networkAction({ ...n, actions: 75 }, 'crane', 'recruit').ok).toBe(false);
  });
  it('hosting a reception costs cash once per turn and warms non-rivals', () => {
    const c = setScore(base(), 'hale', 0);
    const n = take(hostEvent(c));
    expect(n.money).toBe(c.money - HOST_COST);
    expect(figureOf(n, 'hale')!.score).toBe(3);
    expect(hostEvent(n).ok).toBe(false);
  });
});

describe('turn integration', () => {
  it('processes each quarter once', () => {
    const c = ensureNetwork(base());
    const once = networkTurn(c, '2026-03-31').career;
    expect(networkTurn(once, '2026-03-31').career).toBe(once);
  });
  it('a declined appointment from an ally counts as a broken promise', () => {
    const c = setScore(base(), 'hale', 60, { allied: true });
    const withOffer: Career = { ...c, network: { ...c.network!, offers: [{ id: 'o1', figureId: 'hale', kind: 'appointment', date: '2026-01', text: 'x' }] } };
    const n = take(answerOffer(withOffer, 'o1', false));
    expect(figureOf(n, 'hale')!.score).toBe(45);
    expect(n.network!.offers).toHaveLength(0);
  });
  it('accepting a truce lifts a rival to at least neutral', () => {
    const c = setScore(base(), 'crane', -70);
    const withOffer: Career = { ...c, network: { ...c.network!, offers: [{ id: 't', figureId: 'crane', kind: 'truce', date: '2026-01', text: 'x' }] } };
    expect(figureOf(take(answerOffer(withOffer, 't', true)), 'crane')!.score).toBe(0);
  });
});

describe('Network UI', () => {
  it('opens a profile drawer and triggers a meeting', () => {
    const results: Result[] = [];
    render(<NetworkPanel career={ensureNetwork(base())} onResult={r => results.push(r)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Margaret Hale profile' }));
    fireEvent.click(screen.getByRole('button', { name: /Arrange private meeting/ }));
    expect(results[0]?.ok).toBe(true);
  });
});

describe('gradual discovery', () => {
  it('a new career knows only 3-4 local figures', () => {
    const known = knownFigures(fresh());
    expect(known.length).toBeGreaterThanOrEqual(3);
    expect(known.length).toBeLessThanOrEqual(4);
    expect(known.every(f => reachLevel(f.id) === 1)).toBe(true);
  });
  it('unmet politicians cannot be acted on', () => {
    const c = ensureNetwork(fresh());
    const stranger = networkOf(c).figures.find(f => !f.discovered)!;
    expect(networkAction(c, stranger.id, 'meet').ok).toBe(false);
  });
  it('low reputation never meets national leaders; contacts grow at most one per quarter', () => {
    let c: Career = { ...ensureNetwork(fresh()), reputation: 10 };
    let prev = knownFigures(c).length;
    for (let q = 0; q < 12; q++) {
      const end = `${2030 + Math.floor(q / 4)}-${String((q % 4) * 3 + 3).padStart(2, '0')}-28`;
      c = networkTurn(c, end).career;
      const now = knownFigures(c).length;
      expect(now - prev).toBeLessThanOrEqual(1); prev = now;
    }
    expect(knownFigures(c).every(f => reachLevel(f.id) === 1)).toBe(true);
    expect(prev).toBeGreaterThan(4);
  });
  it('turn offers only come from known contacts', () => {
    let c: Career = ensureNetwork(fresh());
    for (let q = 0; q < 12; q++) c = networkTurn(c, `${2030 + Math.floor(q / 4)}-${String((q % 4) * 3 + 3).padStart(2, '0')}-28`).career;
    const known = new Set(knownFigures(c).map(f => f.id));
    expect(networkOf(c).offers.every(o => known.has(o.figureId))).toBe(true);
  });
});
