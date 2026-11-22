import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { registerScandal, scandalsTurn, activeScandals, closeScandals } from '@/lib/game/scandals';
import { respondToScandal, scandalFalloutTurn } from '@/lib/game/scandal-responses';
import { clearHistory } from '@/lib/game/history';

const base = () => ({ ...createCareer({ ...defaultDraft, name: 'Ada', background: 'Self-Made', party: 'Democrat' }, () => 0), date: '2027-01-01', money: 100000 });
const add = (c: ReturnType<typeof base>, id: string, trigger: 'corruption' | 'business' | 'project' = 'corruption', evidence = 40) =>
  registerScandal(c, { id, title: `Case ${id}`, summary: `Allegation ${id}.`, source: 'Whistleblower', severity: 'Moderate', evidence, trigger });

describe('scrutiny case consolidation', () => {
  it('bundles related corruption allegations within close quarters into one case', () => {
    let c = add(base(), 'a'); c = add(c, 'b', 'business'); c = add({ ...c, date: '2027-04-01' }, 'c');
    expect(c.scandals).toHaveLength(1);
    expect(c.scandals[0]!.related).toEqual(['b', 'c']);
    expect(c.newsQueue.filter(s => s.tag === 'scandal')).toHaveLength(1);
    expect(add(c, 'b').scandals[0]!.related).toEqual(['b', 'c']); // replay safe
  });
  it('opens a new case for unrelated or distant allegations', () => {
    let c = add(base(), 'a'); c = add(c, 'p', 'project'); c = add({ ...c, date: '2028-01-01' }, 'late');
    expect(c.scandals).toHaveLength(3);
  });
  it('resolving the case stops quarterly fallout notices and keeps the historical record', () => {
    let c = add(add(base(), 'a', 'corruption', 80), 'b');
    const settled = (['audit', 'press', 'settle', 'deny'] as const).map(id => respondToScandal({ ...c, reputation: 90 }, 'a', id)).find(r => r.ok && r.career.scandals[0]!.resolution !== 'backfired');
    if (!settled?.ok) throw new Error('no clean resolution available');
    c = settled.career;
    let n = c, notices: string[] = [];
    for (const [s, e] of [['2027-01-01', '2027-04-01'], ['2027-04-01', '2027-07-01'], ['2027-07-01', '2027-10-01']]) {
      const t = scandalsTurn(n, s!, e!); const f = scandalFalloutTurn(t.career, e!); n = f.career; notices.push(...t.notices, ...f.notices);
    }
    expect(notices).toEqual([]);
    expect(activeScandals(n)).toHaveLength(0);
    expect(n.scandals[0]!.closedAt).not.toBe('');
    expect(parseCareer(JSON.stringify(n))?.scandals[0]?.related).toEqual(['b']);
  });
  it('a trial verdict closes open cases as historical', () => {
    const c = closeScandals(add(base(), 'a', 'corruption', 80), '2027-04-01', 'Charges dismissed in court.');
    expect(c.scandals[0]!.phase).toBe('Managed');
    expect(scandalFalloutTurn(c, '2027-07-01').notices).toEqual([]);
  });
});
describe('clear history', () => {
  it('clears selected notifications and old news but keeps the latest edition and permanent records', () => {
    const c = { ...base(), log: ['a', 'b', 'c'], news: [{ id: '1', date: '2027-01-01', paper: 'P', stories: [] }, { id: '0', date: '2026-10-01', paper: 'P', stories: [] }], elections: [], ledger: [{ month: '2027-01-01', label: 'x', amount: 1 }] };
    expect(clearHistory(c, 'notifications', [0, 2]).log).toEqual(['b']);
    const n = clearHistory(c, 'news', [0, 1]);
    expect(n.news.map(e => e.id)).toEqual(['1']);
    expect(n.ledger).toEqual(c.ledger);
  });
});
