import { completedDocketFixture } from './docket-fixture';
import { initializeDocket } from '@/lib/game/docket-schema';
import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { ensureApproval } from '@/lib/game/approval';
import { billAction, proposeLaw } from '@/lib/game/legislation';
import { federalAction, federalFunds, federalMeasure, federalState } from '@/lib/game/federal';
import { baselineSpend, proposeBudget, enactBudget } from '@/lib/game/budget';
import { continueAfterNewspaper, continueTurnReport, getEvent, resolveEvent, advanceTurn as advanceGameTurn } from '@/lib/game/gameplay';
import { getOfficeEvent, officeEventPool, prepareOfficeEvent } from '@/lib/game/office-events';
import { type Result, tenureKey } from '@/lib/game/support';
import { resignOffice } from '@/lib/game/campaign';

const holder = (id = 'president', strong = true): Career => ensureApproval({ ...createCareer({ ...defaultDraft, name: 'Federal Player', party: 'Democrat' }), date: '2028-04-01', money: 1000, publicOffice: true, reputation: strong ? 90 : 0, relationships: strong ? 90 : 0, skills: { communication: 80, leadership: strong ? 100 : 0, knowledge: 80 }, office: { id, title: id, jurisdiction: 'United States', party: 'Democrat', since: '2028-01-01', elected: '2027-11-01', termEnd: '2032-01-01', margin: strong ? 20 : 0 } });
const take = (r: Result) => { if (!r.ok) throw new Error(r.message); return r.career; };
const act = (c: Career, a: Parameters<typeof billAction>[2]) => { const id = c.bills[0]?.id; if (!id) throw new Error('Missing measure'); return take(billAction(c, id, a)); };

describe('Federal separation of powers', () => {
  it('requires House and Senate passage before presidential budget signing', () => {
    let c = take(proposeBudget(holder(), baselineSpend(holder()), 'hold'));
    c = act(c, 'consider'); c = act(c, 'vote');
    expect(c.bills[0]?.stage).toBe('under consideration'); expect(c.bills[0]?.chamberVotes[0]?.support.seats).toBe(435);
    expect(billAction(c, c.bills[0]?.id ?? '', 'approve').ok).toBe(false); expect(c.budget).toBeNull();
    c = act(c, 'vote'); expect(c.bills[0]?.stage).toBe('awaiting approval'); expect(c.bills[0]?.chamberVotes[1]?.support.seats).toBe(100);
    c = act(c, 'approve'); expect(c.budget?.spending).toEqual(baselineSpend(c)); expect(c.actions).toBe(25);
  });
  it('Congress blocks a presidential budget under opposition and cannot be bypassed', () => {
    const c = holder('president', false); if (!c.office || !c.approval) throw new Error('Missing office');
    c.office.party = 'Independent'; c.approval = { ...c.approval, overall: 5, independent: 5 };
    const n = act(act(take(proposeBudget(c, baselineSpend(c), 'hold')), 'consider'), 'vote');
    expect(n.bills[0]?.stage).toBe('rejected'); expect(n.budget).toBeNull();
    expect(billAction(n, n.bills[0]?.id ?? '', 'approve').ok).toBe(false);
    expect(federalAction(n, 'order', 'unfunded').ok).toBe(false);
  });
  it('congressional budget negotiation rejects spending beyond available revenue', () => {
    const c = holder('house');
    c.budget = { year: 2028, revenue: 0, taxes: 'hold', spending: { ...baselineSpend(c), services: 1e12 }, proposals: [] };
    expect(federalMeasure(c, 'budget').ok).toBe(false);
  });
  it('House district appropriations require both chambers and reserve public funds only on enactment', () => {
    const original = holder('house'); let c = take(federalMeasure(original, 'district'));
    c = act(act(act(c, 'consider'), 'vote'), 'vote'); expect(c.federalGovernment?.spent ?? 0).toBe(0);
    c = act(c, 'approve'); expect(c.bills[0]?.stage).toBe('passed'); expect(c.federalGovernment?.spent).toBe(c.bills[0]?.cost);
    expect(c.money).toBe(original.money); expect(c.city).toBeNull(); expect(c.ledger).toEqual([]);
    expect(federalMeasure(holder('senate'), 'district').ok).toBe(false);
  });
  it('Senate-sponsored bills start in Senate; amendments reset both chamber approvals', () => {
    let c = act(act(take(proposeLaw(holder('senate'), 'services', 'bill')), 'consider'), 'vote');
    expect(c.bills[0]?.chamberVotes[0]?.chamber).toBe('senate');
    c = act(c, 'amend'); expect(c.bills[0]?.chamberVotes).toEqual([]);
    c = act(c, 'vote'); expect(c.bills[0]?.stage).toBe('under consideration');
  });
  it('bipartisan deals improve support without passing a law or adding seats', () => {
    const c = take(federalAction(holder('senate'), 'deal'));
    expect(c.federalGovernment?.coalition).toBe(4); expect(c.relationships).toBe(92); expect(c.bills).toEqual([]); expect(c.actions).toBe(85);
  });
  it('nomination alone grants no office; Senate confirmation can fail or block', () => {
    let c = take(federalAction(holder(), 'nominate', 'Health Secretary'));
    expect(c.federalGovernment?.nominations[0]?.status).toBe('nominated'); expect(c.federalGovernment?.spent).toBe(0);
    c = take(federalAction(c, 'confirm', c.federalGovernment?.nominations[0]?.id ?? ''));
    expect(c.federalGovernment?.nominations[0]?.status).toBe('confirmed'); expect(c.federalGovernment?.nominations[0]?.support?.seats).toBe(100);
    let weak = take(federalAction(holder('president', false), 'nominate', 'Health Secretary'));
    weak = take(federalAction(weak, 'confirm', weak.federalGovernment?.nominations[0]?.id ?? ''));
    expect(weak.federalGovernment?.nominations[0]?.status).toBe('rejected'); expect(weak.federalGovernment?.spent).toBe(0);
    let senator = take(federalAction(holder('senate'), 'nominate', 'Secretary of State'));
    senator = take(federalAction(senator, 'block', senator.federalGovernment?.nominations[0]?.id ?? ''));
    expect(senator.federalGovernment?.nominations[0]?.status).toBe('rejected');
    expect(federalAction(holder('house'), 'nominate', 'Health Secretary').ok).toBe(false);
  });
  it('orders cannot create taxes, laws, or unappropriated spending', () => {
    const c = holder();
    expect(federalAction(c, 'order', 'newtax').ok).toBe(false); expect(federalAction(c, 'order', 'unfunded').ok).toBe(false);
    const n = take(federalAction(c, 'order', 'transparency'));
    expect(n.federalGovernment?.orders[0]?.authority).toContain('no new law or appropriation'); expect(n.bills).toEqual([]); expect(n.money).toBe(c.money);
    expect(federalAction(n, 'order', 'transparency').ok).toBe(false);
    const exhausted = { ...c, federalGovernment: { ...federalState(c), spent: federalFunds(c) } };
    expect(federalAction(exhausted, 'order', 'preparedness').ok).toBe(false);
    expect(federalAction(holder('house'), 'order', 'transparency').ok).toBe(false);
  });
  it('diplomacy changes standing but cannot enact treaties or spend', () => {
    const c = holder(), n = take(federalAction(c, 'diplomacy'));
    expect(n.federalGovernment?.diplomacy).toBe(45); expect(n.relationships).toBe(92); expect(n.bills).toEqual([]); expect(n.money).toBe(c.money);
  });
  it('legacy federal bills load but require both chambers before signing; saves and cleanup preserve prior data', () => {
    const c = holder(); const old: Record<string, unknown> = { ...c }; delete old['federalGovernment']; delete old['scandals'];
    const parsed = parseCareer(JSON.stringify(old)); expect(parsed?.federalGovernment).toBeNull(); expect(parsed?.scandals).toEqual([]);
    const n = take(federalMeasure(c, 'bill')); const b = n.bills[0]; if (!b) throw new Error('Missing bill');
    const legacy = { ...n, bills: [{ ...b, stage: 'awaiting approval' as const, chamberVotes: [] }] };
    expect(billAction(legacy, b.id, 'approve').ok).toBe(false);
    expect(act(legacy, 'vote').bills[0]?.stage).toBe('under consideration');
    expect(enactBudget({ ...n, bills: [{ ...b, stage: 'passed' }] }, { ...b, stage: 'passed', budget: { spending: baselineSpend(c), stance: 'hold' } }).ok).toBe(false);
    const nominated = take(federalAction(c, 'nominate', 'Health Secretary'));
    expect(parseCareer(JSON.stringify(nominated))).toEqual(initializeDocket(nominated));
    expect(take(resignOffice(nominated)).federalGovernment).toBeNull();
  });
});

describe('Plausible office crises and evidence', () => {
  it('only offers plausible office events and keeps ordinary citizens out', () => {
    expect(officeEventPool(holder('house'))).not.toContain('office:storm'); expect(officeEventPool(holder('senate'))).not.toContain('office:sanitation');
    expect(officeEventPool(holder('mayor'))).toContain('office:sanitation'); expect(officeEventPool(holder('governor'))).toContain('office:storm');
    expect(officeEventPool(createCareer({ ...defaultDraft, name: 'Citizen' }))).toEqual([]);
    expect(getOfficeEvent(holder('president'), 'office:sanitation')).toBeNull();
  });
  it('every offered choice changes a real rule value and never touches personal or campaign funds', () => {
    for (const office of ['council', 'mayor', 'stateLeg', 'governor', 'house', 'senate', 'president']) {
      const c = holder(office);
      for (const id of officeEventPool(c)) {
        const event = getOfficeEvent(c, id); if (!event) throw new Error('Missing event');
        expect(event.choices.length).toBeGreaterThanOrEqual(2);
        for (const option of event.choices.filter(o => !o.disabled)) {
          const input = continueAfterNewspaper({ ...c, pendingEvent: id }); const n = take(resolveEvent(input, option.id));
          expect(JSON.stringify([n.approval, n.relationships, n.bills, n.city, n.stateGovernment, n.federalGovernment])).not.toBe(JSON.stringify([input.approval, input.relationships, input.bills, input.city, input.stateGovernment, input.federalGovernment]));
          expect(n.money).toBe(c.money); expect(n.campaign).toEqual(c.campaign); expect(n.eventHistory.at(-1)?.choice).toBe(option.id);
          expect(resolveEvent(n, option.id).ok).toBe(false);
        }
      }
    }
  });
  it('legislative relief is only proposed, while executives can use existing public appropriations', () => {
    const legislator = continueAfterNewspaper({ ...holder('house'), pendingEvent: 'office:district' });
    const n = take(resolveEvent(legislator, 'fund')); expect(n.bills[0]?.stage).toBe('proposed'); expect(n.federalGovernment?.spent ?? 0).toBe(0);
    const mayor = continueAfterNewspaper({ ...holder('mayor'), pendingEvent: 'office:sanitation' });
    const funded = take(resolveEvent(mayor, 'fund')); expect(funded.city?.spent).toBe(getEvent(mayor)?.cost); expect(funded.approval?.overall).toBe((mayor.approval?.overall ?? 0) + 3);
  });
  it('insufficient funding disables expensive choices but leaves meaningful alternatives', () => {
    const c = holder(), input = continueAfterNewspaper({ ...c, federalGovernment: { ...federalState(c), spent: federalFunds(c) }, pendingEvent: 'office:storm' });
    expect(getEvent(input)?.choices.find(o => o.id === 'fund')?.disabled).toBe(true); expect(resolveEvent(input, 'fund').ok).toBe(false);
    expect(take(resolveEvent(input, 'coordinate')).relationships).toBe(92);
  });
  it('cooperation and denial cannot prove or clear allegations; evidence outcomes persist without rerolls', () => {
    const c = prepareOfficeEvent({ ...holder(), pendingEvent: 'office:ethics' });
    expect(c.scandals[0]?.status).toBe('alleged'); expect(c.scandals[0]?.finding).toBeNull();
    const presented = continueAfterNewspaper(c);
    expect(take(resolveEvent(presented, 'deny')).scandals[0]?.status).toBe('alleged');
    expect(take(resolveEvent(presented, 'disclose')).scandals[0]?.status).toBe('alleged');
    const reviewed = take(resolveEvent(presented, 'review'));
    expect(['cleared', 'proven']).toContain(reviewed.scandals[0]?.status); expect(reviewed.scandals[0]?.finding).toBeTruthy();
    const reload = parseCareer(JSON.stringify(presented)); if (!reload) throw new Error('Bad save');
    expect(take(resolveEvent(reload, 'review')).scandals).toEqual(reviewed.scandals);
    expect(resolveEvent(reviewed, 'review').ok).toBe(false);
  });
  it('office events obey report → newspaper → event and never rerun accounting', () => {
    const turned = advanceTurn(holder()).career;
    const pending = { ...turned, pendingEvent: 'office:storm', newspaperPending: true };
    expect(resolveEvent(pending, 'coordinate').ok).toBe(false);
    const reportDone = continueTurnReport(pending); expect(reportDone.eventEncounter).toBeNull();
    const presented = continueAfterNewspaper(reportDone); expect(presented.eventEncounter?.tenure).toBe(tenureKey(presented));
    expect(advanceTurn(presented).career).toEqual(presented);
    const n = take(resolveEvent(presented, 'coordinate')); expect(n.officePayHistory).toEqual(pending.officePayHistory); expect(n.money).toBe(pending.money);
    expect(parseCareer(JSON.stringify(n))).toEqual(initializeDocket(n));
  });
});
// Settlement tests start after the executive prerequisite docket.
function advanceTurn(c: Career) { return advanceGameTurn(completedDocketFixture(c)); }
