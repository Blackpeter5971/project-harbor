import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CareerView } from '@/components/game/career-view';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';

const noop = () => {};
const props = { setSection: noop, onMenu: noop, onSave: noop, onSettings: noop, saved: true, onUpdate: noop, onPoliticalActivity: noop, onNotice: noop, onAdvance: noop };
const career = (): Career => createCareer({ ...defaultDraft, name: 'Ada' }, () => 0);

describe('Media navigation', () => {
  it('is no longer a Politics category', () => {
    render(<CareerView {...props} career={career()} section="Politics" />);
    expect(screen.queryByRole('button', { name: 'Media Hub' })).toBeNull();
  });
  it('opens each media app on its own without channel tabs', () => {
    render(<CareerView {...props} career={career()} section="Media" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open TV' }));
    expect(screen.getByRole('heading', { name: 'Stations' })).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Media channels' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to home screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open S' }));
    expect(screen.getByRole('navigation', { name: 'S navigation' })).toBeTruthy();
  });
});
