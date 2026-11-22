import type { Career } from '@/lib/game/career';
import { initializeDocket } from '@/lib/game/docket-schema';

/** Other subsystems test settlement after the prerequisite decisions have
 * already finished. No rewards or costs are fabricated by this fixture.
 * Actual resolution and gating are exercised in executive-docket.test.ts. */
export function completedDocketFixture(c: Career): Career {
  // Preserve identity for continuation/replay tests and non-executive offices.
  if (c.report || c.newspaperPending || c.pendingEvent || c.eventEncounter || c.debate) return c;
  const n = initializeDocket(c), d = n.executiveDocket;
  if (!d || d.items.every(i => i.resolved)) return n;
  return { ...n, executiveDocket: { ...d, items: d.items.map(i => ({ ...i, resolved: true, choice: 'fixture', outcome: 'Previously resolved.' })) as typeof d.items } };
}