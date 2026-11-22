import { describe, it, expect } from 'vitest';
import { createCareer, defaultDraft, parseCareer, BACKGROUND_CONFIG } from '@/lib/game/career';
import { advanceTurn } from '@/lib/game/gameplay';

const make = (background: typeof defaultDraft.background) => createCareer({ ...defaultDraft, name: 'Ada', background });

describe('starting backgrounds', () => {
  it('Nobody starts with nothing', () => {
    const c = make('Nobody');
    expect([c.money, c.reputation, c.experience, c.relationships]).toEqual([0, 0, 0, 0]);
  });
  it.each([
    ['Working-Class Family', 10_000, 5, 0, 1],
    ['Self-Made', 20_000, 10, 5, 2],
    ['Wealthy Family', 50_000, 20, 5, 4],
    ['Political Dynasty', 100_000, 40, 20, 8],
  ] as const)('%s gets configured stats', (bg, cash, rep, exp, rel) => {
    const c = make(bg);
    expect([c.money, c.reputation, c.experience, c.relationships]).toEqual([cash, rep, exp, rel]);
  });
  it('config difficulties match', () => {
    expect(BACKGROUND_CONFIG.nobody.difficulty).toBe('Very Hard');
    expect(BACKGROUND_CONFIG.dynasty.difficulty).toBe('Very Easy');
  });
  it('reload does not re-add bonuses and keeps existing values', () => {
    const c = { ...make('Wealthy Family'), money: 123, reputation: 7, experience: 3, date: '2030-04-01' };
    const r = parseCareer(JSON.stringify(c))!;
    expect([r.money, r.reputation, r.experience, r.date]).toEqual([123, 7, 3, '2030-04-01']);
  });
  it('advancing a turn never adds starting cash again', () => {
    const c = { ...make('Political Dynasty'), money: 0 };
    const next = advanceTurn(c).career;
    expect(next.money).toBeLessThan(100_000);
    expect(next.reputation).toBeLessThan(80);
  });
  it('personal cash is isolated from campaign and government', () => {
    const c = make('Political Dynasty');
    expect(c.warChest).toBe(0);
    expect(c.campaign).toBeNull();
    expect(c.treasury).toBeNull();
    expect(c.budget).toBeNull();
  });
});
