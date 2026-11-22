import type { Career } from './career';
import type { ElectionResult } from './campaign';
import { applyActionApproval } from './approval';
import { shiftLoyalty } from './support-groups';
import type { Result } from './gameplay';

/** Post-election speech/transition choices. Saved on the newest ElectionResult so they apply once. */
export const EXECUTIVE_OFFICES = ['mayor', 'governor', 'president'];
export type TransitionOption = { id: string; label: string; hint: string };

export const victoryOptions: TransitionOption[] = [
  { id: 'unity', label: 'Bipartisan Unity', hint: '+3 approval, every bloc +2 loyalty' },
  { id: 'mandate', label: 'Partisan Mandate', hint: '+5 approval, labor & youth +4, business −3' },
  { id: 'technocrat', label: 'Technocratic Focus', hint: '+5 experience, +2 contacts' },
];
export const lossOptions: TransitionOption[] = [
  { id: 'pac', label: 'Found a Leadership PAC', hint: 'Keep campaign funds in war chest, +3 contacts (more volunteers next run), +2 reputation' },
  { id: 'concede', label: 'Gracious Concession', hint: '+2 reputation, +1 contacts' },
];

export function lossMargin(r: ElectionResult, me: string): number {
  const mine = r.rows.find(x => x.name === me), top = r.rows[0];
  return mine && top ? Math.abs(top.pct - mine.pct) : 100;
}

/** Options for the newest general election, or [] once a choice is saved / not eligible. */
export function transitionOptions(c: Career, r: ElectionResult | undefined = c.elections[0]): TransitionOption[] {
  if (!r || r !== c.elections[0] || r.stage !== 'general' || r.transitionChoice) return [];
  if (r.won) return EXECUTIVE_OFFICES.includes(r.office) ? victoryOptions : [];
  return lossMargin(r, c.character.name) < 5 ? lossOptions : [];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function chooseTransition(c: Career, choice: string): Result {
  const r = c.elections[0];
  const opt = transitionOptions(c).find(o => o.id === choice);
  if (!r || !opt) return { ok: false, message: 'This speech has already been given.' };
  let n: Career = { ...c, elections: [{ ...r, transitionChoice: choice }, ...c.elections.slice(1)] };
  const key = `transition|${r.date}|${r.office}`;
  if (choice === 'unity') { n = shiftLoyalty(applyActionApproval(n, key, 3, 'major', 'Victory speech: bipartisan unity'), { labor: 2, business: 2, veterans: 2, youth: 2, religious: 2, rural: 2 }, 'Unity victory speech'); }
  else if (choice === 'mandate') { n = shiftLoyalty(applyActionApproval(n, key, 5, 'major', 'Victory speech: partisan mandate'), { labor: 4, youth: 4, business: -3 }, 'Partisan victory speech'); }
  else if (choice === 'technocrat') n = { ...n, experience: r1(n.experience + 5), contacts: r1(n.contacts + 2) };
  else if (choice === 'pac') n = { ...n, contacts: r1(n.contacts + 3), reputation: clamp(n.reputation + 2) };
  else n = { ...n, reputation: clamp(n.reputation + 2), contacts: r1(n.contacts + 1) };
  return { ok: true, career: n, message: `${opt.label}: ${opt.hint}.` };
}
