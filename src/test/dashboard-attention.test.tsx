import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createCareer, defaultDraft, type Career } from '@/lib/game/career';
import { socialMediaSchema } from '@/lib/game/social-media';
import { dashboardAlerts } from '@/components/game/dashboard-attention';
import { CareerView, type Section } from '@/components/game/career-view';

afterEach(cleanup);
const base = () => createCareer({ ...defaultDraft, name: 'Alert Player' });
function Harness({ career, onUpdate = vi.fn() }: { career: Career; onUpdate?: (c: Career) => void }) {
  const [section, setSection] = useState<Section>('Home');
  return <CareerView career={career} section={section} setSection={setSection} onMenu={vi.fn()} onSave={vi.fn()} onSettings={vi.fn()} saved onUpdate={onUpdate} onPoliticalActivity={vi.fn()} onNotice={vi.fn()} onAdvance={vi.fn()} />;
}
const withMessages = (): Career => ({ ...base(), socialMedia: socialMediaSchema.parse({
  inbox: [{ id: 'letter', date: '2026-01-01', threadId: 'parents', from: 'Family', role: 'Parent', kind: 'family', text: 'How have you been?', read: false }],
  notifications: [{ id: 'mention', date: '2026-01-01', kind: 'mention', author: 'The Courier', text: 'Voters are discussing your platform.', read: false }],
}) });
describe('Dashboard attention navigation', () => {
  it('opens rest directly from low energy without changing the saved career', () => {
    const c = base(); if (!c.life) throw new Error('Missing life');
    const career = { ...c, actions: 15, life: { ...c.life, energy: 15 } }, update = vi.fn();
    const before = JSON.stringify(career);
    render(<Harness career={career} onUpdate={update} />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Needs attention' })).getByRole('button', { name: /Low energy/ }));
    expect(screen.getByRole('meter', { name: 'Energy' })).toHaveAttribute('aria-valuenow', '15');
    expect(update).not.toHaveBeenCalled();
    expect(JSON.stringify(career)).toBe(before);
  });
  it('opens health care directly', () => {
    render(<Harness career={{ ...base(), health: 25 }} />);
    fireEvent.click(screen.getByRole('button', { name: /Low health/ }));
    expect(screen.getByRole('meter', { name: 'Health' })).toHaveAttribute('aria-valuenow', '25');
  });
  it('does not alert for S notifications or unread messages', () => {
    const alerts = dashboardAlerts(withMessages());
    expect(alerts.some(a => a.id === 'notifications')).toBe(false);
    expect(alerts.some(a => a.id === 'inbox')).toBe(false);
  });
  it('does not show handled legal cases or managed scandals', () => {
    const c = base();
    expect(dashboardAlerts(c).some(a => a.destination === 'legal' || a.destination === 'scandals')).toBe(false);
  });
});