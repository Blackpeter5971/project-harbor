import type { Career } from './career';

/** Legislative effectiveness: bills the player authored that passed during the current tenure. Cycle-free (type-only imports). */
export const LEGISLATIVE_OFFICES = ['council', 'stateLeg', 'house', 'senate'];
export const INEFFECTIVE_PENALTY = 10;
const PASSED = ['passed_house', 'passed_senate', 'awaiting_signature', 'enacted'];
const tenure = (c: Career) => (c.office ? `${c.office.id}|${c.office.jurisdiction}|${c.office.since}` : '');

export const isLegislator = (c: Career) => !!c.office && LEGISLATIVE_OFFICES.includes(c.office.id);

export function billsPassedThisTenure(c: Career): number {
  const key = tenure(c);
  if (!key) return 0;
  const L = c.legislature;
  const docket = L && L.tenure === key ? L.bills.filter(b => b.party === null && (PASSED.includes(b.status) || b.rollCalls.some(r => r.passed))).length : 0;
  const legacy = c.bills.filter(b => b.tenure === key && b.stage === 'passed').length;
  return docket + legacy;
}

export const ineffectiveRecord = (c: Career) => (c.legislativeRecord?.ineffective.length ?? 0) > 0;

/** Called once when a legislative term is archived: zero bills passed costs reputation and flags the record. */
export function judgeLegislativeTerm(c: Career): Career {
  if (!isLegislator(c) || billsPassedThisTenure(c) > 0) return c;
  const o = c.office!;
  const rec = c.legislativeRecord ?? { ineffective: [] };
  if (rec.ineffective.some(x => x.tenure === tenure(c))) return c;
  const note = `Ineffective Legislative Record: you passed no bills as ${o.title}. −${INEFFECTIVE_PENALTY} reputation.`;
  return {
    ...c, reputation: Math.max(0, c.reputation - INEFFECTIVE_PENALTY),
    legislativeRecord: { ineffective: [...rec.ineffective, { tenure: tenure(c), office: o.title, ended: c.date }] },
    log: [note, ...c.log].slice(0, 12),
    newsQueue: [...c.newsQueue, { h: `${c.character.name} leaves ${o.title} seat without passing a single bill`, sub: 'Critics call it a do-nothing record', body: `${c.character.name}'s term ended with no authored legislation passed. Rivals are expected to make it a campaign issue.`, tag: 'government', subject: c.character.name, priority: 1 }],
  };
}
