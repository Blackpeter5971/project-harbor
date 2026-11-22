import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer } from '@/lib/game/career';
import { launchCampaign, publishEdition } from '@/lib/game/campaign';
import { advanceTurn } from '@/lib/game/gameplay';

const base = () => createCareer({ ...defaultDraft, name: 'Alex Morgan', portrait: 3 });
const launch = () => {
  const result = launchCampaign({ ...base(), date: '2027-07-01', experience: 100, reputation: 40, money: 5000, skills: { communication: 30, leadership: 30, knowledge: 30 } }, 'council', 'A stronger city', 'grassroots');
  if (!result.ok || !result.career.campaign) throw new Error('Campaign missing');
  return result.career;
};

describe('Saved newspaper snapshots', () => {
  it('puts election outcomes ahead of campaign, finance and scandal coverage', () => {
    const first = advanceTurn(launch()).career;
    const last = advanceTurn({ ...first, report: null, pendingEvent: null, newspaperPending: false }).career;
    expect(last.news[0]?.stories[0]?.tag).toBe('election');
    expect(last.news[0]?.date).toBe('2028-01-01');
    expect(last.news[0]?.stories[0]?.body).toContain('Alex Morgan');
  });
  it('prioritizes a five-point polling swing above fundraising and allegations', () => {
    const before = launch();
    if (!before.campaign) throw new Error('Campaign missing');
    const oldPoll = { date: before.date, shares: { 'Alex Morgan': 20, Undecided: 80 } };
    const after = { ...before, campaign: { ...before.campaign, polls: [oldPoll, { date: '2027-10-01', shares: { 'Alex Morgan': 25, Undecided: 75 } }] } };
    const edition = publishEdition(after, { ...before, campaign: { ...before.campaign, polls: [oldPoll] } }, before.date, '2027-10-01', [{ h: 'Fundraising', sub: 'Recorded gifts', body: 'Donations received.', tag: 'finance' }, { h: 'Allegation', sub: 'Unproven', body: 'Review ongoing.', tag: 'scandal' }]);
    expect(edition.news[0]?.stories[0]?.tag).toBe('polls');
    expect(edition.news[0]?.stories[0]?.portrait).toBe(3);
    expect(edition.news[0]?.stories[0]?.subject).toBe('Alex Morgan');
  });
  it('saves campaign launch subject and portrait, without awarding fictional endorsements', () => {
    const after = advanceTurn(launch()).career;
    const launchStory = after.news[0]?.stories.find(s => s.tag === 'campaign');
    expect(launchStory?.subject).toBe('Alex Morgan');
    expect(launchStory?.portrait).toBe(3);
    expect(after.news[0]?.stories.filter(s => s.subject === 'Alex Morgan' && s.tag === 'groups')).toHaveLength(0);
    expect(parseCareer(JSON.stringify(after))?.news).toEqual(after.news);
  });
  it('returns an existing edition unchanged, including queued future stories', () => {
    const before = base();
    const first = advanceTurn(launch()).career;
    const withQueue = { ...first, newsQueue: [{ h: 'Later story', sub: 'Pending', body: 'Next quarter.', tag: 'party' }] };
    expect(publishEdition(withQueue, before, first.news[0]!.id, first.news[0]!.date, [])).toBe(withQueue);
  });
  it('publishes no edition on a quiet turn with no reportable player event', () => {
    const quiet = advanceTurn({ ...base(), job: { id: 'retail', since: '2026-01-01' } }).career;
    expect(quiet.news).toHaveLength(0);
    expect(quiet.newspaperPending).toBe(false);
    expect(quiet.newsQueue).toHaveLength(0);
  });
  it('publishes an edition for a campaign launch and sets the pending flag', () => {
    const after = advanceTurn(launch()).career;
    expect(after.news[0]?.stories.some(s => s.tag === 'campaign')).toBe(true);
    expect(after.newspaperPending).toBe(true);
  });
  it('never repeats a headline already printed in an earlier edition', () => {
    const first = advanceTurn(launch()).career;
    const printed = new Set(first.news.flatMap(e => e.stories.map(s => s.h)));
    const second = advanceTurn({ ...first, report: null, pendingEvent: null, newspaperPending: false }).career;
    for (const edition of second.news) for (const s of edition.stories) {
      if (edition.id !== first.news[0]?.id) expect(printed.has(s.h)).toBe(false);
    }
  });
  it('loads old saves and persists an interrupted newspaper phase', () => {
    const old: Record<string, unknown> = { ...base() };
    delete old['newspaperPending'];
    expect(parseCareer(JSON.stringify(old))?.newspaperPending).toBe(false);
    expect(parseCareer(JSON.stringify({ ...base(), newspaperPending: true }))?.newspaperPending).toBe(true);
  });
});