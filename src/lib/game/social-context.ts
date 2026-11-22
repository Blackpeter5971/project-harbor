import type { Career } from './career';
import type { SocialMessage } from './social-media';

/**
 * Context-aware S direct messages. Pure, browser-safe and type-only imports, so career.ts → social-media.ts
 * never pulls in heavier game modules. Each source event (an election result, a major scandal, a passed bill,
 * a completed public project) is keyed once in socialMedia.contextSent; a recency window keeps older saves
 * from receiving a flood of messages about past events.
 */
export const CONTEXT_WINDOW_MONTHS = 3;
export const MAX_CONTEXT_MESSAGES = 4;

const h32 = (t: string) => { let h = 2166136261; for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const pick = <T,>(list: readonly T[], seed: string): T => list[Math.floor(h32(seed) * list.length) % list.length]!;

/** 'YYYY-MM-01' minus n months. */
export function monthsBefore(date: string, n: number) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)) - 1 - n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}

const CHAIR = { threadId: 'elite-chair', from: 'Linda Okafor', role: 'State Party Chair' };
const STRATEGIST = { threadId: 'elite-strategist', from: 'Nora Castillo', role: 'Political Strategist' };

const BILL_GROUPS: Record<string, { from: string; role: string }> = {
  services: { from: 'Teresa Quinn', role: 'Union President' },
  business: { from: 'Victor Lang', role: 'Chamber of Commerce' },
  environment: { from: 'Clean Air Coalition', role: 'Advocacy group' },
  safety: { from: 'Neighborhood Watch Council', role: 'Community group' },
};
const PROJECT_GROUPS: Record<string, { from: string; role: string; what: string }> = {
  transportation: { from: 'Transit Riders Union', role: 'Commuter group', what: 'our commutes' },
  healthcare: { from: 'Nurses Association', role: 'Health workers', what: 'our patients' },
  education: { from: 'Parent-Teacher Council', role: 'Families group', what: 'our kids' },
  water: { from: 'Residents for Clean Water', role: 'Residents group', what: 'every household' },
  electricity: { from: 'Electrical Workers Local 12', role: 'Union local', what: 'our crews and customers' },
  housing: { from: 'Tenants Alliance', role: 'Housing group', what: 'families on the waiting list' },
};

type Person = { threadId: string; from: string; role: string; portrait: string; kind: SocialMessage['kind'] };

function circle(c: Career) {
  const s = c.life?.social;
  const live = (s?.contacts ?? []).filter(p => p.status !== 'estranged');
  const as = (p: { id: string; name: string; role: string; portrait: string }, kind: SocialMessage['kind']): Person => ({ threadId: p.id, from: p.name, role: p.role, portrait: p.portrait, kind });
  const find = (id: string) => live.find(p => p.archetypeId === id);
  const ally = find('confidant') ?? find('organizer');
  const mentor = find('mentor');
  const reporter = find('reporter');
  const family = s?.partner ? { ...s.partner, role: s.maritalStatus === 'married' ? 'Spouse' : 'Partner' } : find('parents') ?? find('sibling');
  return {
    ally: ally ? as(ally, 'friend') : null,
    mentor: mentor ? as(mentor, 'friend') : null,
    reporter: reporter ? as(reporter, 'press') : null,
    family: family ? as(family, 'family') : null,
  };
}
const elite = (p: { threadId: string; from: string; role: string }): Person => ({ ...p, portrait: '', kind: 'elite' });

/** New contextual messages for the turn [start, end), plus the event keys they consume. */
export function contextMessages(c: Career, start: string, end: string, sent: readonly string[]): { messages: SocialMessage[]; keys: string[] } {
  const since = monthsBefore(start, CONTEXT_WINDOW_MONTHS), me = c.character.name, first = me.split(' ')[0] ?? me;
  const recent = (d: string | null | undefined) => !!d && d >= since && d < end;
  const done = new Set(sent), keys: string[] = [], messages: SocialMessage[] = [];
  const people = circle(c);
  const press = { threadId: 'press-tribune', from: `${c.character.state} Tribune`, role: 'Investigative desk', portrait: '', kind: 'press' as const };
  const send = (key: string, who: Person, text: string) => {
    if (messages.length >= MAX_CONTEXT_MESSAGES) return;
    messages.push({ id: `${start}-ctx-${key}-${who.threadId}`, date: end, threadId: who.threadId, from: who.from, role: who.role, kind: who.kind, portrait: who.portrait, text, read: false, fromMe: false });
  };
  const claim = (key: string) => { if (done.has(key) || messages.length >= MAX_CONTEXT_MESSAGES) return false; done.add(key); keys.push(key); return true; };

  // 1. Election results resolved this turn.
  for (const e of c.elections.filter(x => x.stage !== 'ballot' && x.date >= start && x.date < end)) {
    const key = `election|${e.stage}|${e.office}|${e.date}`;
    if (!claim(key)) continue;
    const seed = `${me}|${key}`, race = e.stage === 'primary' ? `the ${e.title} primary` : `the ${e.title} race`;
    const winner = [...e.rows].sort((a, b) => b.pct - a.pct).find(r => r.name !== me)?.name ?? 'your opponent';
    const mine = e.rows.find(r => r.name === me)?.pct;
    if (e.won) {
      send(key, elite(CHAIR), pick([`Congratulations on winning ${race}. The party is proud — let’s talk priorities before you’re sworn in.`, `What a night. ${mine ? `${mine}% ` : ''}in ${race}. Call me tomorrow — there’s a lot to plan.`], seed));
      const close = people.family ?? people.ally;
      if (close) send(key, close, pick([`WE DID IT!! So proud of you, ${first}. Celebrate tonight, govern tomorrow 🎉`, `I knew you’d win. Dinner’s on me this weekend — no speeches allowed. 🥂`], seed + 'c'));
    } else {
      const ally = people.ally ?? people.family;
      if (ally) send(key, ally, pick([`I’m so sorry about ${race}, ${first}. Coffee tomorrow? No politics, just us. ☕`, `${winner} won the night, not the war. You ran a campaign to be proud of. Coffee this week?`, `Tough result. Take a breath — I’ll bring coffee Saturday and we’ll talk about what’s next.`], seed));
      send(key, elite(CHAIR), pick([`Losing ${race} stings, but your numbers built real goodwill. The party hasn’t forgotten you.`, `Hard night against ${winner}. Rest up — when you’re ready, let’s talk about the next race.`], seed + 'p'));
    }
  }

  // 2. Major scandals: severe, moderate or exploded allegations that are not cleared.
  for (const s of c.scandals.filter(x => x.status !== 'cleared' && (x.severity !== 'Minor' || x.phase === 'Exploded') && recent(x.date))) {
    const key = `scandal|${s.id}`;
    if (!claim(key)) continue;
    const seed = `${me}|${key}`;
    send(key, people.reporter ?? press, pick([`We’re running a story on “${s.title}”. Do you want to comment before publication? Our deadline is end of day.`, `Sources describe ${s.summary.replace(/\.$/, '').toLowerCase()}. Can you confirm or deny on the record?`, `Our readers deserve answers about “${s.title}”. Will you sit down for an interview this week?`], seed));
    const advisor = people.mentor ?? elite(STRATEGIST);
    send(key, advisor, pick([`Don’t feed this story. Get the facts out once, clearly, then go back to work.`, `Say less, but say it first. Pick your response and stick to it — wavering is what sinks people.`, `I’ve seen careers survive worse. Stay calm, be honest, and don’t argue with reporters online.`], seed + 'm'));
  }

  // 3. Passed bills: congratulations from the affected group.
  for (const b of c.bills.filter(x => x.stage === 'passed' && recent(x.history.at(-1)?.date ?? x.date))) {
    const key = `bill|${b.id}`;
    if (!claim(key)) continue;
    const g = BILL_GROUPS[b.policy] ?? BILL_GROUPS['services']!;
    send(key, elite({ threadId: `group-${b.policy}`, ...g }), pick([`On behalf of our members: thank you for getting “${b.title}” passed. People will feel this.`, `“${b.title}” is law. We noticed who fought for it — count on our support.`], `${me}|${key}`));
  }

  // 4. Completed public projects.
  const projects = [...(c.city?.publicProjects ?? []), ...(c.stateGovernment?.publicProjects ?? []), ...(c.federalGovernment?.publicProjects ?? [])];
  for (const p of projects.filter(x => x.status === 'completed' && recent(x.completionDate))) {
    const key = `project|${p.id}`;
    if (!claim(key)) continue;
    const g = PROJECT_GROUPS[p.category] ?? PROJECT_GROUPS['transportation']!;
    send(key, elite({ threadId: `group-${p.category}`, from: g.from, role: g.role }), pick([`The ${p.name} is finished — a real difference for ${g.what}. Thank you for seeing it through.`, `Ribbon-cutting energy! The ${p.name} delivered for ${g.what}. We’re grateful.`], `${me}|${key}`));
  }

  return { messages, keys };
}
