import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { corruptionSchema } from '@/lib/game/corruption-schema';
import { legalCaseSchema, legalSchema } from '@/lib/game/legal-schema';
import { legalOf, legalTurn } from '@/lib/game/legal';
import { advanceTurn, doActivity, continueTurnReport, continueAfterNewspaper } from '@/lib/game/gameplay';
import { isIncarcerated, remainingTurns } from '@/lib/game/prison';
import { CareerView } from '@/components/game/career-view';

const office = { id: 'mayor', title: 'Mayor', jurisdiction: 'Testville', party: 'Democrat', since: '2026-01-01', elected: '2025-11-01', termEnd: '2030-01-01', margin: 5 } as Career['office'];
/** A sitting mayor at a felony trial on 2026-04-01 — Phase 6B conviction path. */
function convicted(): Career {
  const k = legalCaseSchema.parse({ id: 'case|t', opened: '2025-01-01', stage: 'indicted', strength: 95, defense: 0, role: 'official', stageSince: '2026-01-01', trial: { courtDate: '2026-04-01', tier: 'high_felony', charges: ['Embezzlement'], strategy: null, verdict: null } });
  const base = createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);
  const c: Career = { ...base, date: '2026-01-01', office, publicOffice: true, corruption: corruptionSchema.parse({ exposure: 60, txns: [{ id: 'e', date: '2026-01-01', amount: 50_000, kind: 'embezzlement', source: 'X', destination: 'personal', favor: '', risk: 'High', evidence: 20 }] }), legal: legalSchema.parse({ cases: [k] }) };
  return legalTurn(c, '2026-04-01').career;
}
const settle = (c: Career) => { let n = continueTurnReport(c); if (n.newspaperPending) n = continueAfterNewspaper(n); return n; };

describe('Phase 7A prison mode', () => {
  it('a conviction with a prison sentence sends the player to prison and vacates the office', () => {
    const n = convicted();
    expect(isIncarcerated(n)).toBe(true);
    expect(n.office).toBeNull();
    expect(n.campaign).toBeNull();
    expect(legalOf(n).prison?.succession).toContain('sworn in as Mayor');
  });

  it('political activities are refused while in prison', () => {
    const n = { ...convicted(), date: '2026-04-01' };
    const r = doActivity(n, 'community', n.politicalActivityRevision);
    expect(r.ok).toBe(false);
  });

  it('a prison turn serves one quarter, rolls no events and survives a reload', () => {
    const n = { ...convicted(), date: '2026-04-01' };
    const p0 = legalOf(n).prison!;
    const t = settle(advanceTurn(n).career);
    const p1 = legalOf(t).prison!;
    expect(p1.served).toBe(p0.served + 1);
    expect(t.pendingEvent).toBeNull();
    expect(t.date).toBe('2026-07-01');
    const reloaded = parseCareer(JSON.stringify(t))!;
    expect(isIncarcerated(reloaded)).toBe(true);
    expect(remainingTurns(legalOf(reloaded).prison!)).toBe(remainingTurns(p1));
  });

  it('locks the political tabs and shows the prison dashboard', () => {
    const n = { ...convicted(), date: '2026-04-01' };
    const noop = () => {};
    const { rerender } = render(<CareerView career={n} section="Home" setSection={noop} onMenu={noop} onSave={noop} onSettings={noop} saved onUpdate={noop} onPoliticalActivity={noop} onNotice={noop} onAdvance={noop} />);
    expect(screen.getByLabelText('Prison dashboard')).toBeTruthy();
    expect(screen.getByLabelText('Prison reputation')).toBeTruthy();
    rerender(<CareerView career={n} section="Politics" setSection={noop} onMenu={noop} onSave={noop} onSettings={noop} saved onUpdate={noop} onPoliticalActivity={noop} onNotice={noop} onAdvance={noop} />);
    expect(screen.getByText(/You are incarcerated/)).toBeTruthy();
  });
});
