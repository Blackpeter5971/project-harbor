import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignPanel } from '@/components/game/campaign-panel';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { campaignAction, campaignTurn, launchCampaign } from '@/lib/game/campaign';

const eligible = () => ({ ...createCareer({ ...defaultDraft, name: 'Finance Player' }), date: '2027-07-01', money: 5000, experience: 100, reputation: 40, skills: { communication: 30, leadership: 30, knowledge: 30 } });
function launched(): Career {
  const result = launchCampaign(eligible(), 'council', 'Together for our city', 'grassroots');
  if (!result.ok) throw new Error(result.message);
  return result.career;
}

afterEach(cleanup);

describe('Campaign finance tab', () => {
  it('keeps carryover reserves separate from raised money through a UI contribution and reload', () => {
    const result = launchCampaign({ ...eligible(), warChest: 12500 }, 'council', 'Our city', 'grassroots');
    if (!result.ok) throw new Error(result.message);
    let saved = result.career;
    render(<CampaignPanel career={saved} onUpdate={c => { saved = c; }} onNotice={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Finance' }));
    fireEvent.click(screen.getByRole('button', { name: '+$500' }));
    const loaded = parseCareer(JSON.stringify(saved));
    expect(loaded?.campaign?.funds).toBe(13000);
    expect(loaded?.campaign?.raised).toBe(500);
    expect(loaded?.campaign?.donors).toBe(0);
    expect(loaded?.campaign?.txns).toEqual([
      { month: saved.date, label: 'Candidate self-funding', amount: 500 },
      { month: saved.date, label: 'Carried over from previous campaign', amount: 12500 },
    ]);
  });
  it('disables a spent fundraising call until the next saved turn without spending another action', () => {
    const first = campaignAction(launched(), 'fundraise');
    if (!first.ok) throw new Error(first.message);
    const update = vi.fn();
    const { rerender } = render(<CampaignPanel career={first.career} onUpdate={update} onNotice={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Fundraising calls/ }));
    expect(update).not.toHaveBeenCalled();
    expect(first.career.actions).toBe(70);
    const next = campaignTurn(first.career, first.career.date, '2027-10-01').career;
    const loaded = parseCareer(JSON.stringify({ ...next, actions: 75 }));
    if (!loaded) throw new Error('Invalid save');
    rerender(<CampaignPanel career={loaded} onUpdate={update} onNotice={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Fundraising calls/ }));
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.[0].actions).toBe(60);
  });
  it('does not submit an unaffordable ad action from the panel', () => {
    const update = vi.fn();
    const c = launched();
    render(<CampaignPanel career={c} onUpdate={update} onNotice={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Ad Studio' }));
    fireEvent.click(screen.getByRole('button', { name: /Air ad campaign/ }));
    expect(update).not.toHaveBeenCalled();
    expect(c.actions).toBe(85);
    expect(c.campaign?.funds).toBe(0);
  });
  it('settles capped donations and payroll once before a saved finance-tab contribution', () => {
    const c = launched();
    if (!c.campaign) throw new Error('Missing campaign');
    const input = { ...c, contacts: 1e6, campaign: { ...c.campaign, funds: 450, staff: 3 } };
    const paid = campaignTurn(input, c.date, '2027-10-01').career;
    const loaded = parseCareer(JSON.stringify(paid));
    if (!loaded) throw new Error('Invalid save');
    let saved = loaded;
    render(<CampaignPanel career={loaded} onUpdate={career => { saved = career; }} onNotice={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Finance' }));
    fireEvent.click(screen.getByRole('button', { name: '+$100' }));
    expect(saved.campaign?.funds).toBe(4150);
    expect(saved.campaign?.raised).toBe(4100);
    expect(saved.campaign?.spent).toBe(400);
    expect(saved.campaign?.staff).toBe(2);
    expect(saved.campaign?.txns.filter(t => t.label.startsWith('Staff payroll'))).toHaveLength(1);
    expect(campaignTurn(saved, c.date, '2027-10-01').career).toEqual(saved);
  });
  it('shows contribution presets and a preset transfer moves personal money into campaign funds without using an action', () => {
    let saved: Career | null = null;
    const notices: string[] = [];
    render(<CampaignPanel career={launched()} onUpdate={c => { saved = c; }} onNotice={m => notices.push(m)} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Finance' }));
    expect(screen.getByText(/Personal balance/)).toBeInTheDocument();
    for (const amt of ['$100', '$500', '$1,000', '$2,500']) {
      expect(screen.getByRole('button', { name: `+${amt}` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /All \(\$5,000\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+$100' }));
    expect(saved).not.toBeNull();
    const next = parseCareer(JSON.stringify(saved));
    expect(next?.money).toBe(4900);
    expect(next?.campaign?.funds).toBe(100);
    expect(next?.campaign?.txns[0]).toEqual({ month: next?.date, label: 'Candidate self-funding', amount: 100 });
    expect(notices[0]).toMatch(/Contributed \$100/);
  });
  it('disables presets above the personal balance and rejects a custom transfer over savings', () => {
    const poor = { ...launched(), money: 400 };
    render(<CampaignPanel career={poor} onUpdate={() => {}} onNotice={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Finance' }));
    expect(screen.getByRole('button', { name: '+$500' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+$1,000' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+$100' })).toBeEnabled();
    const input = screen.getByPlaceholderText('Custom amount') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '401' } });
    expect(screen.getByRole('button', { name: 'Transfer' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '400' } });
    expect(screen.getByRole('button', { name: 'Transfer' })).toBeEnabled();
  });
});
