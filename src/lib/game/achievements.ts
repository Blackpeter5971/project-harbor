import type { Career } from './career';
import { netWorthBreakdown } from './banking';

/** Achievements are derived from the saved career, never stored, so they cannot drift or replay. */
export type Achievement = { id: string; title: string; detail: string; unlocked: boolean };

export function achievements(c: Career): Achievement[] {
  const s = c.socialMedia;
  const won = c.elections.filter(e => e.won && e.stage !== 'primary');
  const passed = c.bills.filter(b => b.stage === 'passed').length;
  const subs = s?.tube?.subscribers ?? 0;
  const nw = netWorthBreakdown(c).total;
  const offices = new Set([c.office?.id, ...c.termHistory.map(t => t.office.id)].filter(Boolean) as string[]);
  const followers = s?.followers ?? 0;
  const approval = c.approval?.overall ?? 0;
  const list: Omit<Achievement, 'unlocked'>[] = [];
  const add = (id: string, title: string, detail: string, ok: boolean) => { list.push({ id, title, detail }); return ok; };
  const flags = [
    add('first-office', 'First Office Elected', 'Win your first general election.', won.length > 0),
    add('legislator', 'Legislative Champion', 'Pass 5 laws or measures.', passed >= 5),
    add('silver', 'Silver Creator', 'Reach 10,000 Crosstube subscribers.', subs >= 10_000),
    add('gold', 'Gold Creator', 'Reach 100,000 Crosstube subscribers.', subs >= 100_000),
    add('podcaster', 'On the Air', 'Publish a podcast episode.', (s?.podcasts?.episodes.length ?? 0) > 0),
    add('millionaire', 'Self-Made Millionaire', 'Reach a $1,000,000 net worth.', netWorthBreakdown(c).total >= 1_000_000),
    add('survivor', 'Scandal Survivor', 'Hold office after a scandal is cleared.', !!c.office && c.scandals.some(x => x.status === 'cleared')),
    add('married', 'Family First', 'Get married.', c.life?.social?.maritalStatus === 'married'),
    add('president', 'Commander in Chief', 'Become President.', c.office?.id === 'president'),
    add('mayor', 'City Hall', 'Serve as Mayor.', offices.has('mayor')),
    add('governor', 'Governor', 'Serve as Governor.', offices.has('governor')),
    add('house', 'Representative', 'Serve in the U.S. House.', offices.has('house')),
    add('senate', 'Senator', 'Serve in the U.S. Senate.', offices.has('senate')),
    add('triple-win', 'Proven Winner', 'Win 3 general elections.', won.length >= 3),
    add('landslide', 'Landslide', 'Win an election by 20+ points.', c.elections.some(e => e.won && e.stage !== 'primary' && (() => { const p = e.rows.map(r => r.pct).sort((a, b) => b - a); return (p[0] ?? 0) - (p[1] ?? 0) >= 20; })())),
    add('lawmaker-20', 'Master Lawmaker', 'Pass 20 laws or measures.', passed >= 20),
    add('two-terms', 'Second Term', 'Complete two terms in office.', c.termHistory.filter(t => t.ended).length >= 2),
    add('popular', 'Beloved Leader', 'Reach 70% approval in office.', !!c.office && approval >= 70),
    add('reputation', 'Household Name', 'Reach 100 reputation.', c.reputation >= 100),
    add('connected', 'Power Broker', 'Reach 100 relationships.', c.relationships >= 100),
    add('ten-million', 'Multi-Millionaire', 'Reach a $10,000,000 net worth.', nw >= 10_000_000),
    add('billionaire', 'Billionaire', 'Reach a $1,000,000,000 net worth.', nw >= 1_000_000_000),
    add('entrepreneur', 'Entrepreneur', 'Own a business.', c.businesses.length > 0),
    add('mogul', 'Business Mogul', 'Own 3 businesses.', c.businesses.length >= 3),
    add('homeowner', 'Homeowner', 'Own your home.', c.housing?.status === 'owning'),
    add('influencer', 'Influencer', 'Reach 100,000 followers on S.', followers >= 100_000),
    add('viral', 'Viral Star', 'Reach 1,000,000 followers on S.', followers >= 1_000_000),
    add('diamond', 'Diamond Creator', 'Reach 1,000,000 Crosstube subscribers.', subs >= 1_000_000),
    add('crisis', 'Crisis Manager', 'Resolve a crisis.', c.crises.some(x => x.status === 'resolved')),
    add('veteran', 'Political Veteran', 'Spend 20 years in your career.', c.age >= 42),
  ];
  return list.map((a, i) => ({ ...a, unlocked: flags[i]! }));
}
