import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { concludeDeath } from '@/lib/game/mortality';
import { socialOf } from '@/lib/game/relationships';
import { EndgameSequence, RetirementDecision } from '@/components/game/legacy-panel';

const family = (): Career => {
  const c = { ...createCareer({ ...defaultDraft, name: 'Ada Stone' }, () => 0.5), date: '2030-01-01', age: 82 };
  return { ...c, life: { ...c.life!, social: { ...socialOf(c), dependents: [{ id: 'kid-a', name: 'Eli Stone', age: 30, supportCost: 0 }, { id: 'kid-b', name: 'Mia Stone', age: 16, supportCost: 0 }] } } };
};

describe('EndgameSequence', () => {
  it('walks memorial, achievements and adult heirs', () => {
    const onResult = vi.fn();
    const dead = concludeDeath(family(), 'Natural causes in advanced age');
    render(<EndgameSequence career={dead} onResult={onResult} onNew={() => {}} onMenu={() => {}} onContinue={() => {}} />);
    expect(screen.getByText(/In memoriam · 1 of 3/)).toBeTruthy();
    expect(screen.getByText('Natural causes in advanced age')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText(/\/ 1,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
    expect(screen.getByText('Eli Stone · age 30')).toBeTruthy();
    expect(screen.queryByText(/Mia Stone/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Continue personal life/ })).toBeNull();
    fireEvent.click(screen.getByText('Eli Stone · age 30'));
    expect(onResult.mock.calls[0]?.[0]).toMatchObject({ ok: true });
  });
});

describe('RetirementDecision', () => {
  it('confirms retirement through a dialog', () => {
    const onResult = vi.fn();
    render(<RetirementDecision career={family()} onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: /Retire from politics/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm retirement' }));
    expect(onResult.mock.calls[0]?.[0]).toMatchObject({ ok: true });
  });
});
