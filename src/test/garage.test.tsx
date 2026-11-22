import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { GaragePanel } from '@/components/game/garage-panel';

afterEach(cleanup);
const make = (bg: Career['character']['background'], over: Partial<Career> = {}): Career => ({ ...createCareer({ ...defaultDraft, name: 'G', background: bg }), ...over });

describe('Garage & Assets', () => {
  it('hero shows the active vehicle', () => {
    render(<GaragePanel career={make('Wealthy Family')} />);
    const hero = screen.getByRole('region', { name: 'Current vehicle' });
    expect(within(hero).getByRole('img').getAttribute('src')).toBe('/images/life/vehicle-suv.jpg');
    expect(within(hero).getByText('Daily Driver')).toBeTruthy();
    expect(screen.getByTestId('garage-upkeep').textContent).toBe('$1,050');
  });
  it('shows public transit when no car, in storage when car inactive', () => {
    render(<GaragePanel career={make('Nobody')} />);
    expect(within(screen.getByRole('region', { name: 'Current vehicle' })).getByText('Public Transit')).toBeTruthy();
    cleanup();
    const c = make('Political Dynasty');
    render(<GaragePanel career={{ ...c, life: { ...c.life!, activeVehicleId: null } }} />);
    expect(screen.getByText('In Storage')).toBeTruthy();
  });
  it('dealership shows prices, images and upkeep', () => {
    render(<GaragePanel career={make('Nobody', { money: 0 })} />);
    const suv = screen.getByRole('article', { name: 'Mid-Size Executive SUV' });
    expect(within(suv).getByRole('img').getAttribute('src')).toBe('/images/life/vehicle-suv.jpg');
    expect(within(suv).getByText('$28,000')).toBeTruthy();
    expect(within(suv).getByText('$350/mo')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Luxury Armored Sedan' })).getByText('+5% Campaign Mobility')).toBeTruthy();
  });
  it('disables purchases below the price and enables at it', () => {
    render(<GaragePanel career={make('Nobody', { money: 4500 })} onResult={() => {}} />);
    expect((within(screen.getByRole('article', { name: 'Used Economy Sedan' })).getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    const suv = within(screen.getByRole('article', { name: 'Mid-Size Executive SUV' }));
    expect((suv.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    expect(suv.getByText('You need $23,500 more in personal cash.')).toBeTruthy();
  });
  it('uses only personal cash, never campaign or treasury funds', () => {
    const c = make('Nobody', { money: 100, warChest: 1_000_000 });
    render(<GaragePanel career={c} />);
    expect(screen.getByTestId('garage-cash').textContent).toBe('$100');
    expect(screen.queryByText(/1,000,000/)).toBeNull();
    expect(screen.queryByText(/campaign fund|treasury|war chest/i)).toBeNull();
    expect((within(screen.getByRole('article', { name: 'Used Economy Sedan' })).getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
  it('possession shelf shows Owned / Buy', () => {
    const c = make('Nobody', { money: 0 });
    render(<GaragePanel career={{ ...c, life: { ...c.life!, possessions: [{ id: 'a', itemId: 'tailored_suit', purchaseDate: '' }] } }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Wardrobe & Possessions' }));
    expect(within(screen.getByRole('article', { name: 'Tailored Suit' })).getByText('Owned')).toBeTruthy();
    expect(within(screen.getByRole('article', { name: 'Executive Watch' })).getByText('Buy')).toBeTruthy();
  });
});
