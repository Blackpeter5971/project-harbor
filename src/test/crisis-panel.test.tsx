import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrisisPanel } from '@/components/game/crisis-panel';
import { EventModal } from '@/components/game/event-modal';
import { crisisCareer } from './crisis-fixture';

afterEach(cleanup);
describe('Crisis decision presentation and confirmation', () => {
  it('offers four responses and requires confirmation before any payment', () => {
    const onResult = vi.fn();
    render(<CrisisPanel career={crisisCareer()} onResult={onResult} />);
    for (const name of [/High-investment intervention/, /Targeted assistance/, /Fiscal restraint/, /Oversight \/ negotiations/]) expect(screen.getByRole('button', { name })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /High-investment intervention/ }));
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Back to responses/ }));
    expect(onResult).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows exact unaffordable costs and does not submit disabled responses', () => {
    const c = crisisCareer(); if (!c.treasury) throw new Error('Missing treasury'); const onResult = vi.fn();
    render(<CrisisPanel career={{ ...c, treasury: { ...c.treasury, balance: 18000 } }} onResult={onResult} />);
    const high = screen.getByRole('button', { name: /High-investment intervention/ });
    expect(high).toBeDisabled(); expect(screen.getByRole('button', { name: /Targeted assistance/ })).toBeDisabled();
    expect(screen.getByText('$400,000 required; $18,000 available in government treasury.')).toBeVisible();
    fireEvent.click(high); expect(onResult).not.toHaveBeenCalled();
  });
  it('confirms against the latest career and debits once even for same-tick duplicate clicks', () => {
    const c = crisisCareer(), onResult = vi.fn(); render(<CrisisPanel career={c} onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: /High-investment intervention/ }));
    const confirm = screen.getByRole('button', { name: /Confirm · \$400,000/ });
    act(() => { confirm.click(); confirm.click(); });
    const successes = onResult.mock.calls.filter(([r]) => r.ok);
    expect(successes).toHaveLength(1);
    expect(successes[0]?.[0].career.treasury.balance).toBe((c.treasury?.balance ?? 0) - 400000);
    expect(successes[0]?.[0].career.crises[0].selectedResponseId).toBe('invest');
  });
  it('rechecks funds changed while confirmation is open', () => {
    const c = crisisCareer(); if (!c.treasury) throw new Error('Missing treasury'); const onResult = vi.fn();
    const { rerender } = render(<CrisisPanel career={c} onResult={onResult} />);
    fireEvent.click(screen.getByRole('button', { name: /High-investment intervention/ }));
    rerender(<CrisisPanel career={{ ...c, treasury: { ...c.treasury, balance: 0 } }} onResult={onResult} />);
    expect(screen.getByRole('button', { name: /Confirm · \$400,000/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Confirm · \$400,000/ })); expect(onResult).not.toHaveBeenCalled();
  });
  it('hides response choices after selection and filters unheld/foreign offices', () => {
    const c = crisisCareer(); if (!c.crises[0]) throw new Error('Missing crisis');
    const { rerender } = render(<CrisisPanel career={{ ...c, crises: [{ ...c.crises[0], selectedResponseId: 'delay', trajectory: 'prolonged' }] }} onResult={() => {}} />);
    expect(screen.queryAllByRole('button').filter((b) => !b.classList.contains('ad-offer'))).toHaveLength(0);
    rerender(<CrisisPanel career={{ ...c, office: null }} onResult={() => {}} />); expect(screen.queryByText('Crisis response')).toBeNull();
    rerender(<CrisisPanel career={{ ...c, crises: [{ ...c.crises[0], tenure: 'other' }] }} onResult={() => {}} />); expect(screen.queryByText('Crisis response')).toBeNull();
  });
  it('focuses and cycles only enabled modal choices', () => {
    render(<EventModal event={{ id: 'focus', title: 'Response', text: 'Funding unavailable', parties: [], choices: [{ id: 'disabled', label: 'Unaffordable', hint: '', disabled: true }, { id: 'delay', label: 'Delay', hint: '' }, { id: 'back', label: 'Back', hint: '' }] }} onChoose={() => {}} />);
    const delay = screen.getByRole('button', { name: 'Delay' }), back = screen.getByRole('button', { name: 'Back' });
    expect(delay).toHaveFocus(); fireEvent.keyDown(delay, { key: 'Tab', shiftKey: true }); expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: 'Tab' }); expect(delay).toHaveFocus();
  });
});