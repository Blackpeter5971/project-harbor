import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { advanceTurn as advanceGameTurn } from '@/lib/game/gameplay';
import { approvalDrift, ensureApproval } from '@/lib/game/approval';

const officer = (name = 'Mayor Test', overall = 60): Career => {
  const c = createCareer({ ...defaultDraft, name, party: 'Democrat' });
  const withOffice: Career = {
    ...c,
    publicOffice: true,
    reputation: 50,
    office: { id: 'mayor', title: 'Mayor', jurisdiction: 'Test', since: '2026-01-01', party: 'Democrat', elected: '2025-11-01', termEnd: '2030-01-01', margin: 8 },
  };
  const ensured = ensureApproval(withOffice);
  return { ...ensured, approval: { ...ensured.approval!, overall, party: overall } };
};
const reload = (career: Career) => { const saved = parseCareer(JSON.stringify(career)); if (!saved) throw new Error('Invalid save'); return saved; };

describe('Turn-cycle idempotency & explanatory newsfeed', () => {
  it('applies drift at most once per turn start, even across reloads', () => {
    const c = officer();
    const once = approvalDrift(c, '2026-01-01');
    expect(once.approval?.driftTurn).toBe('2026-01-01');
    expect(approvalDrift(once, '2026-01-01')).toEqual(once);
    expect(approvalDrift(reload(once), '2026-01-01')).toEqual(reload(once));
    const twice = approvalDrift(once, '2026-04-01');
    expect(twice.approval?.driftTurn).toBe('2026-04-01');
  });
  it('advanceTurn does not double-apply drift when re-run or reloaded mid-turn', () => {
    const processed = advanceTurn(officer()).career;
    expect(advanceTurn(processed).career).toEqual(processed);
    expect(advanceTurn(reload(processed)).career).toEqual(reload(processed));
    const history = processed.approval?.history ?? [];
    expect(history.filter(h => h.reason.includes('quiet quarter')).length).toBeLessThanOrEqual(1);
  });
  it('migrates legacy saves without approval fields or driftTurn, preserving unrelated stats', () => {
    const raw = JSON.parse(JSON.stringify(officer()));
    delete raw.approval;
    raw.money = 4321;
    raw.age = 44;
    const loaded = parseCareer(JSON.stringify(raw));
    expect(loaded?.approval ?? null).toBeNull();
    expect(loaded?.money).toBe(4321);
    expect(loaded?.age).toBe(44);
    expect(loaded?.office?.title).toBe('Mayor');
    const ensured = ensureApproval(loaded!);
    expect(ensured.approval?.overall).toBeGreaterThan(0);
    expect(ensured.approval?.driftTurn).toBe('');
    expect(ensured.money).toBe(4321);
    // Older approval objects lacking driftTurn parse with a safe default.
    const raw2 = JSON.parse(JSON.stringify(officer()));
    delete raw2.approval.driftTurn;
    const loaded2 = parseCareer(JSON.stringify(raw2));
    expect(loaded2?.approval?.driftTurn).toBe('');
    expect(loaded2?.approval?.overall).toBe(raw2.approval.overall);
  });
  it('queues an explanatory story for noticeable swings (|Δ| ≥ 2) with causes from history', () => {
    // A quiet officeholder far above baseline drifts down; find a seed where the economy also dips.
    let processed: Career | null = null;
    for (let i = 0; i < 60 && !processed; i++) {
      const c = officer(`Swing ${i}`, 80);
      const p = advanceTurn(c).career;
      if (p.news[0]?.stories.some(s => s.h.includes('approval'))) processed = p;
    }
    expect(processed).not.toBeNull();
    const story = processed!.news[0]!.stories.find(s => s.h.includes('approval'))!;
    expect(story.body.length).toBeGreaterThan(0);
    expect(story.body).toMatch(/quiet quarter|economy|scandal/i);
    expect(story.tag).toBe('government');
  });
  it('does not queue a story for sub-threshold movement', () => {
    // Approval exactly at the mayor baseline with a neutral economy seed: drift step rounds to ~0.
    let quiet: Career | null = null;
    for (let i = 0; i < 60 && !quiet; i++) {
      const c = officer(`Calm ${i}`, 50);
      const p = advanceTurn(c).career;
      const delta = Math.abs((p.approval?.overall ?? 50) - 50);
      if (delta < 2) quiet = p;
    }
    expect(quiet).not.toBeNull();
    expect(quiet!.news[0]?.stories.some(s => s.h.includes('approval')) ?? false).toBe(false);
  });
});

// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
