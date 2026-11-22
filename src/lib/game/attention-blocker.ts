import type { Career } from './career';
import { activeCase } from './legal';
import { canRespond } from './scandal-responses';
import { isOpenCase } from './scandals';

/** Next-turn gate: a scheduled trial without a chosen strategy, or a fresh scandal awaiting a response, must be addressed first. */
export function attentionBlocker(c: Career): { to: 'legal' | 'scandals'; message: string } | null {
  if (c.legal?.prison) return null;
  const k = activeCase(c);
  if (k?.trial && !k.trial.verdict && !k.trial.strategy) return { to: 'legal', message: 'Your court trial needs a defense strategy before time can advance.' };
  if (c.scandals.some(s => isOpenCase(s) && canRespond(s))) return { to: 'scandals', message: 'A scandal needs your response this quarter before time can advance.' };
  return null;
}
