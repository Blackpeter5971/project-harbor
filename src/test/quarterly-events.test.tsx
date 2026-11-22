import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureApproval } from '@/lib/game/approval';
import { ensureTreasury, treasuryFunds } from '@/lib/game/budget';
import { financeOf, withFinance } from '@/lib/game/government-finance';
import type { GovEvent } from '@/lib/game/finance-schema';
import {
  activeEvents, declareEmergency, eventCost, eventResponses, eventsNeedingAttention, eventsTurn, freshEvents,
  respondToEvent, responsePlan, rollEvent,
} from '@/lib/game/quarterly-events';
import { EventsTab } from '@/components/game/events-panel';
import type { Result } from '@/lib/game/support';

afterEach(cleanup);

const holder = (id = 'mayor', relationships = 100): Career => ensureTreasury(ensureApproval({
  ...createCareer({ ...defaultDraft, name: 'Event Player', party: 'Democrat' }), date: '2028-04-01', money: 10000, reputation: 90, relationships,
  skills: { communication: 80, leadership: 100, knowledge: 80 }, publicOffice: true,
  office: { id, title: id, jurisdiction: 'Test City', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', party: 'Democrat', margin: 20 },
}));
const ev = (over: Partial<GovEvent> = {}): GovEvent => ({
  id: '2028-03-31|flood', catalogId: 'flood', name: 'Flash flooding', detail: 'Water.', kind: 'manageable', severity: 'high', date: '2028-04-01',
  remaining: 2, status: 'active', response: null, petitioned: false, emergency: false, pressure: -1.2, treasury: 0, happiness: 0, approval: 0,
  outcome: '', lastEnd: '2028-03-31', ...over,
});
const withEvent = (c: Career, e: GovEvent, eventEnd = '2028-03-31') => withFinance(c, { ...financeOf(c), events: [e, ...financeOf(c).events], eventEnd });
const take = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };

describe('event triggers', () => {
  it('rolls deterministically per tenure and quarter', () => {
    const c = holder();
    expect(rollEvent(c, '2028-06-30')).toEqual(rollEvent(c, '2028-06-30'));
  });
  it('never rolls a third event while two are active', () => {
    const c = withEvent(withEvent(holder(), ev()), ev({ id: 'x|tourism', catalogId: 'tourism', kind: 'positive' }));
    for (const end of ['2028-06-30', '2028-09-30', '2028-12-31', '2029-03-31']) expect(rollEvent(c, end)).toBeNull();
  });
  it('processes each quarter only once', () => {
    const c = withEvent(holder(), ev());
    const once = eventsTurn(c, '2028-04-01', '2028-06-30').career;
    expect(eventsTurn(once, '2028-04-01', '2028-06-30').career).toBe(once);
  });
  it('flags unanswered non-low crises for attention but not low ones', () => {
    expect(eventsNeedingAttention(withEvent(holder(), ev()))).toHaveLength(1);
    expect(eventsNeedingAttention(withEvent(holder(), ev({ severity: 'low' })))).toHaveLength(0);
  });
  it('lists events triggered by the latest settled quarter', () => {
    expect(freshEvents(withEvent(holder(), ev())).map(e => e.id)).toEqual(['2028-03-31|flood']);
    expect(freshEvents(withEvent(holder(), ev(), '2028-06-30'))).toHaveLength(0);
  });
});

describe('responses', () => {
  it('emergency funding charges the full cost from the treasury and shortens the event', () => {
    const c = withEvent(holder(), ev());
    const n = take(respondToEvent(c, ev().id, 'fund'));
    expect(treasuryFunds(n)).toBe(treasuryFunds(c) - eventCost(c, ev()));
    expect(activeEvents(n)[0]).toMatchObject({ response: 'fund', remaining: 1, pressure: 0 });
    expect(n.money).toBe(c.money);
  });
  it('deploy costs half and one action', () => {
    const c = withEvent(holder(), ev());
    const n = take(respondToEvent(c, ev().id, 'deploy'));
    expect(treasuryFunds(c) - treasuryFunds(n)).toBe(Math.round(eventCost(c, ev()) * 0.5));
    expect(n.actions).toBe(c.actions - 15);
  });
  it('limited action costs 20% and adds a quarter; ignore is free with a penalty', () => {
    expect(responsePlan(ev(), 'limited').remaining).toBe(3);
    expect(responsePlan(ev(), 'ignore').appr).toBeLessThan(0);
    const c = withEvent(holder(), ev());
    expect(eventResponses(c, ev().id).find(r => r.id === 'ignore')?.cost).toBe(0);
    expect(eventResponses(c, ev().id).find(r => r.id === 'limited')?.cost).toBe(Math.round(eventCost(c, ev()) * 0.2));
  });
  it('rejects a second response', () => {
    const n = take(respondToEvent(withEvent(holder(), ev()), ev().id, 'limited'));
    expect(respondToEvent(n, ev().id, 'fund').ok).toBe(false);
  });
  it('blocks responses the treasury cannot afford', () => {
    const c = withEvent(holder(), ev());
    const broke: Career = { ...c, treasury: { ...c.treasury!, balance: 0 } };
    expect(eventResponses(broke, ev().id).find(r => r.id === 'fund')?.disabled).toBe(true);
  });
});

describe('aid petitions', () => {
  it('offers aid only below the presidency', () => {
    expect(eventResponses(withEvent(holder('mayor'), ev()), ev().id).some(r => r.id === 'aid')).toBe(true);
    expect(eventResponses(withEvent(holder('president'), ev()), ev().id).some(r => r.id === 'aid')).toBe(false);
  });
  it('a petition is free, uses one action, and cannot be repeated', () => {
    const c = withEvent(holder('mayor'), ev());
    const n = take(respondToEvent(c, ev().id, 'aid'));
    expect(treasuryFunds(n)).toBe(treasuryFunds(c)); expect(n.actions).toBe(c.actions - 15);
    const e = activeEvents(n)[0]!;
    expect(e.petitioned).toBe(true);
    if (!e.response) expect(eventResponses(n, e.id).some(r => r.id === 'aid')).toBe(false);
    else expect(e.response).toBe('aid');
  });
});

describe('State of Emergency', () => {
  it('only critical crises qualify', () => {
    expect(declareEmergency(withEvent(holder(), ev()), ev().id).ok).toBe(false);
  });
  it('cuts response costs by 30%, shortens duration and adds economic friction', () => {
    const c = withEvent(holder(), ev({ severity: 'critical', remaining: 3 }));
    const n = take(declareEmergency(c, ev().id));
    expect(activeEvents(n)[0]).toMatchObject({ emergency: true, remaining: 2 });
    expect(eventResponses(n, ev().id).find(r => r.id === 'fund')?.cost).toBe(Math.round(eventCost(c, ev({ severity: 'critical' })) * 0.7));
    expect(financeOf(n).economy.business).toBe(financeOf(c).economy.business - 4);
    expect(declareEmergency(n, ev().id).ok).toBe(false);
  });
});

describe('turn progression', () => {
  it('unaddressed crises cost treasury and approval each quarter', () => {
    const c = withEvent(holder(), ev());
    const n = eventsTurn(c, '2028-04-01', '2028-06-30').career;
    const e = financeOf(n).events.find(x => x.id === ev().id)!;
    expect(e.remaining).toBe(1); expect(e.treasury).toBeLessThan(0); expect(e.approval).toBeLessThan(0);
  });
  it('resolved events record their outcome in history and survive a save', () => {
    const c = take(respondToEvent(withEvent(holder(), ev({ remaining: 1 })), ev().id, 'fund'));
    const n = eventsTurn(c, '2028-04-01', '2028-06-30').career;
    const e = financeOf(n).events.find(x => x.id === ev().id)!;
    expect(e.status).toBe('resolved'); expect(e.outcome).toBe('Recovered — well managed');
    expect(financeOf(parseCareer(JSON.stringify(n))!).events.find(x => x.id === ev().id)?.outcome).toBe('Recovered — well managed');
  });
  it('ignored crises end as mismanaged', () => {
    const c = take(respondToEvent(withEvent(holder(), ev({ remaining: 0 })), ev().id, 'ignore'));
    let n = c;
    for (const end of ['2028-06-30', '2028-09-30']) n = eventsTurn({ ...n, report: null }, '', end).career;
    expect(financeOf(n).events.find(x => x.id === ev().id)?.outcome).toBe('Mismanaged — lasting damage');
  });
});

describe('Events tab UI', () => {
  it('lists active events and confirms a chosen response with an impact preview', () => {
    const c = withEvent(holder(), ev());
    const results: Result[] = [];
    render(<EventsTab career={c} onResult={r => results.push(r)} />);
    const card = screen.getByRole('article', { name: 'Flash flooding' });
    expect(within(card).getByText('High')).toBeTruthy();
    expect(within(card).getByText('Manageable')).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Choose response' }));
    fireEvent.click(screen.getByRole('radio', { name: /Deploy city crews/ }));
    expect(screen.getByLabelText('Expected impact')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm response' }));
    expect(results[0]?.ok).toBe(true);
  });
  it('shows the State of Emergency button only for critical crises', () => {
    render(<EventsTab career={withEvent(holder(), ev({ severity: 'critical' }))} onResult={() => {}} />);
    expect(screen.getByRole('button', { name: 'Declare State of Emergency' })).toBeTruthy();
    cleanup();
    render(<EventsTab career={withEvent(holder(), ev())} onResult={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Declare State of Emergency' })).toBeNull();
  });
});
