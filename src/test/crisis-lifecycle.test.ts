import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { parseCareer, type Career } from '@/lib/game/career';
import { crisisLifecycleTurn, crisesTurn, crisisProtection } from '@/lib/game/crises';
import { crisisCareer } from './crisis-fixture';
import { respondToCrisis } from '@/lib/game/crisis-responses';
import { approveProject, publicProjects, publicProjectsTurn } from '@/lib/game/public-projects';
import { crisisRecord } from '@/lib/game/crisis-record';
import { campaignTurn, scores, takePoll, groupRel } from '@/lib/game/campaign';
import { advanceTurn as advanceGameTurn, nextMonth } from '@/lib/game/gameplay';

const end = (c: Career) => nextMonth(nextMonth(nextMonth(c.date)));
const reload = (c: Career) => { const n = parseCareer(JSON.stringify(c)); if (!n) throw Error('Invalid save'); return n; };
const quarter = (c: Career) => ({ ...crisisLifecycleTurn(c, c.date, end(c)), date: end(c) });

describe('Phase 5C crisis lifecycle', () => {
  it('decrements once per quarter across reloads and rejects overlapping retries', () => {
    const c = crisisCareer(), n = crisisLifecycleTurn(c, c.date, end(c));
    expect(n.crises[0]?.durationRemaining).toBe(2);
    const saved = reload(n);
    expect(crisisLifecycleTurn(saved, c.date, end(c))).toEqual(saved);
    const overlap = { ...saved, date: '2028-05-01' };
    expect(crisisLifecycleTurn(overlap, overlap.date, '2028-08-01')).toEqual(overlap);
    expect(quarter({ ...saved, date: end(c) }).crises[0]?.durationRemaining).toBe(1);
  });
  it('applies linear one-point neglect, escalates at two quarters and resolves at zero', () => {
    const c = crisisCareer(), first = quarter(c), second = quarter(reload(first)), third = quarter(reload(second));
    expect(first.approval?.overall).toBe((c.approval?.overall ?? 0) - 1);
    expect(second.approval?.overall).toBe((c.approval?.overall ?? 0) - 2);
    expect(second.crises[0]?.status).toBe('escalated');
    expect(third.crises[0]).toMatchObject({ status: 'resolved', durationRemaining: 0, outcome: 'neglected', resolutionDate: '2029-01-01' });
    expect(third.approval?.overall).toBe((c.approval?.overall ?? 0) - 3);
    expect(quarter(third).approval).toEqual(third.approval);
  });
  it('caps aggregate quarterly crisis drag at two points, including severe crises', () => {
    const c = crisisCareer(), p = c.crises[0]; if (!p) throw Error('Missing crisis');
    const n = quarter({ ...c, crises: [{ ...p, severity: 3 }, { ...p, id: 'other', type: 'health', severity: 3 }] });
    expect(n.approval?.overall).toBe((c.approval?.overall ?? 0) - 2);
  });
  it('does not age new/future/foreign crises or penalize non-officeholders', () => {
    const c = crisisCareer(), p = c.crises[0]; if (!p) throw Error('Missing crisis');
    for (const n of [{ ...c, office: null }, { ...c, crises: [{ ...p, turnCreated: end(c), lastProcessed: end(c) }] }, { ...c, crises: [{ ...p, tenure: 'foreign' }] }]) {
      const settled = crisisLifecycleTurn(n, c.date, end(c)); expect(settled.crises).toEqual(n.crises); expect(settled.approval).toEqual(n.approval);
    }
  });
  it('processes the final held quarter and rejects non-quarterly intervals', () => {
    const c = crisisCareer(); if (!c.office) throw Error('Missing office');
    expect(quarter({ ...c, office: { ...c.office, termEnd: end(c) } }).crises[0]?.durationRemaining).toBe(2);
    expect(crisisLifecycleTurn(c, c.date, '2028-05-01')).toBe(c);
  });
  it('resolves investment with one loyalty gain and a permanent talking point, not a repeated payment', () => {
    const c = crisisCareer(), r = respondToCrisis(c, 'test-crisis', 'invest'); if (!r.ok) throw Error(r.message);
    const n = quarter(r.career);
    expect(n.crises[0]).toMatchObject({ status: 'resolved', outcome: 'managed' });
    expect(groupRel(n, 'suburban')).toBe(groupRel(c, 'suburban') + 1);
    expect(crisisRecord(n).talkingPoints).toEqual(['Resolved Water supply disruption']);
    expect(quarter(reload(n)).groups).toEqual(n.groups);
    expect(n.treasury).toEqual(r.career.treasury); expect(n.money).toBe(c.money);
  });
  it('targeted and negotiated crises persist for their selected durations without neglect drag', () => {
    for (const id of ['targeted', 'negotiate']) {
      const c = crisisCareer(), r = respondToCrisis(c, 'test-crisis', id); if (!r.ok) throw Error(r.message);
      const n = quarter(r.career); expect(n.approval).toEqual(r.career.approval);
      expect(n.crises[0]?.durationRemaining).toBe((r.career.crises[0]?.durationRemaining ?? 0) - 1);
    }
  });
  it('delay prolongs but still terminates after four quarters', () => {
    const r = respondToCrisis(crisisCareer(), 'test-crisis', 'delay'); if (!r.ok) throw Error(r.message);
    let n = r.career; for (let i = 0; i < 4; i++) n = quarter(reload(n));
    expect(n.crises[0]).toMatchObject({ status: 'resolved', outcome: 'neglected', durationRemaining: 0 });
  });
  it.each(['utility_failure', 'natural_disaster'] as const)('%s delays construction one turn without spending or permanent pause', type => {
    const c = crisisCareer('mayor', type), r = approveProject(c, 'transportation'); if (!r.ok) throw Error(r.message);
    const delayed = crisisLifecycleTurn(r.career, c.date, end(c));
    const settled = publicProjectsTurn(delayed, c.date, end(c));
    expect(publicProjects(settled)[0]).toMatchObject({ progress: 0, constructionSpent: 0, expectedCompletionDate: '2029-01-01', lastProcessedEnd: end(c) });
    expect(settled.treasury).toEqual(r.career.treasury);
    const next = { ...settled, date: end(c) }, advanced = publicProjectsTurn(crisisLifecycleTurn(next, next.date, end(next)), next.date, end(next));
    expect(publicProjects(advanced)[0]?.progress).toBe(50);
  });
  it('completed related projects protect future crises but unrelated/unfinished projects do not', () => {
    const r = approveProject(crisisCareer(), 'water'); if (!r.ok || !r.career.city) throw Error('Missing project');
    expect(crisisProtection(r.career, 'utility_failure')).toBe(0);
    const c = { ...r.career, city: { ...r.career.city, publicProjects: r.career.city.publicProjects.map(p => ({ ...p, status: 'completed' as const, completionDate: cDate })) } };
    expect(crisisProtection(c, 'utility_failure')).toBe(1); expect(crisisProtection(c, 'health')).toBe(0);
    let found = false;
    for (let i = 0; i < 300; i++) {
      const base = { ...c, character: { ...c.character, name: `Protection ${i}` }, crises: [], crisisGeneration: { lastProcessed: '', nextEligibleTurn: '' } };
      const protectedTurn = crisesTurn(base, base.date, end(base));
      if (protectedTurn.crises[0]?.type !== 'utility_failure') continue;
      const unprotected = crisesTurn({ ...base, city: { ...base.city, publicProjects: [] } }, base.date, end(base));
      if (unprotected.crises[0]?.type !== 'utility_failure') continue;
      expect(protectedTurn.crises[0].severity).toBeLessThanOrEqual(unprotected.crises[0].severity);
      expect(protectedTurn.crises[0].durationRemaining).toBeLessThan(unprotected.crises[0].durationRemaining); found = true; break;
    }
    expect(found).toBe(true);
  });
  it('lifecycle watermarks do not suppress generation evaluation', () => {
    const c = crisisCareer(), n = crisisLifecycleTurn(c, c.date, end(c)), generated = crisesTurn(n, c.date, end(c));
    expect(generated.crisisGeneration.lastProcessed).toBe(end(c));
    expect(generated.crises[0]?.durationRemaining).toBe(2);
  });
  it('locks legacy city construction for the affected quarter too', () => {
    const r = approveProject(crisisCareer(), 'water'); if (!r.ok || !r.career.city) throw Error('Missing city');
    const c = { ...r.career, city: { ...r.career.city, projects: [{ id: 'legacy', title: 'Bridge repair', cost: 100000, progress: 20, status: 'active' as const, lastProcessed: cDate }] } };
    const n = advanceTurn(c).career;
    expect(n.city?.projects[0]).toMatchObject({ progress: 20, lastProcessed: end(c) });
  });
  it('bounds the permanent election score and excludes foreign crisis records', () => {
    const c = crisisCareer(), p = c.crises[0]; if (!p) throw Error('Missing crisis');
    expect(crisisRecord({ ...c, crises: Array.from({ length: 10 }, (_, i) => ({ ...p, id: String(i), status: 'escalated' as const })) }).score).toBe(-4);
    expect(crisisRecord({ ...c, crises: Array.from({ length: 10 }, (_, i) => ({ ...p, id: String(i), status: 'resolved' as const, outcome: 'managed' as const })) }).score).toBe(2);
    expect(crisisRecord({ ...c, crises: [{ ...p, tenure: 'foreign' }] }).score).toBe(0);
  });
  it('opponents can attack a trailing player over neglected crises without creating crisis articles', () => {
    const base = crisisCareer(); if (!base.campaign) throw Error('Missing campaign');
    let found = false;
    for (let i = 0; i < 100; i++) {
      const c = { ...base, character: { ...base.character, name: `Attack ${i}` }, campaign: { ...base.campaign, startDate: base.date, lastProcessedEnd: base.date, electionDate: '2031-11-01', polls: [{ date: base.date, shares: { [`Attack ${i}`]: 1, ...Object.fromEntries(base.campaign.opponents.map(x => [x.name, 40])) } }] } };
      const n = campaignTurn(c, c.date, end(c));
      if (!n.lines.some(l => l.includes('attacked you over Water supply disruption'))) continue;
      expect(n.career.campaign?.attack).toBeTruthy();
      expect(n.stories.some(s => s.tag === 'opponent' && s.h.includes('goes on the attack'))).toBe(false);
      expect(campaignTurn(reload(n.career), c.date, end(c)).lines).toEqual([]);
      found = true; break;
    }
    expect(found).toBe(true);
  });
  it('general polls include bounded crisis records while primaries remain unchanged', () => {
    const c = crisisCareer(); if (!c.campaign) throw Error('Missing campaign');
    const clean = { ...c, crises: [] };
    expect(scores(c, c.campaign)[c.character.name]).toBe((scores(clean, c.campaign)[c.character.name] ?? 0) - 1);
    const poll = takePoll(c, c.campaign, c.date); expect(poll.crisisRecord?.score).toBe(-1);
    expect(Object.values(poll.shares).reduce((a, b) => a + b, 0)).toBe(100);
    expect(scores(c, { ...c.campaign, phase: 'primary' })).toEqual(scores(clean, { ...c.campaign, phase: 'primary' }));
    expect(reload({ ...c, campaign: { ...c.campaign, polls: [poll] } }).campaign?.polls[0]?.crisisRecord).toEqual(poll.crisisRecord);
  });
  it('retains crisis performance after office departure and in election results', () => {
    const c = crisisCareer(); if (!c.office || !c.campaign) throw Error('Missing office/campaign');
    const departed = { ...c, office: null, termHistory: [{ office: c.office, ended: c.date, reason: 'term ended' as const, government: null }] };
    expect(crisisRecord(departed).score).toBe(-1);
    const race = { ...departed, campaign: { ...c.campaign, electionDate: '2028-05-01', startDate: c.date, lastProcessedEnd: c.date, polls: [], volunteers: 100 } };
    const result = campaignTurn(race, c.date, end(c)).career;
    expect(result.elections[0]?.crisisRecord?.score).toBe(-1);
    expect(reload(result).elections[0]?.crisisRecord).toEqual(result.elections[0]?.crisisRecord);
  });
  it('integrates lifecycle before construction/polling and locks report continuation', () => {
    const c = crisisCareer(); if (!c.campaign) throw Error('Missing campaign');
    const ready = { ...c, campaign: { ...c.campaign, startDate: c.date, lastProcessedEnd: c.date, electionDate: '2031-11-01', polls: [] } };
    const n = advanceTurn(ready).career;
    expect(n.crises[0]?.durationRemaining).toBe(2); expect(n.campaign?.polls.at(-1)?.crisisRecord?.score).toBe(-1);
    expect(advanceTurn(reload(n)).career).toEqual(reload(n));
  });
});
const cDate = '2028-01-01';
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
