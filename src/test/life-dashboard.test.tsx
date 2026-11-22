import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { affordability, moveInCost } from '@/lib/game/housing';
import { HousingPanel as LifeView } from '@/components/game/life-view';

afterEach(cleanup);

const make = (over: Partial<Career> = {}): Career => ({ ...createCareer({ ...defaultDraft, name: 'Life Test' }), ...over });

describe('Life dashboard', () => {
  it('shows the active residence in the hero card', () => {
    const c = make({ money: 500 });
    render(<LifeView career={c} />);
    const hero = screen.getByRole('region', { name: 'Current home' });
    const id = c.housing!.currentPropertyId;
    expect(within(hero).getByRole('img').getAttribute('src')).toBe(`/images/housing/${id}.jpg`);
    expect(within(hero).getByText(c.housing!.status === 'owning' ? 'Owned' : 'Renting')).toBeTruthy();
  });

  it('shows an arrears warning when rent is unpaid', () => {
    const c = make();
    render(<LifeView career={{ ...c, housing: { ...c.housing!, arrears: 300 } }} />);
    expect(screen.getByRole('alert').textContent).toContain('$300');
  });

  it('renders property prices and image paths', () => {
    render(<LifeView career={make({ money: 0 })} />);
    const condo = screen.getByRole('article', { name: 'Modern Downtown Condo' });
    expect(within(condo).getByRole('img').getAttribute('src')).toBe('/images/housing/condo.jpg');
    expect(within(condo).getByText('$3,600 for 3 months', { exact: false })).toBeTruthy();
    expect(within(condo).getByRole('button', { name: 'Purchase for $320,000' })).toBeTruthy();
  });

  it('move-in costs three months of rent', () => {
    expect(moveInCost(450)).toBe(1350);
  });

  it('disables actions with the shortfall when personal cash is too low', () => {
    render(<LifeView career={make({ money: 1000 })} />);
    const apt = screen.getByRole('article', { name: 'Modest Suburban Apartment' });
    expect((within(apt).getByRole('button', { name: 'Rent for $450/mo' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(apt).getByText('You need $350 more in personal cash.')).toBeTruthy();
  });

  it('enables rent when personal cash covers move-in', () => {
    render(<LifeView career={make({ money: 1350 })} />);
    const apt = screen.getByRole('article', { name: 'Modest Suburban Apartment' });
    expect((within(apt).getByRole('button', { name: 'Rent for $450/mo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('never counts campaign funds or government treasury as personal cash', () => {
    const c = make({ money: 100, warChest: 5_000_000, treasury: { tenure: 't', balance: 9_000_000, lastProcessedEnd: '', transactions: [] } });
    render(<LifeView career={c} />);
    expect(screen.getByTestId('personal-cash').textContent).toBe('$100');
    const estate = screen.getByRole('article', { name: 'Luxury Estate' });
    expect((within(estate).getByRole('button', { name: 'Purchase for $2,500,000' }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).not.toMatch(/\$5,000,000|\$9,000,000/);
    expect(affordability(100, 200)).toEqual({ required: 200, affordable: false, shortfall: 100 });
  });
});
