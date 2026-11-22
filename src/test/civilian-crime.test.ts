import { describe, expect, it } from 'vitest';
import { createCareer, defaultDraft, parseCareer, type Career } from '@/lib/game/career';
import { crimeSchema } from '@/lib/game/crime-schema';
import { commitCrime, arraign, crimeOf, crimeTurn, resolveCase, prepareDefense } from '@/lib/game/crime';
import { advanceTurn, doActivity, applyForJob, acceptOffer, continueTurnReport, continueAfterNewspaper, type Result } from '@/lib/game/gameplay';
import { isDetained, isIncarcerated, remainingTurns } from '@/lib/game/prison';
import { ballotRestriction } from '@/lib/game/conviction';
import { criminalRecord } from '@/lib/game/criminal-record';
import { petitionPardon, pardonEligibility } from '@/lib/game/pardons';

const base = (): Career => ({ ...createCareer({ ...defaultDraft, name: 'Justice Test', background: 'Wealthy Family', education: 'Business' }, () => 0.5), crime: crimeSchema.parse({ streetRep: 30 }) });
function ok(r: Result) { if (!r.ok) throw new Error(r.message); return r.career; }
function arrest(id: 'petty_theft' | 'street_fraud' | 'burglary' | 'smuggling') { return ok(commitCrime(base(), id, 0, 0)); }
function settle(c: Career) { const n = continueTurnReport(c); return n.newspaperPending ? continueAfterNewspaper(n) : n; }

describe('civilian crime and custody', () => {
  it('success credits only illicit cash and street reputation and cannot replay', () => {
    const c = base(), n = ok(commitCrime(c, 'petty_theft', 0, 1));
    expect(crimeOf(n).stash).toBeGreaterThan(0);
    expect(crimeOf(n).streetRep).toBe(32);
    expect(n.money).toBe(c.money);
    expect(n.warChest).toBe(c.warChest);
    expect(n.corruption).toBe(c.corruption);
    expect(n.actions).toBe(c.actions - 15);
    expect(commitCrime(n, 'petty_theft', 0, 1).ok).toBe(false);
  });
  it('failure opens immediate intake and cannot advance time until arraignment', () => {
    const n = arrest('petty_theft');
    expect(n.crime?.arrest?.stage).toBe('intake');
    expect(n.crime?.stash).toBe(0);
    expect(advanceTurn(n).career).toBe(n);
  });
  it('paid counsel debits personal cash once, not illicit or campaign funds', () => {
    const c = arrest('street_fraud'), n = ok(arraign(c, 'private', 'contest', 1));
    expect(n.money).toBe(c.money - 2500);
    expect(n.ledger.find(e => e.label.startsWith('Legal counsel'))?.amount).toBe(-2500);
    expect(n.crime?.stash).toBe(c.crime?.stash);
    expect(n.warChest).toBe(c.warChest);
    expect(arraign(n, 'private', 'contest', 1).ok).toBe(false);
  });
  it('bail at home leaves ordinary civilian employment and political activity available', () => {
    const n = ok(arraign(arrest('petty_theft'), 'public', 'ties', 1));
    expect(n.crime?.arrest?.custody).toBe('bail');
    expect(n.crime?.arrest?.bailPosted).toBe(true);
    expect(isDetained(n)).toBe(false);
    expect(applyForJob(n, 'retail').ok).toBe(true);
    expect(doActivity(n, 'community').ok).toBe(true);
  });
  it('police detention blocks outside work but allows defense preparation', () => {
    const n = ok(arraign(arrest('street_fraud'), 'public', 'contest', 1));
    expect(n.crime?.arrest?.custody).toBe('police');
    expect(isDetained(n)).toBe(true);
    expect(isIncarcerated(n)).toBe(false);
    expect(applyForJob(n, 'retail').ok).toBe(false);
    expect(prepareDefense(n, 2).ok).toBe(true);
  });
  it('remand immediately activates prison restrictions without entering a conviction', () => {
    const n = ok(arraign(arrest('smuggling'), 'public', 'contest', 1));
    expect(n.crime?.arrest?.custody).toBe('remand');
    expect(isIncarcerated(n)).toBe(true);
    expect(n.legal?.prison).toBeFalsy();
    expect(criminalRecord(n)).toHaveLength(0);
    expect(doActivity(n, 'community').ok).toBe(false);
    expect(applyForJob(n, 'retail').ok).toBe(false);
  });
  it('next turn resolves remand once, credits pretrial time and does not double-serve', () => {
    const c = ok(arraign(arrest('smuggling'), 'none', 'contest', 1));
    const n = advanceTurn(c).career;
    expect(n.date).toBe('2026-04-01');
    expect(n.crime?.arrest).toBeNull();
    expect(n.crime?.records[0]?.outcome).toBe('prison');
    const p = n.legal?.prison;
    if (!p) throw new Error('Expected custodial sentence');
    expect(p.quarters).toBe(4);
    expect(p.served).toBe(1);
    expect(remainingTurns(p)).toBe(3);
    expect(crimeTurn(n, n.date).career).toBe(n);
    const reloaded = parseCareer(JSON.stringify(settle(n)));
    if (!reloaded) throw new Error('Invalid save');
    expect(reloaded.crime?.records).toHaveLength(1);
    expect(advanceTurn(reloaded).career.legal?.prison?.served).toBe(2);
  });
  it('guilty plea sentences at arraignment and writes permanent fine/restitution record', () => {
    const c = arrest('petty_theft'), n = ok(arraign(c, 'public', 'plead', 1));
    expect(n.crime?.arrest).toBeNull();
    expect(n.crime?.records[0]?.outcome).toBe('fined');
    expect(n.crime?.records[0]?.restitution).toBe(c.crime?.arrest?.loss);
    expect(n.legal?.prison).toBeNull();
  });
  it('dismissal does not convict and refunds bail, and saved verdict cannot replay', () => {
    const n = ok(arraign(arrest('petty_theft'), 'firm', 'contest', 1));
    const a = n.crime?.arrest;
    if (!a) throw new Error('Expected case');
    const weak = { ...a, evidence: 0, defense: 100 };
    const c = { ...n, crime: { ...crimeOf(n), arrest: weak } };
    const result = resolveCase(c, weak, '2026-04-01', false).career;
    expect(result.crime?.records).toHaveLength(0);
    expect(result.money).toBe(n.money + a.bail);
    expect(resolveCase(result, weak, '2026-04-01', false).career).toBe(result);
  });
});

describe('persistent record clearance and executive pardon', () => {
  it('misdemeanor prevents sensitive hiring and offer acceptance but permits retail work', () => {
    const n = ok(arraign(arrest('petty_theft'), 'public', 'plead', 1));
    const application = ok(applyForJob(n, 'teller'));
    expect(application.applications.find(a => a.jobId === 'teller')?.status).toBe('rejected');
    expect(ok(applyForJob(n, 'retail')).applications.find(a => a.jobId === 'retail')?.status).toBe('offered');
    expect(acceptOffer({ ...n, applications: [{ jobId: 'teller', month: n.date, status: 'offered' }] }, 'teller').ok).toBe(false);
  });
  it('successful Governor pardon clears sentence and restores civilian life, keeping conviction history', () => {
    const n = ok(arraign(arrest('burglary'), 'public', 'plead', 1));
    const record = n.crime?.records[0];
    if (!record) throw new Error('Missing record');
    expect(isIncarcerated(n)).toBe(true);
    const r = { target: record.id, revision: crimeOf(n).revision };
    expect(pardonEligibility(n, record.id).authority).toBe('Governor');
    const p = ok(petitionPardon(n, r, 0));
    expect(p.legal?.prison).toBeNull();
    expect(isIncarcerated(p)).toBe(false);
    expect(p.crime?.records).toHaveLength(1);
    expect(p.crime?.records[0]?.pardoned).toBe(true);
    expect(ballotRestriction(p)).toBeNull();
    expect(applyForJob(p, 'retail').ok).toBe(true);
    expect(petitionPardon(p, r, 0).ok).toBe(false);
    expect(parseCareer(JSON.stringify(p))?.crime?.records[0]?.pardoned).toBe(true);
  });
  it('federal records go to President and clean conduct, legal merit and connections raise odds', () => {
    const n = ok(arraign(arrest('smuggling'), 'public', 'plead', 1));
    const record = n.crime?.records[0], legal = n.legal, p = legal?.prison;
    if (!record || !p || !legal) throw new Error('Missing sentence');
    const before = pardonEligibility(n, record.id);
    const after = pardonEligibility({ ...n, contacts: 100, relationships: 100, legal: { ...legal, prison: { ...p, prisonRep: 100, legalKnowledge: 100 } } }, record.id);
    expect(before.authority).toBe('President');
    expect(after.chance).toBeGreaterThan(before.chance);
  });
  it('denied petition cannot reroll in the same quarter and does not release custody', () => {
    const n = ok(arraign(arrest('smuggling'), 'public', 'plead', 1));
    const target = n.crime?.records[0]?.id;
    if (!target) throw new Error('Missing record');
    const denied = ok(petitionPardon(n, { target, revision: crimeOf(n).revision }, 1));
    expect(isIncarcerated(denied)).toBe(true);
    expect(denied.crime?.records[0]?.pardoned).toBe(false);
    expect(petitionPardon(denied, { target, revision: crimeOf(denied).revision }, 0).ok).toBe(false);
  });
});