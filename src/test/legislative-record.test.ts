import { describe, expect, it } from 'vitest';
import { ensureLegislativeDocket } from '@/lib/game/legislation';
import { resolveLegislativeDocket } from '@/lib/game/legislative-docket';
import { judgeLegislativeTerm, ineffectiveRecord } from '@/lib/game/legislative-record';
import { debateQuestionText, DO_NOTHING_QUESTION } from '@/lib/game/debates';
import type { Career } from '@/lib/game/career';
import { executive } from './executive-docket.test';

const seat = () => ensureLegislativeDocket(executive('house', '2028-04-01'));

describe('caucus co-sponsors', () => {
  it('blocks introduction below 30% caucus support', () => {
    const c = seat();
    const L = c.legislature!;
    const hostile: Career = { ...c, legislature: { ...L, lawmakers: L.lawmakers.map(l => ({ ...l, relationship: -20 })), backbench: L.backbench.map(b => ({ ...b, ideology: 100 })), bills: L.bills.map(b => ({ ...b, ideology: -100 })) } };
    const d = L.docket!;
    const r = resolveLegislativeDocket(hostile, { docketId: d.id, revision: d.revision, slot: 'priority', choice: 'introduce' });
    expect(r.ok).toBe(false);
  });
});

describe('ineffective legislator', () => {
  it('zero bills passed costs 10 reputation once and flags the record', () => {
    const c = { ...seat(), reputation: 40 };
    const n = judgeLegislativeTerm(c);
    expect(n.reputation).toBe(30);
    expect(ineffectiveRecord(n)).toBe(true);
    expect(judgeLegislativeTerm(n).reputation).toBe(30);
    expect(debateQuestionText(n, 1)).toBe(DO_NOTHING_QUESTION);
  });
  it('rotates AI colleague bills from both parties onto the docket', () => {
    let c = seat();
    for (const date of ['2028-07-01', '2028-10-01', '2029-01-01']) c = ensureLegislativeDocket({ ...c, date });
    const parties = new Set(c.legislature!.bills.filter(b => b.party !== null).map(b => b.party));
    expect(parties.size).toBe(2);
  });
});
