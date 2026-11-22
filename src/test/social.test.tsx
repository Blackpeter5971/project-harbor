import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { SocialPanel } from '@/components/game/social-panel';
import { LifeView } from '@/components/game/life-view';
import { contactFrom, archetypeById, type SocialState } from '@/lib/game/relationships';
import { relationshipTier } from '@/lib/game/social';

afterEach(cleanup);
const make = (bg: Career['character']['background'], over: Partial<Career> = {}): Career => ({ ...createCareer({ ...defaultDraft, name: 'S', background: bg }), ...over });
const withSocial = (c: Career, social: Partial<SocialState>): Career => ({ ...c, life: { ...c.life!, social: { ...c.life!.social!, ...social } } });
const partner = { ...contactFrom(archetypeById('romantic')!, { affinity: 72 }), weddingDate: null, sharedMonthlyExpenses: 400 };

describe('Circle & Family', () => {
  it('single players see the open-to-romance badge and a meet-people button', () => {
    render(<SocialPanel career={make('Nobody')} />);
    const hero = screen.getByRole('region', { name: 'Family & partner' });
    expect(within(hero).getByTestId('marital-status').textContent).toBe('Single · Open to Romance');
    expect(within(hero).queryByRole('button', { name: /Meet New People/ })).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Party & Social Events' })).getByRole('button', { name: /Private Party/ })).toBeTruthy();
    expect(screen.queryByText('Your partner')).toBeNull();
  });

  it('dating and married players see the partner portrait and affinity; married shows the $500 household cost', () => {
    for (const status of ['dating', 'married'] as const) {
      render(<SocialPanel career={withSocial(make('Nobody'), { maritalStatus: status, partner })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Family' }));
      const hero = screen.getAllByRole('region', { name: 'Family & partner' })[0]!;
      expect(within(hero).getByRole('img', { name: 'Julian Hart' }).getAttribute('src')).toBe('/images/characters/romantic.jpg');
      expect(within(hero).getByTestId('marital-status').textContent).toBe(status === 'dating' ? 'Dating' : 'Married');
      expect(within(hero).getByRole('meter', { name: 'Partner affinity' }).getAttribute('aria-valuenow')).toBe('72');
      if (status === 'married') expect(within(hero).getByTestId('family-allowance').textContent).toBe('$500/quarter');
      else expect(within(hero).queryByTestId('family-allowance')).toBeNull();
      cleanup();
    }
  });

  it('dependents show age and quarterly support cost', () => {
    render(<SocialPanel career={withSocial(make('Nobody'), { dependents: [{ id: 'k1', name: 'Ava', age: 6, supportCost: 500 }, { id: 'k2', name: 'Leo', age: 15, supportCost: 800 }] })} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Family' }));
    const ava = screen.getByLabelText('Ava');
    expect(within(ava).getByText('Age 6')).toBeTruthy();
    expect(within(ava).getByText('$600')).toBeTruthy();
    expect(within(ava).getByRole('img').getAttribute('src')).toBe('/images/characters/child-young.jpg');
    expect(within(screen.getByLabelText('Leo')).getByRole('img').getAttribute('src')).toBe('/images/characters/child-teen.jpg');
    expect(screen.getByTestId('dependents-total').textContent).toBe('$1,200/quarter');
  });

  it('contact directory shows portraits, affinity and tiers; family tab lists relatives', () => {
    render(<SocialPanel career={make('Political Dynasty')} />);
    const daniel = screen.getByRole('article', { name: 'Daniel Reyes' });
    expect(within(daniel).getByRole('img').getAttribute('src')).toBe('/images/characters/confidant.jpg');
    expect(within(daniel).getByRole('meter').getAttribute('aria-valuenow')).toBe('60');
    expect(within(daniel).getByTestId('contact-tier').textContent).toBe('Close Friend');
    expect(within(daniel).getByRole('button', { name: 'Coffee Chat · $50' })).toBeTruthy();
    expect(within(daniel).getByRole('button', { name: 'Formal Dinner · $250' })).toBeTruthy();
    expect(within(daniel).getByRole('button', { name: 'Thoughtful Gift · $500' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Emily' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Family' }));
    expect(within(screen.getByRole('article', { name: 'Emily' })).getByRole('img').getAttribute('src')).toBe('/images/characters/sibling.jpg');
  });

  it('tiers and actions follow affinity and contact type', () => {
    expect(relationshipTier({ affinity: 40 })).toBe('Acquaintance');
    expect(relationshipTier({ affinity: 55 })).toBe('Close Friend');
    expect(relationshipTier({ affinity: 80 })).toBe('Confidant');
    expect(relationshipTier({ affinity: 10 }, true)).toBe('Partner');
  });

  it('buttons follow personal cash only, and a click sends the result', () => {
    const seen: string[] = [];
    render(<SocialPanel career={make('Self-Made', { money: 250, warChest: 900_000 })} onResult={r => seen.push(r.message)} />);
    expect(screen.getByTestId('social-cash').textContent).toBe('$250');
    expect(screen.queryByText(/900,000/)).toBeNull();
    const daniel = screen.getByRole('article', { name: 'Daniel Reyes' });
    expect((within(daniel).getByRole('button', { name: 'Thoughtful Gift · $500' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(daniel).getByText('Gift: You need $250 more in personal cash.')).toBeTruthy();
    fireEvent.click(within(daniel).getByRole('button', { name: 'Coffee Chat · $50' }));
    expect(seen[0]).toMatch(/Coffee Chat with Daniel Reyes for \$50/);
  });

  it('without a handler every button is disabled', () => {
    render(<SocialPanel career={make('Self-Made', { money: 50_000 })} />);
    for (const b of screen.getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('engaged players see wedding budgets; dating players see the proposal checklist', () => {
    render(<SocialPanel career={withSocial(make('Nobody', { money: 12_000 }), { maritalStatus: 'engaged', partner })} onResult={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Family' }));
    expect((screen.getByRole('button', { name: 'Courthouse Ceremony · $2,000' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Grand Celebration · $25,000' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<SocialPanel career={withSocial(make('Nobody', { money: 12_000 }), { maritalStatus: 'dating', partner })} onResult={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Family' }));
    expect((screen.getByRole('button', { name: 'Propose Marriage' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/90% affinity with Julian Hart/)).toBeTruthy();
  });

  it('opens from the Life menu and returns back', () => {
    render(<LifeView career={make('Working-Class Family')} />);
    fireEvent.click(screen.getByRole('button', { name: /Circle & Family/ }));
    expect(screen.getByRole('region', { name: 'Family & partner' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Life/ }));
    expect(screen.getByRole('button', { name: /Garage & Assets/ })).toBeTruthy();
  });
  it('family members and dependents appear only under the Family tab', () => {
    render(<SocialPanel career={withSocial(make('Nobody'), { dependents: [{ id: 'k1', name: 'Ava', age: 6, supportCost: 500 }] })} />);
    expect(screen.queryByRole('region', { name: 'Family dashboard' })).toBeNull();
    expect(screen.queryByLabelText('Ava')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Family' }));
    expect(screen.getByRole('region', { name: 'Family dashboard' })).toBeTruthy();
    expect(screen.getByLabelText('Ava')).toBeTruthy();
  });
});
