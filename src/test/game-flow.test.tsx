import { writeSigned } from '@/lib/game/save-integrity';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceTurn } from '@/lib/game/gameplay';
import { launchCampaign } from '@/lib/game/campaign';
import { Game } from '@/components/game/game';
import { SAVE_KEY, parseCareer, createCareer, defaultDraft } from '@/lib/game/career';
import { STORY_SAVE_KEY } from '@/lib/game/story-mode';
import { STORY_PLAY_ENABLED } from '@/components/game/story-menu';
// Pay/accounting tests isolate income from personal taxes (covered in taxes.test.ts).
vi.mock('@/lib/game/taxes', async (orig) => ({ ...(await orig<typeof import('@/lib/game/taxes')>()), collectTaxes: (c: unknown) => ({ career: c, notices: [] }) }));

// Salary/campaign accounting checks run rent-free; turn rent is covered in housing.test.ts.
vi.mock('@/lib/game/housing', async orig => ({ ...(await orig<typeof import('@/lib/game/housing')>()), collectRent: (career: unknown) => ({ career, notice: null, evicted: false }) }));
vi.mock('@/lib/game/life', async orig => ({ ...(await orig<typeof import('@/lib/game/life')>()), collectLiving: (career: unknown) => ({ career, notices: [] }) }));


beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Game navigation rules', () => {
  it('charges a paid activity once for a double click and persists the free-use limit', () => {
    const career = { ...createCareer({ ...defaultDraft, name: 'Activity Player' }), money: 1000 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(career));
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Politics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Political Activities' }));
    const study = screen.getByRole('button', { name: /Study politics/ });
    act(() => {
      fireEvent.click(study, { detail: 1 });
      fireEvent.click(study, { detail: 2 });
    });
    const paid = parseCareer(localStorage.getItem(SAVE_KEY));
    expect(paid?.money).toBe(500);
    expect(paid?.actions).toBe(90);
    expect(paid?.skills.knowledge).toBe(0.6);
    expect(paid?.ledger.filter(e => e.label === 'Study politics & leadership')).toHaveLength(1);
    const free = screen.getByRole('button', { name: /Support a community initiative/ });
    act(() => { fireEvent.click(free); fireEvent.click(free); });
    const saved = parseCareer(localStorage.getItem(SAVE_KEY));
    expect(saved?.actions).toBe(80);
    expect(saved?.freePoliticalActivityUsed).toBe(true);
    expect(saved?.money).toBe(500);
    cleanup();
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Politics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Political Activities' }));
    expect(screen.getByRole('button', { name: /Support a community initiative/ })).toBeDisabled();
    expect(parseCareer(localStorage.getItem(SAVE_KEY))).toEqual(saved);
  });
  it('processes loading → report → paper → saved event → dashboard without reprocessing on reload', async () => {
    vi.useFakeTimers();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...createCareer({ ...defaultDraft, name: 'Turn Player', party: 'Democrat' }), money: 1000, actions: 0, job: { id: 'retail', since: '2026-01-01' } }));
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(screen.getByRole('status', { name: 'Processing turn' })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    const processed = parseCareer(localStorage.getItem(SAVE_KEY));
    expect(processed?.date).toBe('2026-04-01');
    expect(processed?.money).toBe(3550);
    expect(processed?.actions).toBe(100);
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Turn report/);
    cleanup();
    writeSigned(localStorage, SAVE_KEY, JSON.stringify({ ...processed, pendingEvent: 'meeting' }));
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Turn report/);
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Party organizer invitation'); // quiet turn: no newspaper
    const encounter = parseCareer(localStorage.getItem(SAVE_KEY))?.eventEncounter;
    expect(encounter?.presented).toBe(true);
    cleanup();
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Party organizer invitation');
    fireEvent.click(screen.getByRole('button', { name: /Attend and speak/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const resolved = parseCareer(localStorage.getItem(SAVE_KEY));
    expect(resolved?.eventHistory).toHaveLength(1);
    expect(resolved?.eventHistory[0]?.choice).toBe('go');
    expect(resolved?.money).toBe(3550);
    expect(resolved?.actions).toBe(100);
    expect(resolved?.date).toBe('2026-04-01');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: 'Latest news' })).toHaveTextContent(resolved?.news[0]?.stories[0]?.h ?? 'No edition yet');
    cleanup();
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(parseCareer(localStorage.getItem(SAVE_KEY))).toEqual(resolved);
  });
  it('resumes the saved newspaper after a reload and dismisses it without advancing again', () => {
    const launched = launchCampaign({ ...createCareer({ ...defaultDraft, name: 'Alex Morgan' }), date: '2027-07-01', experience: 100, reputation: 40, money: 5000, skills: { communication: 30, leadership: 30, knowledge: 30 } }, 'council', 'A stronger city', 'grassroots');
    if (!launched.ok) throw new Error('Launch failed');
    const processed = advanceTurn(launched.career).career;
    const career = { ...processed, report: null, pendingEvent: null, newspaperPending: true };
    localStorage.setItem(SAVE_KEY, JSON.stringify(career));
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }));
    const saved = parseCareer(localStorage.getItem(SAVE_KEY));
    expect(saved?.newspaperPending).toBe(false);
    expect(saved?.date).toBe('2027-10-01');
    expect(saved?.actions).toBe(100);
    expect(saved?.news).toEqual(career.news);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });
  it('keeps category browsing free and saves political activity through the existing career', () => {
    const career = createCareer({ ...defaultDraft, name: 'Alex Morgan' });
    localStorage.setItem(SAVE_KEY, JSON.stringify(career));
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Politics' }));
    for (const category of ['Party & Influence', 'Campaigns & Elections', 'Political Groups & Endorsements']) {
      fireEvent.click(screen.getByRole('button', { name: category }));
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    }
    expect(parseCareer(localStorage.getItem(SAVE_KEY))).toEqual(career);
    fireEvent.click(screen.getByRole('button', { name: 'Political Activities' }));
    fireEvent.click(screen.getByRole('button', { name: /Support a community initiative/i }));
    const saved = parseCareer(localStorage.getItem(SAVE_KEY));
    expect(saved?.actions).toBe(90);
    expect(saved?.experience).toBeGreaterThan(career.experience);
    expect(saved?.money).toBe(career.money);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(parseCareer(localStorage.getItem(SAVE_KEY))).toEqual(saved);
  });
  it('retains choices backwards and only enables Continue after saving a created character', () => {
    render(<Game />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'New Career' }));
    fireEvent.click(screen.getByRole('button', { name: /Sandbox Mode/ }));
    fireEvent.change(screen.getByLabelText('Character name'), { target: { value: 'Alex Morgan' } });
    fireEvent.change(screen.getByLabelText('Home state'), { target: { value: 'Ohio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /Self-Made/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByRole('button', { name: /Self-Made/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByLabelText('Back'));
    expect(screen.getByLabelText('Character name')).toHaveValue('Alex Morgan');
    expect(screen.getByLabelText('Home state')).toHaveValue('Ohio');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Character' }));
    expect(parseCareer(localStorage.getItem(SAVE_KEY))?.character.background).toBe('Self-Made');
    expect(screen.getByRole('dialog', { name: 'Alex Morgan' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Begin career' }));
    expect(screen.getByRole('heading', { name: 'Alex Morgan' })).toBeInTheDocument();
    // A brand-new career has no Government tab until it qualifies for office or an appointment.
    expect(screen.getByRole('button', { name: 'Government' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Media' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Politics' }));
    expect(screen.getByRole('button', { name: 'Politics' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Return to main menu' }));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('starts a Story Mode career under its own save key without touching the sandbox save or coins', () => {
    const sandbox = { ...createCareer({ ...defaultDraft, name: 'Sandbox Player' }), money: 777 };
    localStorage.setItem(SAVE_KEY, JSON.stringify(sandbox));
    render(<Game />);
    fireEvent.click(screen.getByRole('button', { name: 'New Career' }));
    fireEvent.click(screen.getByRole('button', { name: /Story Mode/ }));
    // Landing page: scenario cards with metadata and a read-only coin balance.
    expect(screen.getByText('Enemy Across the Aisle')).toBeInTheDocument();
    const norm = (s: string) => (_: string | null, el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() === s;
    expect(screen.getAllByText(norm('75 min')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(norm('4 acts · 7 endings')).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('0 coins')).toBeInTheDocument();
    if (!STORY_PLAY_ENABLED) {
      expect(screen.getByText(/Story Mode is coming in the next update/)).toBeInTheDocument();
      expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /Begin this story/ })).not.toBeInTheDocument();
      expect(parseCareer(localStorage.getItem(SAVE_KEY))?.money).toBe(777);
      return;
    }
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: /Begin this story/ })[0]!);
    expect(screen.queryByText('Where do you come from?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Woman' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Story Player' } });
    fireEvent.click(screen.getByRole('button', { name: /Begin Story/ }));
    const story = parseCareer(localStorage.getItem(STORY_SAVE_KEY));
    expect(story?.mode).toBe('story');
    expect(story?.story?.scenarioId).toBe('enemy-across-the-aisle');
    expect(story?.story?.chapter).toBe(1);
    expect(story?.character.name).toBe('Story Player');
    expect(story?.character.sex).toBe('Female');
    // Sandbox save is untouched and the main-menu Continue still resumes it.
    expect(parseCareer(localStorage.getItem(SAVE_KEY))?.money).toBe(777);
    // Story Mode opens the cinematic stage with Senator Vance, not the sandbox screens.
    // Each scene opens with the narrator setting time and place before dialogue.
    expect(screen.getByText('Narrator')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tap to skip/ }));
    fireEvent.click(screen.getByRole('button', { name: /Step Inside/ }));
    expect(screen.getByText('Senator Julian Vance')).toBeInTheDocument();
    expect(story?.story?.session?.sceneId).toBe('act1_ch1_sc1');
    fireEvent.click(screen.getByRole('button', { name: 'Exit to story menu' }));
    expect(screen.getByRole('button', { name: /Continue your story/ })).toBeInTheDocument();
  });
});