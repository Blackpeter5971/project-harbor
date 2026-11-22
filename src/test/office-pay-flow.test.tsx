import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createCareer as createFreshCareer, defaultDraft, parseCareer, SAVE_KEY } from '@/lib/game/career';
// Legacy fixtures assume a zero-resource start; background bonuses are covered in character-backgrounds.test.ts.
const createCareer = (d: Parameters<typeof createFreshCareer>[0]) => ({ ...createFreshCareer(d), money: 0, reputation: 0, experience: 0, relationships: 0 });
import { Game } from '@/components/game/game';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));

// Salary/campaign accounting checks run rent-free; turn rent is covered in housing.test.ts.
vi.mock('@/lib/game/housing', async orig => ({ ...(await orig<typeof import('@/lib/game/housing')>()), collectRent: (career: unknown) => ({ career, notice: null, evicted: false }) }));
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));


afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });
it('settles office salary during loading and keeps it unchanged through report continuation and reload', async () => {
  vi.useFakeTimers();
  const c = { ...createCareer({ ...defaultDraft, name: 'Office Payroll' }), date: '2028-01-01', publicOffice: true, office: { id: 'council', title: 'City Council Member', jurisdiction: 'Sacramento Ward 1', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', party: 'Independent', margin: 5 } };
  localStorage.setItem(SAVE_KEY, JSON.stringify(c));
  render(<Game />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
  await act(async () => { vi.advanceTimersByTime(1501); });
  expect(parseCareer(localStorage.getItem(SAVE_KEY))?.money).toBe(9000);
  expect(parseCareer(localStorage.getItem(SAVE_KEY))?.officePayHistory).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  const saved = parseCareer(localStorage.getItem(SAVE_KEY));
  expect(saved?.money).toBe(9000);
  expect(saved?.date).toBe('2028-04-01');
  expect(saved?.actions).toBe(100);
  cleanup();
  render(<Game />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(parseCareer(localStorage.getItem(SAVE_KEY))?.officePayHistory).toHaveLength(3);
  expect(parseCareer(localStorage.getItem(SAVE_KEY))?.ledger).toEqual(saved?.ledger);
});